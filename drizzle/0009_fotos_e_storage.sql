-- ============================================================================
-- Fotos: regra de publicacao no banco, e o Storage trancado por dono
--
-- Duas coisas que estavam so no codigo passam a ser garantidas pelo banco:
--
--  1. Anuncio publicado precisa de um minimo de fotos. Antes, um UPDATE
--     manual no painel ou um caminho novo na aplicacao conseguia publicar
--     anuncio sem foto nenhuma.
--
--  2. Cada usuario mexe apenas na SUA pasta dentro do bucket de fotos.
--     A aplicacao ja checa o dono antes de qualquer upload (ver
--     src/lib/storage/actions.ts), mas essa checagem e codigo: se um dia
--     alguem escrever uma tela que fala com o Storage direto do navegador,
--     a politica abaixo e o que continua segurando.
-- ============================================================================

ALTER TABLE "space_images" ADD CONSTRAINT "space_images_position_positive" CHECK ("space_images"."position" >= 0);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 1. Minimo de fotos para publicar
-- ---------------------------------------------------------------------------

-- O numero vive em platform_settings, junto das taxas: mudar exigencia de
-- catalogo nao pode precisar de migracao nova.
INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('space.min_photos_to_publish', '3'::jsonb,
   'Minimo de fotos para um anuncio ser publicado. Recomendacao na interface e 5.', true)
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.min_photos_to_publish()
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (value #>> '{}')::integer FROM public.platform_settings
      WHERE key = 'space.min_photos_to_publish'),
    3
  )
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.guard_publish_requires_photos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  minimo integer := public.min_photos_to_publish();
  quantas integer;
BEGIN
  -- So interessa a transicao PARA publicado. Rascunho pode ter zero foto.
  IF NEW.status <> 'published' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'published' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO quantas FROM public.space_images WHERE space_id = NEW.id;

  IF quantas < minimo THEN
    RAISE EXCEPTION
      'anuncio publicado precisa de pelo menos % fotos (tem %)', minimo, quantas
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS spaces_publish_requires_photos ON public.spaces;
--> statement-breakpoint
CREATE TRIGGER spaces_publish_requires_photos
  BEFORE INSERT OR UPDATE ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.guard_publish_requires_photos();
--> statement-breakpoint

-- Apagar foto de anuncio publicado nao pode derrubar o anuncio abaixo do
-- minimo: o anuncio continuaria no ar, mais pobre, sem ninguem perceber.
CREATE OR REPLACE FUNCTION public.guard_delete_photo_of_published()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  minimo integer := public.min_photos_to_publish();
  situacao space_status;
  restantes integer;
BEGIN
  SELECT status INTO situacao FROM public.spaces WHERE id = OLD.space_id;

  -- Anuncio sendo apagado em cascata: nao ha o que proteger.
  IF situacao IS NULL OR situacao <> 'published' THEN
    RETURN OLD;
  END IF;

  SELECT count(*) - 1 INTO restantes
    FROM public.space_images WHERE space_id = OLD.space_id;

  IF restantes < minimo THEN
    RAISE EXCEPTION
      'anuncio publicado ficaria com % fotos, abaixo do minimo de %', restantes, minimo
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS space_images_keep_minimum ON public.space_images;
--> statement-breakpoint
CREATE TRIGGER space_images_keep_minimum
  BEFORE DELETE ON public.space_images
  FOR EACH ROW EXECUTE FUNCTION public.guard_delete_photo_of_published();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Bucket de fotos e politicas do Storage
--
-- Roda so onde existe o Storage do Supabase (schema `storage`). Em Postgres
-- puro — desenvolvimento e testes — o bloco avisa e segue: nao ha Storage
-- para configurar, e falhar aqui impediria de rodar a migracao localmente.
-- ---------------------------------------------------------------------------

DO $mp_storage$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'Schema storage ausente — pulando configuracao do bucket (normal fora do Supabase).';
    RETURN;
  END IF;

  -- Bucket PRIVADO. O acesso a foto e sempre por URL assinada, com validade
  -- curta, gerada no servidor. Nao existe URL publica permanente.
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'space-images', 'space-images', false, 8388608,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  )
  ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 8388608,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

  RAISE NOTICE 'Bucket space-images configurado: privado, 8 MB, jpeg/png/webp.';
END $mp_storage$;
--> statement-breakpoint

DO $mp_storage_pol$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'Schema storage ausente — pulando politicas do Storage.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE NOTICE 'Papel authenticated ausente — pulando politicas do Storage.';
    RETURN;
  END IF;

  /*
   * O caminho do arquivo e `<owner_id>/<space_id>/<uuid>.<ext>`, montado por
   * buildImagePath() em src/lib/storage/images.ts. A primeira pasta ser o id
   * do dono e o que permite escrever a regra aqui: cada um mexe no que esta
   * embaixo do proprio id, e em nada mais.
   *
   * Nao existe politica para o papel `anon`: visitante nao lista, nao le e
   * nao escreve nada no bucket. Quem le foto de anuncio publicado le pela
   * URL assinada que o servidor gera.
   */
  EXECUTE $pol$DROP POLICY IF EXISTS space_images_dono_le ON storage.objects$pol$;
  EXECUTE $pol$CREATE POLICY space_images_dono_le ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'space-images'
      AND (storage.foldername(name))[1] = auth.uid()::text
    )$pol$;

  EXECUTE $pol$DROP POLICY IF EXISTS space_images_dono_envia ON storage.objects$pol$;
  EXECUTE $pol$CREATE POLICY space_images_dono_envia ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'space-images'
      AND (storage.foldername(name))[1] = auth.uid()::text
    )$pol$;

  EXECUTE $pol$DROP POLICY IF EXISTS space_images_dono_substitui ON storage.objects$pol$;
  EXECUTE $pol$CREATE POLICY space_images_dono_substitui ON storage.objects
    FOR UPDATE TO authenticated
    USING (
      bucket_id = 'space-images'
      AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
      bucket_id = 'space-images'
      AND (storage.foldername(name))[1] = auth.uid()::text
    )$pol$;

  EXECUTE $pol$DROP POLICY IF EXISTS space_images_dono_apaga ON storage.objects$pol$;
  EXECUTE $pol$CREATE POLICY space_images_dono_apaga ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'space-images'
      AND (storage.foldername(name))[1] = auth.uid()::text
    )$pol$;

  RAISE NOTICE 'Politicas do bucket space-images aplicadas (4 politicas, por pasta do dono).';
END $mp_storage_pol$;
