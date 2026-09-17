-- ============================================================================
-- MyPlace — atualizacao do banco
--
-- COMO USAR
--   1. Abra o painel do Supabase do projeto MyPlace
--   2. SQL Editor > New query
--   3. Cole este arquivo INTEIRO e clique em Run
--
-- SEGURO DE RODAR MAIS DE UMA VEZ. Cada migracao so e aplicada se ainda nao
-- estiver registrada em drizzle.__drizzle_migrations.
--
-- Este arquivo tem SO as migracoes 9 em diante. Ele supoe que as
-- anteriores ja foram aplicadas — se este for um projeto novo, use
-- supabase/setup.sql, que traz o schema completo.
--
-- Ao terminar, a saida mostra quantas migracoes foram aplicadas agora e
-- quantas ja estavam no banco.
--
-- Gerado por scripts/build-supabase-setup.ts a partir de 1 migracoes
-- testadas contra um Postgres real. Nao edite a mao: altere src/db/schema/,
-- gere a migracao e rode este script de novo.
-- ============================================================================

-- O PostGIS do Supabase e instalado no schema "extensions", nao em "public".
-- Sem isto, o tipo geometry(Point,4326) e o cast ::geography nao sao
-- encontrados e a criacao das tabelas de espacos falha.
SET search_path = public, extensions;

-- Tabela de controle. Precisa existir antes das checagens abaixo.
CREATE SCHEMA IF NOT EXISTS drizzle;

CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);


-- ----------------------------------------------------------------------------
-- Migracao 9: 0009_fotos_e_storage  (11 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_9$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '4401e244007763ce3ae67f910d4179f32c196911d9bf9427a195cf1ed5e32eac'
  ) THEN
    RAISE NOTICE 'Migracao 9 (0009_fotos_e_storage) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_9_0$-- ============================================================================
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

-- `ADD CONSTRAINT` nao aceita IF NOT EXISTS para CHECK, entao a checagem e
-- explicita: assim rodar de novo nao estoura em "constraint already exists".
DO $mp_check_pos$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'space_images_position_positive'
  ) THEN
    ALTER TABLE public.space_images
      ADD CONSTRAINT space_images_position_positive CHECK (position >= 0);
  END IF;
END $mp_check_pos$;$mp_9_0$;

    EXECUTE $mp_9_1$-- ---------------------------------------------------------------------------
-- 1. Minimo de fotos para publicar
-- ---------------------------------------------------------------------------

-- O numero vive em platform_settings, junto das taxas: mudar exigencia de
-- catalogo nao pode precisar de migracao nova.
INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('space.min_photos_to_publish', '3'::jsonb,
   'Minimo de fotos para um anuncio ser publicado. Recomendacao na interface e 5.', true)
ON CONFLICT (key) DO NOTHING;$mp_9_1$;

    EXECUTE $mp_9_2$CREATE OR REPLACE FUNCTION public.min_photos_to_publish()
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
$$;$mp_9_2$;

    EXECUTE $mp_9_3$CREATE OR REPLACE FUNCTION public.guard_publish_requires_photos()
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
$$;$mp_9_3$;

    EXECUTE $mp_9_4$DROP TRIGGER IF EXISTS spaces_publish_requires_photos ON public.spaces;$mp_9_4$;

    EXECUTE $mp_9_5$CREATE TRIGGER spaces_publish_requires_photos
  BEFORE INSERT OR UPDATE ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.guard_publish_requires_photos();$mp_9_5$;

    EXECUTE $mp_9_6$-- Apagar foto de anuncio publicado nao pode derrubar o anuncio abaixo do
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
$$;$mp_9_6$;

    EXECUTE $mp_9_7$DROP TRIGGER IF EXISTS space_images_keep_minimum ON public.space_images;$mp_9_7$;

    EXECUTE $mp_9_8$CREATE TRIGGER space_images_keep_minimum
  BEFORE DELETE ON public.space_images
  FOR EACH ROW EXECUTE FUNCTION public.guard_delete_photo_of_published();$mp_9_8$;

    EXECUTE $mp_9_9$-- ---------------------------------------------------------------------------
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

  /*
   * Bucket PRIVADO. O acesso a foto e sempre por URL assinada, com validade
   * curta, gerada no servidor. Nao existe URL publica permanente.
   *
   * O bloco interno existe porque `storage.buckets` pertence ao papel
   * supabase_storage_admin. Se o papel que roda este SQL nao tiver privilegio,
   * a migracao NAO pode falhar por causa disso — ela avisa e segue, e a
   * configuracao se faz pelo painel.
   */
  BEGIN
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
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'Sem permissao para configurar o bucket por SQL. Faca no painel: Storage > space-images > Settings (privado, 8 MB, image/jpeg,image/png,image/webp).';
  END;
END $mp_storage$;$mp_9_9$;

    EXECUTE $mp_9_10$DO $mp_storage_pol$
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
  BEGIN
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

  /*
   * Mesma razao do bloco do bucket: `storage.objects` nao pertence ao papel
   * do SQL Editor em todo projeto. Sem privilegio, avisamos o que fazer no
   * painel em vez de derrubar a migracao inteira — e vale lembrar que a
   * autorizacao de verdade esta na aplicacao (src/lib/storage/actions.ts).
   * Estas politicas sao a segunda tranca.
   */
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'Sem permissao para criar politica em storage.objects. Crie no painel (Storage > Policies) restringindo cada usuario a pasta (storage.foldername(name))[1] = auth.uid()::text. Detalhes em docs/SETUP.md secao 1.5.';
  END;
END $mp_storage_pol$;$mp_9_10$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('4401e244007763ce3ae67f910d4179f32c196911d9bf9427a195cf1ed5e32eac', 1789677839915);

    RAISE NOTICE 'Migracao 9 (0009_fotos_e_storage) aplicada.';
  END IF;
END
$mp_bloco_9$;


-- ============================================================================
-- Resumo
-- ============================================================================
DO $mp_resumo$
DECLARE aplicadas integer;
BEGIN
  SELECT count(*) INTO aplicadas FROM drizzle.__drizzle_migrations;
  RAISE NOTICE '---';
  RAISE NOTICE 'Pronto: % de 10 migracoes registradas no banco.', aplicadas;
END
$mp_resumo$;

-- Confira o resultado com:
--
--   SELECT count(*) FROM pg_tables WHERE schemaname = 'public';   -- 22
--   SELECT key, value FROM platform_settings ORDER BY key;        -- taxas 3%+3%
--   SELECT PostGIS_Version();                                     -- extensao ativa
