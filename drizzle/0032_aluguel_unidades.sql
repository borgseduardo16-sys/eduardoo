-- ===========================================================================
-- Parte 12 — unidades, aluguel temporário e contínuo, prazos e pagamentos.
--
-- As tabelas e colunas vêm da 0031 (gerada pelo Drizzle). Aqui fica o que o
-- Drizzle não descreve, na ordem em que precisa acontecer:
--   1. extensão btree_gist (restrição de exclusão por unidade);
--   2. regras dos grupos: pacotes válidos, resumo de preço do anúncio;
--   3. ocupação do anúncio por unidade (substitui "um aluguel por espaço");
--   4. travas de publicação, desativação e exclusão de unidade;
--   5. preço, horário e forma da reserva conferidos pelo banco;
--   6. a função que encerra o que venceu (reserva não paga, temporário que
--      acabou, pagamento pendente sem pagamento);
--   7. preenchimento dos dados que já existiam;
--   8. só então, as restrições que dependem desse preenchimento;
--   9. RLS e configurações.
--
-- Nota: valores novos de enum EXISTENTE (space_type, notification_type) não
-- são usados como literal aqui — o migrador roda tudo numa transação só e o
-- Postgres não deixa usar um valor acrescentado na mesma transação. Os tipos
-- NOVOS (rental_kind, booking_end_reason...) podem: foram criados inteiros.
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 2a. Pacotes de preço: em ordem, sem duração repetida, sem pacote mais
-- longo mais barato que um mais curto. Nunca duas regras para a mesma
-- duração, e nenhuma ambiguidade sobre qual pacote vale.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_unit_group_config()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  item jsonb;
  u numeric;
  p numeric;
  anterior_u numeric := 0;
  anterior_p numeric := 0;
  i integer := 0;
BEGIN
  NEW.name := trim(NEW.name);
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;

  IF NEW.allows_temporary AND NEW.temp_pricing_mode = 'packages' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(NEW.temp_packages) LOOP
      i := i + 1;
      IF jsonb_typeof(item) <> 'object'
         OR jsonb_typeof(item -> 'units') IS DISTINCT FROM 'number'
         OR jsonb_typeof(item -> 'priceCents') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'Pacote % sem duracao ou preco', i
          USING ERRCODE = 'check_violation', CONSTRAINT = 'space_unit_groups_packages_valid';
      END IF;
      u := (item ->> 'units')::numeric;
      p := (item ->> 'priceCents')::numeric;
      IF u <> trunc(u) OR p <> trunc(p) OR u < 1 OR u > 1000 OR p < 1 OR p > 100000000 THEN
        RAISE EXCEPTION 'Pacote % com duracao ou preco invalido', i
          USING ERRCODE = 'check_violation', CONSTRAINT = 'space_unit_groups_packages_valid';
      END IF;
      IF u <= anterior_u THEN
        RAISE EXCEPTION 'Pacotes fora de ordem ou com a mesma duracao'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'space_unit_groups_packages_ordered';
      END IF;
      IF p < anterior_p THEN
        RAISE EXCEPTION 'Pacote mais longo nao pode custar menos que um mais curto'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'space_unit_groups_packages_ordered';
      END IF;
      anterior_u := u;
      anterior_p := p;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER space_unit_groups_guard
  BEFORE INSERT OR UPDATE ON public.space_unit_groups
  FOR EACH ROW EXECUTE FUNCTION public.guard_unit_group_config();
--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 2b. Resumo de preço do anúncio, sempre derivado dos grupos com unidade
-- ativa: o menor preço mensal (contínuo) e a entrada mais barata do
-- temporário na menor unidade de tempo. Busca, cartões, mapa, histórico de
-- preço e avisos de favorito continuam lendo colunas do próprio anúncio.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.space_rental_summary(
  p_space uuid,
  OUT monthly_cents integer,
  OUT temp_cents integer,
  OUT temp_units integer,
  OUT temp_unit public.rental_time_unit
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    (SELECT min(g.monthly_price_cents)
       FROM public.space_unit_groups g
      WHERE g.space_id = p_space AND g.active AND g.allows_continuous
        AND EXISTS (SELECT 1 FROM public.space_units u WHERE u.group_id = g.id AND u.active)),
    t.cents, t.units, t.unit
  FROM (SELECT 1) AS um
  LEFT JOIN LATERAL (
    SELECT x.cents, x.units, x.unit
      FROM (
        SELECT CASE WHEN g.temp_pricing_mode = 'per_period' THEN g.temp_price_cents
                    ELSE (g.temp_packages -> 0 ->> 'priceCents')::integer END AS cents,
               CASE WHEN g.temp_pricing_mode = 'per_period' THEN 1
                    ELSE (g.temp_packages -> 0 ->> 'units')::integer END AS units,
               g.temp_unit AS unit
          FROM public.space_unit_groups g
         WHERE g.space_id = p_space AND g.active AND g.allows_temporary
           AND EXISTS (SELECT 1 FROM public.space_units u WHERE u.group_id = g.id AND u.active)
      ) AS x
     ORDER BY CASE x.unit WHEN 'hour' THEN 1 WHEN 'day' THEN 2 ELSE 3 END, x.cents, x.units
     LIMIT 1
  ) AS t ON true
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.sync_space_rental_summary()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  alvo uuid := COALESCE(NEW.space_id, OLD.space_id);
  r record;
BEGIN
  SELECT * INTO r FROM public.space_rental_summary(alvo);

  UPDATE public.spaces
     SET price_monthly_cents = r.monthly_cents,
         temp_from_cents = r.temp_cents,
         temp_from_units = r.temp_units,
         temp_from_unit = r.temp_unit,
         updated_at = now()
   WHERE id = alvo
     AND (price_monthly_cents IS DISTINCT FROM r.monthly_cents
          OR temp_from_cents IS DISTINCT FROM r.temp_cents
          OR temp_from_units IS DISTINCT FROM r.temp_units
          OR temp_from_unit IS DISTINCT FROM r.temp_unit);

  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER space_unit_groups_sync_summary
  AFTER INSERT OR UPDATE OR DELETE ON public.space_unit_groups
  FOR EACH ROW EXECUTE FUNCTION public.sync_space_rental_summary();
--> statement-breakpoint

CREATE TRIGGER space_units_sync_summary
  AFTER INSERT OR UPDATE OF active, group_id OR DELETE ON public.space_units
  FOR EACH ROW EXECUTE FUNCTION public.sync_space_rental_summary();
--> statement-breakpoint

-- Quem tem grupos não grava preço direto no anúncio: o preço que aparece
-- é sempre o que vale na hora de reservar. Gravar outro valor é um bug, e
-- o banco recusa em vez de deixar a vitrine mentir.
CREATE OR REPLACE FUNCTION public.guard_space_rental_summary()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.space_unit_groups g WHERE g.space_id = NEW.id) THEN
    RETURN NEW;
  END IF;
  SELECT * INTO r FROM public.space_rental_summary(NEW.id);
  IF NEW.price_monthly_cents IS DISTINCT FROM r.monthly_cents
     OR NEW.temp_from_cents IS DISTINCT FROM r.temp_cents
     OR NEW.temp_from_units IS DISTINCT FROM r.temp_units
     OR NEW.temp_from_unit IS DISTINCT FROM r.temp_unit THEN
    RAISE EXCEPTION 'O preco do anuncio vem dos grupos de unidades'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'spaces_price_from_units';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER spaces_price_from_units
  BEFORE UPDATE OF price_monthly_cents, temp_from_cents, temp_from_units, temp_from_unit ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.guard_space_rental_summary();
--> statement-breakpoint

-- Histórico de preço (Fase 23) só entre dois preços mensais reais: anúncio
-- que passou a alugar só por hora (preço mensal NULL) não vira "R$ 0".
CREATE OR REPLACE FUNCTION public.record_space_price_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ator uuid;
BEGIN
  IF OLD.published_at IS NULL THEN
    RETURN NULL;
  END IF;
  IF OLD.price_monthly_cents IS NULL OR NEW.price_monthly_cents IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    ator := NULLIF(current_setting('myplace.actor_id', true), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    ator := NULL;
  END;

  INSERT INTO public.space_price_history
    (space_id, old_price_cents, new_price_cents, changed_by, space_status)
  VALUES
    (NEW.id, OLD.price_monthly_cents, NEW.price_monthly_cents, ator, NEW.status);

  RETURN NULL;
END;
$$;
--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 3. Ocupação do anúncio por UNIDADE.
--
-- O anúncio só vira `rented` quando TODAS as unidades ativas estão com
-- aluguel CONTÍNUO vigente — um estacionamento com 3 de 10 vagas mensalistas
-- continua no ar. Aluguel temporário nunca tira o anúncio do ar: dura horas,
-- e a disponibilidade de cada horário é calculada por unidade.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.space_fully_rented(p_space uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.space_units u
            JOIN public.space_unit_groups g ON g.id = u.group_id
           WHERE u.space_id = p_space AND u.active AND g.active
         )
     AND NOT EXISTS (
           SELECT 1 FROM public.space_units u
            JOIN public.space_unit_groups g ON g.id = u.group_id
           WHERE u.space_id = p_space AND u.active AND g.active
             AND NOT EXISTS (
               SELECT 1 FROM public.bookings b
                WHERE b.unit_id = u.id
                  AND b.kind = 'continuous'
                  AND public.booking_occupies(b.status)
             )
         )
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.apply_space_occupancy(p_space uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.space_fully_rented(p_space) THEN
    UPDATE public.spaces SET status = 'rented'
     WHERE id = p_space AND status = 'published';
  ELSE
    BEGIN
      UPDATE public.spaces SET status = 'published'
       WHERE id = p_space AND status = 'rented';
    EXCEPTION WHEN check_violation THEN
      -- Não dá para voltar ao ar como está (ex.: ficou abaixo do mínimo de
      -- fotos): o aluguel encerra do mesmo jeito e o anúncio fica pausado
      -- até o proprietário corrigir (mesma regra da Fase 23).
      UPDATE public.spaces SET status = 'paused'
       WHERE id = p_space AND status = 'rented';
    END;
  END IF;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.sync_space_occupancy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.kind <> 'continuous' THEN
    RETURN NULL;
  END IF;
  PERFORM public.apply_space_occupancy(NEW.space_id);
  RETURN NULL;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS bookings_sync_space_occupancy ON public.bookings;
--> statement-breakpoint
CREATE TRIGGER bookings_sync_space_occupancy
  AFTER INSERT OR UPDATE OF status, unit_id ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_space_occupancy();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.guard_published_not_occupied()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'published' AND public.space_fully_rented(NEW.id) THEN
    NEW.status := 'rented';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.sync_occupancy_from_units()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.apply_space_occupancy(COALESCE(NEW.space_id, OLD.space_id));
  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER space_units_sync_occupancy
  AFTER INSERT OR UPDATE OF active OR DELETE ON public.space_units
  FOR EACH ROW EXECUTE FUNCTION public.sync_occupancy_from_units();
--> statement-breakpoint

CREATE TRIGGER space_unit_groups_sync_occupancy
  AFTER UPDATE OF active ON public.space_unit_groups
  FOR EACH ROW EXECUTE FUNCTION public.sync_occupancy_from_units();
--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 4. Travas: anúncio no ar precisa de unidade para alugar, e unidade (ou
-- grupo) com aluguel em andamento ou futuro não pode ser desativada.
-- Unidade com histórico de reserva nem pode ser apagada (a chave
-- estrangeira da reserva impede) — só desativada.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.space_has_rentable_unit(p_space uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.space_units u
      JOIN public.space_unit_groups g ON g.id = u.group_id
     WHERE u.space_id = p_space AND u.active AND g.active
  )
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.guard_publish_requires_units()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('published', 'rented')
     AND (TG_OP = 'INSERT' OR OLD.status NOT IN ('published', 'rented'))
     AND NOT public.space_has_rentable_unit(NEW.id) THEN
    RAISE EXCEPTION 'Anuncio sem unidade para alugar'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'spaces_published_requires_units';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER spaces_publish_requires_units
  BEFORE INSERT OR UPDATE OF status ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.guard_publish_requires_units();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.unit_has_live_rental(p_unit uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.unit_id = p_unit
       AND public.booking_occupies(b.status)
       AND (b.occupied_until IS NULL OR b.occupied_until > now())
       AND NOT (b.status = 'awaiting_payment' AND b.hold_expires_at IS NOT NULL AND b.hold_expires_at <= now())
  )
$$;
--> statement-breakpoint

-- Sobra pelo menos uma unidade ativa (num grupo ativo) no anúncio no ar,
-- desconsiderando a unidade ou o grupo que está saindo.
CREATE OR REPLACE FUNCTION public.space_keeps_a_unit(p_space uuid, p_without_unit uuid, p_without_group uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.spaces s WHERE s.id = p_space AND s.status IN ('published', 'rented'))
      OR EXISTS (
           SELECT 1 FROM public.space_units u
             JOIN public.space_unit_groups g ON g.id = u.group_id
            WHERE u.space_id = p_space AND u.active AND g.active
              AND u.id IS DISTINCT FROM p_without_unit
              AND g.id IS DISTINCT FROM p_without_group
         )
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.guard_unit_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.active AND NOT public.space_keeps_a_unit(OLD.space_id, OLD.id, NULL) THEN
      RAISE EXCEPTION 'Anuncio no ar precisa de pelo menos uma unidade'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'spaces_published_requires_units';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.active AND NOT NEW.active THEN
    IF public.unit_has_live_rental(NEW.id) THEN
      RAISE EXCEPTION 'Unidade com aluguel em andamento ou futuro'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'space_units_keep_live_rental';
    END IF;
    IF NOT public.space_keeps_a_unit(NEW.space_id, NEW.id, NULL) THEN
      RAISE EXCEPTION 'Anuncio no ar precisa de pelo menos uma unidade'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'spaces_published_requires_units';
    END IF;
  END IF;
  IF NEW.group_id <> OLD.group_id AND public.unit_has_live_rental(NEW.id) THEN
    RAISE EXCEPTION 'Unidade com aluguel em andamento ou futuro'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'space_units_keep_live_rental';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER space_units_guard_change
  BEFORE UPDATE OF active, group_id OR DELETE ON public.space_units
  FOR EACH ROW EXECUTE FUNCTION public.guard_unit_change();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.guard_group_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.active AND NOT public.space_keeps_a_unit(OLD.space_id, NULL, OLD.id) THEN
      RAISE EXCEPTION 'Anuncio no ar precisa de pelo menos uma unidade'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'spaces_published_requires_units';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.active AND NOT NEW.active THEN
    IF EXISTS (
      SELECT 1 FROM public.space_units u
       WHERE u.group_id = NEW.id AND u.active AND public.unit_has_live_rental(u.id)
    ) THEN
      RAISE EXCEPTION 'Grupo com aluguel em andamento ou futuro'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'space_units_keep_live_rental';
    END IF;
    IF NOT public.space_keeps_a_unit(NEW.space_id, NULL, NEW.id) THEN
      RAISE EXCEPTION 'Anuncio no ar precisa de pelo menos uma unidade'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'spaces_published_requires_units';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER space_unit_groups_guard_change
  BEFORE UPDATE OF active OR DELETE ON public.space_unit_groups
  FOR EACH ROW EXECUTE FUNCTION public.guard_group_change();
--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 5. Preço, horário e forma da reserva conferidos pelo banco.
--
-- O servidor calcula (src/lib/rentals/pricing.ts) e o banco confere com a
-- MESMA regra: se um bug gravar um valor diferente do que as regras do
-- grupo mandam, o INSERT falha. Arredondamento do proporcional: uma vez,
-- meio para cima, sobre o total.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.temporary_rent_cents(p_group uuid, p_units integer, p_unit public.rental_time_unit)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  g public.space_unit_groups%ROWTYPE;
  preco bigint;
  divisor integer;
BEGIN
  SELECT * INTO g FROM public.space_unit_groups WHERE id = p_group;
  IF NOT FOUND OR NOT g.allows_temporary OR p_units IS NULL OR p_units < 1 OR p_unit IS NULL THEN
    RETURN NULL;
  END IF;

  IF g.temp_pricing_mode = 'packages' THEN
    IF p_unit <> g.temp_unit THEN
      RETURN NULL;
    END IF;
    SELECT (value ->> 'priceCents')::bigint INTO preco
      FROM jsonb_array_elements(g.temp_packages)
     WHERE (value ->> 'units')::integer = p_units
     LIMIT 1;
  ELSIF p_unit = g.temp_unit THEN
    IF p_units > g.temp_max_units THEN
      RETURN NULL;
    END IF;
    preco := g.temp_price_cents::bigint * p_units;
  ELSE
    IF g.temp_allow_fraction AND g.temp_unit = 'day' AND p_unit = 'hour' THEN
      divisor := 24;
    ELSIF g.temp_allow_fraction AND g.temp_unit = 'week' AND p_unit = 'day' THEN
      divisor := 7;
    ELSE
      RETURN NULL;
    END IF;
    IF p_units > g.temp_max_units * divisor THEN
      RETURN NULL;
    END IF;
    preco := (g.temp_price_cents::bigint * p_units * 2 + divisor) / (2 * divisor);
  END IF;

  IF preco IS NULL OR preco < 1 OR preco > 100000000 THEN
    RETURN NULL;
  END IF;
  RETURN preco::integer;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.rental_unit_interval(p_unit public.rental_time_unit)
RETURNS interval
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_unit WHEN 'hour' THEN interval '1 hour' WHEN 'day' THEN interval '24 hours' ELSE interval '168 hours' END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.platform_setting_int(p_key text, p_default integer)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (value #>> '{}')::integer FROM public.platform_settings WHERE key = p_key),
    p_default
  )
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.guard_booking_rental_shape()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  g public.space_unit_groups%ROWTYPE;
  anterior public.bookings%ROWTYPE;
  esperado integer;
  ini timestamp;
  fim timestamp;
BEGIN
  -- Contínuo: o horário exato de início é sempre a meia-noite (Brasília)
  -- do dia de início — derivado aqui, nunca informado à parte.
  IF NEW.kind = 'continuous' THEN
    NEW.starts_at := (NEW.start_date::timestamp AT TIME ZONE 'America/Sao_Paulo');

    -- Valor de UMA mensalidade = preço mensal do grupo, conferido quando a
    -- solicitação nasce e quando é aceita (o aceite congela o valor vigente).
    IF NEW.group_id IS NOT NULL
       AND (TG_OP = 'INSERT' OR (OLD.status = 'requested' AND NEW.status = 'approved')) THEN
      SELECT * INTO g FROM public.space_unit_groups WHERE id = NEW.group_id;
      IF NOT g.allows_continuous OR g.monthly_price_cents IS DISTINCT FROM NEW.monthly_rent_cents THEN
        RAISE EXCEPTION 'Valor mensal diferente do preco do grupo'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_rent_matches_group';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- ---- Temporário ----
  IF TG_OP = 'UPDATE' THEN
    -- Depois de criada, a reserva temporária não muda de unidade, horário,
    -- duração nem valor. Só a proteção pós-fim pode encolher (renovação).
    IF NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.group_id IS DISTINCT FROM OLD.group_id
       OR NEW.unit_id IS DISTINCT FROM OLD.unit_id
       OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
       OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
       OR NEW.duration_units IS DISTINCT FROM OLD.duration_units
       OR NEW.duration_unit IS DISTINCT FROM OLD.duration_unit
       OR NEW.monthly_rent_cents IS DISTINCT FROM OLD.monthly_rent_cents
       OR NEW.total_charged_cents IS DISTINCT FROM OLD.total_charged_cents
       OR NEW.start_date IS DISTINCT FROM OLD.start_date
       OR NEW.end_date IS DISTINCT FROM OLD.end_date
       OR NEW.occupied_until > OLD.occupied_until THEN
      RAISE EXCEPTION 'Reserva temporaria nao muda depois de criada'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_temporary_frozen';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO g FROM public.space_unit_groups WHERE id = NEW.group_id;
  IF NOT FOUND OR NOT g.active OR NOT g.allows_temporary THEN
    RAISE EXCEPTION 'Grupo nao aceita aluguel temporario'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_temporary_rules';
  END IF;

  esperado := public.temporary_rent_cents(NEW.group_id, NEW.duration_units, NEW.duration_unit);
  IF esperado IS NULL THEN
    RAISE EXCEPTION 'Duracao fora das regras do grupo'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_temporary_rules';
  END IF;
  IF esperado <> NEW.monthly_rent_cents THEN
    RAISE EXCEPTION 'Valor diferente do que as regras do grupo calculam'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_rent_matches_group';
  END IF;
  IF NEW.monthly_rent_cents < public.platform_setting_int('booking.min_rent_cents', 3500) THEN
    RAISE EXCEPTION 'Valor abaixo do minimo por cobranca'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_temporary_minimum';
  END IF;

  IF NEW.starts_at IS NULL
     OR NEW.ends_at IS DISTINCT FROM NEW.starts_at + NEW.duration_units * public.rental_unit_interval(NEW.duration_unit) THEN
    RAISE EXCEPTION 'Fim da reserva diferente de inicio + duracao'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_temporary_rules';
  END IF;

  IF NEW.status = 'awaiting_payment'
     AND (NEW.hold_expires_at IS NULL
          OR NEW.hold_expires_at > now() + make_interval(mins => public.platform_setting_int('rental.hold_minutes', 15) + 1)) THEN
    RAISE EXCEPTION 'Prazo para pagar fora do permitido'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_temporary_hold';
  END IF;

  IF NEW.renewed_from_id IS NOT NULL THEN
    -- Renovação: mesma pessoa, mesma unidade, começando exatamente onde a
    -- anterior termina, pedida até 7 minutos depois do fim.
    SELECT * INTO anterior FROM public.bookings WHERE id = NEW.renewed_from_id;
    IF NOT FOUND
       OR anterior.kind <> 'temporary' OR anterior.status <> 'active' OR NOT anterior.renewal_allowed
       OR anterior.renter_id <> NEW.renter_id
       OR anterior.unit_id IS DISTINCT FROM NEW.unit_id
       OR anterior.ends_at <> NEW.starts_at
       OR now() > anterior.ends_at + interval '7 minutes' THEN
      RAISE EXCEPTION 'Renovacao fora das regras'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_renewal_rules';
    END IF;
  ELSIF NEW.starts_at < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'Inicio no passado'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_temporary_window';
  END IF;
  IF NEW.starts_at > now() + make_interval(days => public.platform_setting_int('rental.max_advance_days', 30)) THEN
    RAISE EXCEPTION 'Inicio longe demais'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_temporary_window';
  END IF;

  -- Horário de funcionamento, no relógio de Brasília. Em minutos desde a
  -- meia-noite do dia do início — fechar às 24:00 também funciona.
  IF g.hours_mode = 'daily' THEN
    ini := NEW.starts_at AT TIME ZONE 'America/Sao_Paulo';
    fim := NEW.ends_at AT TIME ZONE 'America/Sao_Paulo';
    IF extract(epoch FROM (ini - ini::date::timestamp)) < extract(epoch FROM g.opens_at) THEN
      RAISE EXCEPTION 'O espaco abre as %', to_char(g.opens_at, 'HH24:MI')
        USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_operating_hours';
    END IF;
    IF extract(epoch FROM (fim - ini::date::timestamp)) > extract(epoch FROM g.closes_at) THEN
      RAISE EXCEPTION 'O espaco fecha as %', to_char(g.closes_at, 'HH24:MI')
        USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_operating_hours';
    END IF;
  END IF;

  -- Dias que a reserva toca (fim exclusivo), no relógio de Brasília — é o
  -- que o calendário de bloqueios compara (trigger bookings_guard_blocked_period).
  NEW.start_date := (NEW.starts_at AT TIME ZONE 'America/Sao_Paulo')::date;
  NEW.end_date := CASE
    WHEN (NEW.ends_at AT TIME ZONE 'America/Sao_Paulo')::time = '00:00'
      THEN (NEW.ends_at AT TIME ZONE 'America/Sao_Paulo')::date
    ELSE (NEW.ends_at AT TIME ZONE 'America/Sao_Paulo')::date + 1
  END;
  -- Proteção depois do fim: 7 minutos para renovar, se o grupo aceita.
  NEW.renewal_allowed := g.renewal_allowed;
  NEW.occupied_until := NEW.ends_at + CASE WHEN g.renewal_allowed THEN interval '7 minutes' ELSE interval '0' END;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- O nome começa com "derive" de propósito: triggers BEFORE rodam em ordem
-- alfabética, e esta precisa preencher as datas antes de
-- `bookings_guard_blocked_period` conferir o calendário.
CREATE TRIGGER bookings_derive_rental_shape
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_rental_shape();
--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 6. Encerrar o que venceu — sempre pelo relógio do banco.
--
-- Chamada (a) pela transação que vai alugar uma unidade, antes de procurar
-- unidade livre, e (b) pelo agendador por minuto. Só mexe em estado; os
-- efeitos fora do banco (avisos, cancelar a recorrência no Asaas, excluir a
-- cobrança que não deve mais ser paga) ficam marcados aqui e são executados
-- pela aplicação, que repete até o gateway confirmar.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_expired_rentals(p_space uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  n_reservas integer := 0;
  n_temporarios integer := 0;
  n_pendentes integer := 0;
BEGIN
  -- Reserva temporária não paga no prazo: unidade liberada; a cobrança em
  -- aberto é marcada para exclusão no gateway (não pode mais ser paga).
  WITH vencidas AS (
    UPDATE public.bookings
       SET status = 'expired', end_reason = 'hold_expired', updated_at = now()
     WHERE kind = 'temporary' AND status = 'awaiting_payment'
       AND hold_expires_at <= now()
       AND (p_space IS NULL OR space_id = p_space)
    RETURNING id
  ), cobrancas AS (
    UPDATE public.payments p
       SET delete_requested_at = now(), updated_at = now()
      FROM vencidas v
     WHERE p.booking_id = v.id AND p.status IN ('pending', 'overdue') AND p.delete_requested_at IS NULL
    RETURNING p.id
  )
  SELECT count(*) INTO n_reservas FROM vencidas;

  -- Temporário que terminou e cuja janela de renovação já passou.
  UPDATE public.bookings
     SET status = 'ended', end_reason = 'completed', ended_at = ends_at, updated_at = now()
   WHERE kind = 'temporary' AND status = 'active'
     AND occupied_until <= now()
     AND (p_space IS NULL OR space_id = p_space);
  GET DIAGNOSTICS n_temporarios = ROW_COUNT;

  -- Pagamento pendente que passou do prazo total (40 min + 1 h): aluguel
  -- encerrado, recorrência marcada como cancelada (o cancelamento no Asaas
  -- é feito pela aplicação e repetido até confirmar).
  WITH encerradas AS (
    UPDATE public.bookings
       SET status = 'ended', end_reason = 'payment_not_received', ended_at = now(), updated_at = now()
     WHERE status = 'past_due'
       AND payment_issue_deadline_at <= now()
       AND (p_space IS NULL OR space_id = p_space)
    RETURNING id
  ), assinaturas AS (
    UPDATE public.subscriptions s
       SET status = 'cancelled', cancelled_at = now(), updated_at = now()
      FROM encerradas e
     WHERE s.booking_id = e.id
       AND s.status IN ('pending_authorization', 'active', 'past_due', 'paused')
    RETURNING s.id
  )
  SELECT count(*) INTO n_pendentes FROM encerradas;

  RETURN n_reservas + n_temporarios + n_pendentes;
END;
$$;
--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 7. Dados que já existiam: cada anúncio que já tinha passado da etapa de
-- preço ganha um grupo e uma unidade, com o mesmo preço mensal; cada reserva
-- aponta para essa unidade. Nada muda para quem já alugava.
-- ---------------------------------------------------------------------------
INSERT INTO public.space_unit_groups (space_id, name, position, allows_continuous, allows_temporary, monthly_price_cents)
SELECT s.id, 'Padrão', 0, true, false, s.price_monthly_cents
  FROM public.spaces s
 WHERE s.price_monthly_cents IS NOT NULL
   AND (s.status <> 'draft' OR s.draft_step >= 7)
   AND NOT EXISTS (SELECT 1 FROM public.space_unit_groups g WHERE g.space_id = s.id);
--> statement-breakpoint

INSERT INTO public.space_units (space_id, group_id, label, position)
SELECT g.space_id, g.id, 'Unidade 1', 1
  FROM public.space_unit_groups g
 WHERE NOT EXISTS (SELECT 1 FROM public.space_units u WHERE u.group_id = g.id);
--> statement-breakpoint

-- Rascunho que ainda não chegou no preço tinha 1 centavo provisório (o CHECK
-- exigia > 0 desde o INSERT). Agora o campo aceita NULL: sai o provisório.
UPDATE public.spaces s
   SET price_monthly_cents = NULL
 WHERE s.status = 'draft'
   AND NOT EXISTS (SELECT 1 FROM public.space_unit_groups g WHERE g.space_id = s.id);
--> statement-breakpoint

-- Reservas antigas apontam para a unidade criada acima. O início exato
-- (meia-noite de Brasília do dia de início) vem da trigger da seção 5.
UPDATE public.bookings b
   SET kind = 'continuous',
       group_id = g.id,
       unit_id = u.id
  FROM public.space_unit_groups g
  JOIN public.space_units u ON u.group_id = g.id
 WHERE g.space_id = b.space_id
   AND b.group_id IS NULL;
--> statement-breakpoint

-- Atraso que já existia ganha o prazo novo a partir de agora (antes não
-- havia prazo nenhum: a unidade podia ficar ocupada para sempre).
UPDATE public.bookings
   SET payment_issue_started_at = now(),
       payment_issue_deadline_at = now() + interval '100 minutes'
 WHERE status = 'past_due' AND payment_issue_started_at IS NULL;
--> statement-breakpoint

-- Cancelamentos anteriores já passavam pelo Asaas antes do banco.
UPDATE public.subscriptions
   SET provider_cancelled_at = cancelled_at
 WHERE status = 'cancelled' AND provider_cancelled_at IS NULL;
--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 8. Restrições que dependem do preenchimento acima.
-- ---------------------------------------------------------------------------

-- Ninguém ocupa a mesma unidade ao mesmo tempo. Contínuo tem intervalo sem
-- fim (occupied_until NULL), então também bloqueia temporário por cima dele.
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_unit_no_overlap
  EXCLUDE USING gist (unit_id WITH =, tstzrange(starts_at, occupied_until, '[)') WITH &&)
  WHERE (unit_id IS NOT NULL AND status IN ('approved', 'awaiting_payment', 'active', 'past_due'));
--> statement-breakpoint

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_occupying_has_unit
  CHECK (status NOT IN ('approved', 'awaiting_payment', 'active', 'past_due')
         OR (unit_id IS NOT NULL AND group_id IS NOT NULL AND starts_at IS NOT NULL));
--> statement-breakpoint

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_temporary_shape
  CHECK (kind <> 'temporary' OR (
    group_id IS NOT NULL AND unit_id IS NOT NULL
    AND starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at
    AND occupied_until IS NOT NULL
    AND occupied_until >= ends_at
    AND occupied_until <= ends_at + interval '7 minutes'
    AND duration_units IS NOT NULL AND duration_units > 0 AND duration_unit IS NOT NULL
    AND status NOT IN ('requested', 'approved', 'rejected', 'past_due')
  ));
--> statement-breakpoint

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_continuous_open_ended
  CHECK (kind <> 'continuous' OR (
    ends_at IS NULL AND occupied_until IS NULL AND hold_expires_at IS NULL
    AND duration_units IS NULL AND duration_unit IS NULL AND renewed_from_id IS NULL
  ));
--> statement-breakpoint

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_temporary_hold
  CHECK (kind <> 'temporary' OR status <> 'awaiting_payment' OR hold_expires_at IS NOT NULL);
--> statement-breakpoint

-- Pagamento pendente: só no contínuo, sempre com o prazo fixo de 40 min +
-- 1 h a partir do início da falha. Fora dele, os campos ficam vazios — só o
-- aluguel encerrado guarda a última janela, como histórico.
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_payment_window
  CHECK (
    (status = 'past_due'
      AND kind = 'continuous'
      AND payment_issue_started_at IS NOT NULL
      AND payment_issue_deadline_at = payment_issue_started_at + interval '100 minutes')
    OR (status <> 'past_due' AND payment_issue_started_at IS NULL AND payment_issue_deadline_at IS NULL)
    OR (status = 'ended' AND payment_issue_deadline_at = payment_issue_started_at + interval '100 minutes')
  );
--> statement-breakpoint

-- `status::text`: 'expired' entrou no enum por ALTER TYPE ... ADD VALUE
-- (0010), e num banco novo todas as migrações rodam numa transação só — o
-- Postgres não deixa usar esse valor como literal na mesma transação.
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_end_reason_matches
  CHECK (end_reason IS NULL OR status::text IN ('ended', 'expired', 'cancelled'));
--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 9. RLS (nenhum acesso direto do navegador) e configurações.
-- ---------------------------------------------------------------------------
ALTER TABLE public.space_unit_groups ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.space_units ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$
DECLARE
  t text;
  f text;
BEGIN
  FOREACH t IN ARRAY ARRAY['space_unit_groups', 'space_units'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    END IF;
  END LOOP;

  -- Funções que mudam estado não são chamáveis pela API do navegador (RPC).
  FOREACH f IN ARRAY ARRAY['public.release_expired_rentals(uuid)', 'public.apply_space_occupancy(uuid)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', f);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', f);
    END IF;
  END LOOP;
END;
$$;
--> statement-breakpoint

INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('rental.hold_minutes', '15'::jsonb,
   'Minutos que uma reserva temporária fica segura enquanto a pessoa paga.', true),
  ('rental.max_advance_days', '30'::jsonb,
   'Com quantos dias de antecedência dá para reservar um aluguel temporário.', true)
ON CONFLICT (key) DO NOTHING;
