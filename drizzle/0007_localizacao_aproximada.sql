-- ============================================================================
-- Localizacao aproximada, calculada pelo banco
--
-- O requisito de privacidade diz que o ponto exato nunca aparece em mapa
-- publico. Ate aqui isso dependia da aplicacao lembrar de preencher duas
-- colunas. Agora e o banco que garante: gravou `location`, ganhou
-- `approx_location` automaticamente.
--
-- Por que o deslocamento e DETERMINISTICO (derivado do id do espaco) e nao
-- sorteado: ponto sorteado a cada gravacao muda de lugar a cada visita da
-- pagina, e quem cruzar algumas leituras consegue triangular o centro real.
-- Deslocamento fixo por espaco nao vaza nada com repeticao.
-- ============================================================================

SET search_path = public, extensions;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.fuzz_location(
  exact_point geometry,
  seed uuid,
  radius_m integer DEFAULT 300
)
RETURNS geometry
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT CASE
    WHEN exact_point IS NULL THEN NULL
    ELSE ST_Project(
      exact_point::geography,
      -- Distancia entre 40% e 100% do raio. Nunca 0: deslocamento nulo
      -- entregaria o ponto exato de quem calhasse de cair no zero.
      radius_m * (0.4 + 0.6 * ((abs(hashtext(seed::text)) % 1000)::double precision / 1000.0)),
      -- Azimute derivado de um hash DIFERENTE, senao distancia e direcao
      -- ficariam correlacionadas e o padrao seria reversivel.
      radians((abs(hashtext(seed::text || ':azimute')) % 360)::double precision)
    )::geometry
  END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.sync_approx_location()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE raio integer;
BEGIN
  IF NEW.location IS NULL THEN
    NEW.approx_location := NULL;
    RETURN NEW;
  END IF;

  -- So recalcula quando o ponto exato muda. Assim o deslocamento de um anuncio
  -- publicado nao "pula" a cada edicao de titulo ou preco.
  IF TG_OP = 'UPDATE'
     AND OLD.location IS NOT NULL
     AND ST_Equals(OLD.location, NEW.location)
     AND NEW.approx_location IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE((value #>> '{}')::integer, 300) INTO raio
  FROM public.platform_settings WHERE key = 'privacy.approx_location_meters';

  NEW.approx_location := public.fuzz_location(NEW.location, NEW.id, COALESCE(raio, 300));
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER spaces_sync_approx_location
  BEFORE INSERT OR UPDATE OF location ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.sync_approx_location();
--> statement-breakpoint

-- Preenche o que ja existir (em banco novo nao faz nada).
UPDATE public.spaces
SET approx_location = public.fuzz_location(location, id, 300)
WHERE location IS NOT NULL AND approx_location IS NULL;
--> statement-breakpoint

-- Indice para a listagem publica: publicados, mais recentes primeiro.
CREATE INDEX IF NOT EXISTS "spaces_public_listing_idx"
  ON public.spaces (published_at DESC)
  WHERE status = 'published' AND deleted_at IS NULL;
