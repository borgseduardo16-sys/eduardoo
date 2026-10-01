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
-- Este arquivo tem SO as migracoes 31 em diante. Ele supoe que as
-- anteriores ja foram aplicadas — se este for um projeto novo, use
-- supabase/setup.sql, que traz o schema completo.
--
-- Ao terminar, a saida mostra quantas migracoes foram aplicadas agora e
-- quantas ja estavam no banco.
--
-- Gerado por scripts/build-supabase-setup.ts a partir de 2 migracoes
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
-- Migracao 31: 0031_third_fenris  (67 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_31$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = 'ab85c1164bc709fa9ee0b55f66962496fadbe454274df5c3e3f858d5848ea062'
  ) THEN
    RAISE NOTICE 'Migracao 31 (0031_third_fenris) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_31_0$CREATE TYPE "public"."booking_end_reason" AS ENUM('completed', 'cancelled_by_renter', 'cancelled_by_owner', 'payment_not_received', 'hold_expired');$mp_31_0$;

    EXECUTE $mp_31_1$CREATE TYPE "public"."operating_hours_mode" AS ENUM('always', 'daily');$mp_31_1$;

    EXECUTE $mp_31_2$CREATE TYPE "public"."rental_kind" AS ENUM('continuous', 'temporary');$mp_31_2$;

    EXECUTE $mp_31_3$CREATE TYPE "public"."rental_time_unit" AS ENUM('hour', 'day', 'week');$mp_31_3$;

    EXECUTE $mp_31_4$CREATE TYPE "public"."temporary_pricing_mode" AS ENUM('per_period', 'packages');$mp_31_4$;

    EXECUTE $mp_31_5$ALTER TYPE "public"."notification_type" ADD VALUE 'rental_ending_soon';$mp_31_5$;

    EXECUTE $mp_31_6$ALTER TYPE "public"."notification_type" ADD VALUE 'payment_refunded';$mp_31_6$;

    EXECUTE $mp_31_7$ALTER TYPE "public"."space_type" ADD VALUE 'estacionamento';$mp_31_7$;

    EXECUTE $mp_31_8$ALTER TYPE "public"."space_type" ADD VALUE 'espaco_eventos';$mp_31_8$;

    EXECUTE $mp_31_9$ALTER TYPE "public"."space_type" ADD VALUE 'area_lazer';$mp_31_9$;

    EXECUTE $mp_31_10$ALTER TYPE "public"."space_type" ADD VALUE 'oficina';$mp_31_10$;

    EXECUTE $mp_31_11$CREATE TABLE "space_unit_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"allows_continuous" boolean DEFAULT true NOT NULL,
	"allows_temporary" boolean DEFAULT false NOT NULL,
	"monthly_price_cents" integer,
	"temp_pricing_mode" "temporary_pricing_mode",
	"temp_unit" "rental_time_unit",
	"temp_price_cents" integer,
	"temp_max_units" integer,
	"temp_allow_fraction" boolean DEFAULT false NOT NULL,
	"temp_packages" jsonb,
	"renewal_allowed" boolean DEFAULT true NOT NULL,
	"hours_mode" "operating_hours_mode" DEFAULT 'always' NOT NULL,
	"opens_at" time,
	"closes_at" time,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_unit_groups_space_id_id_key" UNIQUE("space_id","id"),
	CONSTRAINT "space_unit_groups_name_length" CHECK (char_length(trim("space_unit_groups"."name")) BETWEEN 1 AND 60),
	CONSTRAINT "space_unit_groups_some_mode" CHECK ("space_unit_groups"."allows_continuous" OR "space_unit_groups"."allows_temporary"),
	CONSTRAINT "space_unit_groups_continuous_price" CHECK (NOT "space_unit_groups"."allows_continuous" OR ("space_unit_groups"."monthly_price_cents" IS NOT NULL AND "space_unit_groups"."monthly_price_cents" BETWEEN 1 AND 100000000)),
	CONSTRAINT "space_unit_groups_temporary_rule" CHECK (NOT "space_unit_groups"."allows_temporary" OR (
            "space_unit_groups"."temp_pricing_mode" IS NOT NULL AND "space_unit_groups"."temp_unit" IS NOT NULL AND (
              ("space_unit_groups"."temp_pricing_mode" = 'per_period'
                AND "space_unit_groups"."temp_price_cents" BETWEEN 1 AND 100000000
                AND "space_unit_groups"."temp_max_units" BETWEEN 1 AND 1000)
              OR ("space_unit_groups"."temp_pricing_mode" = 'packages'
                AND jsonb_typeof("space_unit_groups"."temp_packages") = 'array'
                AND jsonb_array_length("space_unit_groups"."temp_packages") BETWEEN 1 AND 6)
            )
          )),
	CONSTRAINT "space_unit_groups_fraction_rule" CHECK (NOT "space_unit_groups"."temp_allow_fraction" OR ("space_unit_groups"."temp_pricing_mode" = 'per_period' AND "space_unit_groups"."temp_unit" IN ('day', 'week'))),
	CONSTRAINT "space_unit_groups_hours_temporary" CHECK ("space_unit_groups"."hours_mode" = 'always' OR NOT "space_unit_groups"."allows_temporary" OR "space_unit_groups"."temp_unit" = 'hour'),
	CONSTRAINT "space_unit_groups_hours" CHECK (("space_unit_groups"."hours_mode" = 'always' AND "space_unit_groups"."opens_at" IS NULL AND "space_unit_groups"."closes_at" IS NULL)
          OR ("space_unit_groups"."hours_mode" = 'daily' AND "space_unit_groups"."opens_at" IS NOT NULL AND "space_unit_groups"."closes_at" IS NOT NULL AND "space_unit_groups"."opens_at" < "space_unit_groups"."closes_at"))
);$mp_31_11$;

    EXECUTE $mp_31_12$CREATE TABLE "space_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"label" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_units_space_id_id_key" UNIQUE("space_id","id"),
	CONSTRAINT "space_units_group_id_id_key" UNIQUE("group_id","id"),
	CONSTRAINT "space_units_label_length" CHECK (char_length(trim("space_units"."label")) BETWEEN 1 AND 40)
);$mp_31_12$;

    EXECUTE $mp_31_13$ALTER TABLE "spaces" DROP CONSTRAINT "spaces_price_positive";$mp_31_13$;

    EXECUTE $mp_31_14$ALTER TABLE "spaces" DROP CONSTRAINT "spaces_price_sane";$mp_31_14$;

    EXECUTE $mp_31_15$DROP INDEX "bookings_one_active_per_space";$mp_31_15$;

    EXECUTE $mp_31_16$ALTER TABLE "spaces" ALTER COLUMN "price_monthly_cents" DROP NOT NULL;$mp_31_16$;

    EXECUTE $mp_31_17$ALTER TABLE "spaces" ADD COLUMN "temp_from_cents" integer;$mp_31_17$;

    EXECUTE $mp_31_18$ALTER TABLE "spaces" ADD COLUMN "temp_from_units" integer;$mp_31_18$;

    EXECUTE $mp_31_19$ALTER TABLE "spaces" ADD COLUMN "temp_from_unit" "rental_time_unit";$mp_31_19$;

    EXECUTE $mp_31_20$ALTER TABLE "bookings" ADD COLUMN "kind" "rental_kind" DEFAULT 'continuous' NOT NULL;$mp_31_20$;

    EXECUTE $mp_31_21$ALTER TABLE "bookings" ADD COLUMN "group_id" uuid;$mp_31_21$;

    EXECUTE $mp_31_22$ALTER TABLE "bookings" ADD COLUMN "unit_id" uuid;$mp_31_22$;

    EXECUTE $mp_31_23$ALTER TABLE "bookings" ADD COLUMN "starts_at" timestamp with time zone;$mp_31_23$;

    EXECUTE $mp_31_24$ALTER TABLE "bookings" ADD COLUMN "ends_at" timestamp with time zone;$mp_31_24$;

    EXECUTE $mp_31_25$ALTER TABLE "bookings" ADD COLUMN "occupied_until" timestamp with time zone;$mp_31_25$;

    EXECUTE $mp_31_26$ALTER TABLE "bookings" ADD COLUMN "duration_units" integer;$mp_31_26$;

    EXECUTE $mp_31_27$ALTER TABLE "bookings" ADD COLUMN "duration_unit" "rental_time_unit";$mp_31_27$;

    EXECUTE $mp_31_28$ALTER TABLE "bookings" ADD COLUMN "renewal_allowed" boolean DEFAULT false NOT NULL;$mp_31_28$;

    EXECUTE $mp_31_29$ALTER TABLE "bookings" ADD COLUMN "renewed_from_id" uuid;$mp_31_29$;

    EXECUTE $mp_31_30$ALTER TABLE "bookings" ADD COLUMN "hold_expires_at" timestamp with time zone;$mp_31_30$;

    EXECUTE $mp_31_31$ALTER TABLE "bookings" ADD COLUMN "payment_issue_started_at" timestamp with time zone;$mp_31_31$;

    EXECUTE $mp_31_32$ALTER TABLE "bookings" ADD COLUMN "payment_issue_deadline_at" timestamp with time zone;$mp_31_32$;

    EXECUTE $mp_31_33$ALTER TABLE "bookings" ADD COLUMN "end_reason" "booking_end_reason";$mp_31_33$;

    EXECUTE $mp_31_34$ALTER TABLE "bookings" ADD COLUMN "idempotency_key" text;$mp_31_34$;

    EXECUTE $mp_31_35$ALTER TABLE "payments" ADD COLUMN "pix_payload" text;$mp_31_35$;

    EXECUTE $mp_31_36$ALTER TABLE "payments" ADD COLUMN "pix_qr_image" text;$mp_31_36$;

    EXECUTE $mp_31_37$ALTER TABLE "payments" ADD COLUMN "pix_expires_at" timestamp with time zone;$mp_31_37$;

    EXECUTE $mp_31_38$ALTER TABLE "payments" ADD COLUMN "payer_started_at" timestamp with time zone;$mp_31_38$;

    EXECUTE $mp_31_39$ALTER TABLE "payments" ADD COLUMN "refund_requested_at" timestamp with time zone;$mp_31_39$;

    EXECUTE $mp_31_40$ALTER TABLE "payments" ADD COLUMN "refund_reason" text;$mp_31_40$;

    EXECUTE $mp_31_41$ALTER TABLE "payments" ADD COLUMN "delete_requested_at" timestamp with time zone;$mp_31_41$;

    EXECUTE $mp_31_42$ALTER TABLE "payments" ADD COLUMN "provider_deleted_at" timestamp with time zone;$mp_31_42$;

    EXECUTE $mp_31_43$ALTER TABLE "subscriptions" ADD COLUMN "provider_cancelled_at" timestamp with time zone;$mp_31_43$;

    EXECUTE $mp_31_44$ALTER TABLE "space_unit_groups" ADD CONSTRAINT "space_unit_groups_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;$mp_31_44$;

    EXECUTE $mp_31_45$ALTER TABLE "space_units" ADD CONSTRAINT "space_units_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;$mp_31_45$;

    EXECUTE $mp_31_46$ALTER TABLE "space_units" ADD CONSTRAINT "space_units_group_same_space_fk" FOREIGN KEY ("space_id","group_id") REFERENCES "public"."space_unit_groups"("space_id","id") ON DELETE cascade ON UPDATE no action;$mp_31_46$;

    EXECUTE $mp_31_47$CREATE INDEX "space_unit_groups_space_idx" ON "space_unit_groups" USING btree ("space_id");$mp_31_47$;

    EXECUTE $mp_31_48$CREATE UNIQUE INDEX "space_unit_groups_space_name_key" ON "space_unit_groups" USING btree ("space_id",lower("name"));$mp_31_48$;

    EXECUTE $mp_31_49$CREATE INDEX "space_units_group_idx" ON "space_units" USING btree ("group_id","position");$mp_31_49$;

    EXECUTE $mp_31_50$CREATE INDEX "space_units_space_idx" ON "space_units" USING btree ("space_id");$mp_31_50$;

    EXECUTE $mp_31_51$CREATE UNIQUE INDEX "space_units_space_label_key" ON "space_units" USING btree ("space_id","label");$mp_31_51$;

    EXECUTE $mp_31_52$ALTER TABLE "bookings" ADD CONSTRAINT "bookings_renewed_from_id_bookings_id_fk" FOREIGN KEY ("renewed_from_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;$mp_31_52$;

    EXECUTE $mp_31_53$ALTER TABLE "bookings" ADD CONSTRAINT "bookings_group_same_space_fk" FOREIGN KEY ("space_id","group_id") REFERENCES "public"."space_unit_groups"("space_id","id") ON DELETE no action ON UPDATE no action;$mp_31_53$;

    EXECUTE $mp_31_54$ALTER TABLE "bookings" ADD CONSTRAINT "bookings_unit_same_group_fk" FOREIGN KEY ("group_id","unit_id") REFERENCES "public"."space_units"("group_id","id") ON DELETE no action ON UPDATE no action;$mp_31_54$;

    EXECUTE $mp_31_55$CREATE INDEX "bookings_unit_status_idx" ON "bookings" USING btree ("unit_id","status");$mp_31_55$;

    EXECUTE $mp_31_56$CREATE INDEX "bookings_group_idx" ON "bookings" USING btree ("group_id");$mp_31_56$;

    EXECUTE $mp_31_57$CREATE INDEX "bookings_hold_expires_idx" ON "bookings" USING btree ("hold_expires_at") WHERE status = 'awaiting_payment';$mp_31_57$;

    EXECUTE $mp_31_58$CREATE INDEX "bookings_payment_deadline_idx" ON "bookings" USING btree ("payment_issue_deadline_at") WHERE status = 'past_due';$mp_31_58$;

    EXECUTE $mp_31_59$CREATE INDEX "bookings_temporary_ending_idx" ON "bookings" USING btree ("occupied_until") WHERE kind = 'temporary' AND status = 'active';$mp_31_59$;

    EXECUTE $mp_31_60$CREATE UNIQUE INDEX "bookings_renter_idempotency_key" ON "bookings" USING btree ("renter_id","idempotency_key") WHERE idempotency_key IS NOT NULL;$mp_31_60$;

    EXECUTE $mp_31_61$CREATE UNIQUE INDEX "bookings_one_live_renewal" ON "bookings" USING btree ("renewed_from_id") WHERE renewed_from_id IS NOT NULL AND status IN ('approved','awaiting_payment','active','past_due');$mp_31_61$;

    EXECUTE $mp_31_62$CREATE INDEX "payments_outbox_idx" ON "payments" USING btree ("updated_at") WHERE (refund_requested_at IS NOT NULL AND status NOT IN ('refunded','partially_refunded')) OR (delete_requested_at IS NOT NULL AND provider_deleted_at IS NULL);$mp_31_62$;

    EXECUTE $mp_31_63$CREATE INDEX "subscriptions_cancel_pending_idx" ON "subscriptions" USING btree ("cancelled_at") WHERE status = 'cancelled' AND provider_cancelled_at IS NULL;$mp_31_63$;

    EXECUTE $mp_31_64$ALTER TABLE "spaces" ADD CONSTRAINT "spaces_temp_summary_complete" CHECK (("spaces"."temp_from_cents" IS NULL AND "spaces"."temp_from_units" IS NULL AND "spaces"."temp_from_unit" IS NULL)
          OR ("spaces"."temp_from_cents" > 0 AND "spaces"."temp_from_units" > 0 AND "spaces"."temp_from_unit" IS NOT NULL));$mp_31_64$;

    EXECUTE $mp_31_65$ALTER TABLE "spaces" ADD CONSTRAINT "spaces_price_positive" CHECK ("spaces"."price_monthly_cents" IS NULL OR "spaces"."price_monthly_cents" > 0);$mp_31_65$;

    EXECUTE $mp_31_66$ALTER TABLE "spaces" ADD CONSTRAINT "spaces_price_sane" CHECK ("spaces"."price_monthly_cents" IS NULL OR "spaces"."price_monthly_cents" <= 100000000);$mp_31_66$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('ab85c1164bc709fa9ee0b55f66962496fadbe454274df5c3e3f858d5848ea062', 1790849029369);

    RAISE NOTICE 'Migracao 31 (0031_third_fenris) aplicada.';
  END IF;
END
$mp_bloco_31$;


-- ----------------------------------------------------------------------------
-- Migracao 32: 0032_aluguel_unidades  (51 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_32$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '507e172cc33e2c7833a47303de86d3382100df068bcd217ebb27861b385a03e2'
  ) THEN
    RAISE NOTICE 'Migracao 32 (0032_aluguel_unidades) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_32_0$-- ===========================================================================
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

CREATE EXTENSION IF NOT EXISTS btree_gist;$mp_32_0$;

    EXECUTE $mp_32_1$-- ---------------------------------------------------------------------------
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
$$;$mp_32_1$;

    EXECUTE $mp_32_2$CREATE TRIGGER space_unit_groups_guard
  BEFORE INSERT OR UPDATE ON public.space_unit_groups
  FOR EACH ROW EXECUTE FUNCTION public.guard_unit_group_config();$mp_32_2$;

    EXECUTE $mp_32_3$-- ---------------------------------------------------------------------------
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
$$;$mp_32_3$;

    EXECUTE $mp_32_4$CREATE OR REPLACE FUNCTION public.sync_space_rental_summary()
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
$$;$mp_32_4$;

    EXECUTE $mp_32_5$CREATE TRIGGER space_unit_groups_sync_summary
  AFTER INSERT OR UPDATE OR DELETE ON public.space_unit_groups
  FOR EACH ROW EXECUTE FUNCTION public.sync_space_rental_summary();$mp_32_5$;

    EXECUTE $mp_32_6$CREATE TRIGGER space_units_sync_summary
  AFTER INSERT OR UPDATE OF active, group_id OR DELETE ON public.space_units
  FOR EACH ROW EXECUTE FUNCTION public.sync_space_rental_summary();$mp_32_6$;

    EXECUTE $mp_32_7$-- Quem tem grupos não grava preço direto no anúncio: o preço que aparece
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
$$;$mp_32_7$;

    EXECUTE $mp_32_8$CREATE TRIGGER spaces_price_from_units
  BEFORE UPDATE OF price_monthly_cents, temp_from_cents, temp_from_units, temp_from_unit ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.guard_space_rental_summary();$mp_32_8$;

    EXECUTE $mp_32_9$-- Histórico de preço (Fase 23) só entre dois preços mensais reais: anúncio
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
$$;$mp_32_9$;

    EXECUTE $mp_32_10$-- ---------------------------------------------------------------------------
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
$$;$mp_32_10$;

    EXECUTE $mp_32_11$CREATE OR REPLACE FUNCTION public.apply_space_occupancy(p_space uuid)
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
$$;$mp_32_11$;

    EXECUTE $mp_32_12$CREATE OR REPLACE FUNCTION public.sync_space_occupancy()
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
$$;$mp_32_12$;

    EXECUTE $mp_32_13$DROP TRIGGER IF EXISTS bookings_sync_space_occupancy ON public.bookings;$mp_32_13$;

    EXECUTE $mp_32_14$CREATE TRIGGER bookings_sync_space_occupancy
  AFTER INSERT OR UPDATE OF status, unit_id ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_space_occupancy();$mp_32_14$;

    EXECUTE $mp_32_15$CREATE OR REPLACE FUNCTION public.guard_published_not_occupied()
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
$$;$mp_32_15$;

    EXECUTE $mp_32_16$CREATE OR REPLACE FUNCTION public.sync_occupancy_from_units()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.apply_space_occupancy(COALESCE(NEW.space_id, OLD.space_id));
  RETURN NULL;
END;
$$;$mp_32_16$;

    EXECUTE $mp_32_17$CREATE TRIGGER space_units_sync_occupancy
  AFTER INSERT OR UPDATE OF active OR DELETE ON public.space_units
  FOR EACH ROW EXECUTE FUNCTION public.sync_occupancy_from_units();$mp_32_17$;

    EXECUTE $mp_32_18$CREATE TRIGGER space_unit_groups_sync_occupancy
  AFTER UPDATE OF active ON public.space_unit_groups
  FOR EACH ROW EXECUTE FUNCTION public.sync_occupancy_from_units();$mp_32_18$;

    EXECUTE $mp_32_19$-- ---------------------------------------------------------------------------
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
$$;$mp_32_19$;

    EXECUTE $mp_32_20$CREATE OR REPLACE FUNCTION public.guard_publish_requires_units()
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
$$;$mp_32_20$;

    EXECUTE $mp_32_21$CREATE TRIGGER spaces_publish_requires_units
  BEFORE INSERT OR UPDATE OF status ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.guard_publish_requires_units();$mp_32_21$;

    EXECUTE $mp_32_22$CREATE OR REPLACE FUNCTION public.unit_has_live_rental(p_unit uuid)
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
$$;$mp_32_22$;

    EXECUTE $mp_32_23$-- Sobra pelo menos uma unidade ativa (num grupo ativo) no anúncio no ar,
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
$$;$mp_32_23$;

    EXECUTE $mp_32_24$CREATE OR REPLACE FUNCTION public.guard_unit_change()
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
$$;$mp_32_24$;

    EXECUTE $mp_32_25$CREATE TRIGGER space_units_guard_change
  BEFORE UPDATE OF active, group_id OR DELETE ON public.space_units
  FOR EACH ROW EXECUTE FUNCTION public.guard_unit_change();$mp_32_25$;

    EXECUTE $mp_32_26$CREATE OR REPLACE FUNCTION public.guard_group_change()
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
$$;$mp_32_26$;

    EXECUTE $mp_32_27$CREATE TRIGGER space_unit_groups_guard_change
  BEFORE UPDATE OF active OR DELETE ON public.space_unit_groups
  FOR EACH ROW EXECUTE FUNCTION public.guard_group_change();$mp_32_27$;

    EXECUTE $mp_32_28$-- ---------------------------------------------------------------------------
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
$$;$mp_32_28$;

    EXECUTE $mp_32_29$CREATE OR REPLACE FUNCTION public.rental_unit_interval(p_unit public.rental_time_unit)
RETURNS interval
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_unit WHEN 'hour' THEN interval '1 hour' WHEN 'day' THEN interval '24 hours' ELSE interval '168 hours' END
$$;$mp_32_29$;

    EXECUTE $mp_32_30$CREATE OR REPLACE FUNCTION public.platform_setting_int(p_key text, p_default integer)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (value #>> '{}')::integer FROM public.platform_settings WHERE key = p_key),
    p_default
  )
$$;$mp_32_30$;

    EXECUTE $mp_32_31$CREATE OR REPLACE FUNCTION public.guard_booking_rental_shape()
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
$$;$mp_32_31$;

    EXECUTE $mp_32_32$-- O nome começa com "derive" de propósito: triggers BEFORE rodam em ordem
-- alfabética, e esta precisa preencher as datas antes de
-- `bookings_guard_blocked_period` conferir o calendário.
CREATE TRIGGER bookings_derive_rental_shape
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_rental_shape();$mp_32_32$;

    EXECUTE $mp_32_33$-- ---------------------------------------------------------------------------
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
$$;$mp_32_33$;

    EXECUTE $mp_32_34$-- ---------------------------------------------------------------------------
-- 7. Dados que já existiam: cada anúncio que já tinha passado da etapa de
-- preço ganha um grupo e uma unidade, com o mesmo preço mensal; cada reserva
-- aponta para essa unidade. Nada muda para quem já alugava.
-- ---------------------------------------------------------------------------
INSERT INTO public.space_unit_groups (space_id, name, position, allows_continuous, allows_temporary, monthly_price_cents)
SELECT s.id, 'Padrão', 0, true, false, s.price_monthly_cents
  FROM public.spaces s
 WHERE s.price_monthly_cents IS NOT NULL
   AND (s.status <> 'draft' OR s.draft_step >= 7)
   AND NOT EXISTS (SELECT 1 FROM public.space_unit_groups g WHERE g.space_id = s.id);$mp_32_34$;

    EXECUTE $mp_32_35$INSERT INTO public.space_units (space_id, group_id, label, position)
SELECT g.space_id, g.id, 'Unidade 1', 1
  FROM public.space_unit_groups g
 WHERE NOT EXISTS (SELECT 1 FROM public.space_units u WHERE u.group_id = g.id);$mp_32_35$;

    EXECUTE $mp_32_36$-- Rascunho que ainda não chegou no preço tinha 1 centavo provisório (o CHECK
-- exigia > 0 desde o INSERT). Agora o campo aceita NULL: sai o provisório.
UPDATE public.spaces s
   SET price_monthly_cents = NULL
 WHERE s.status = 'draft'
   AND NOT EXISTS (SELECT 1 FROM public.space_unit_groups g WHERE g.space_id = s.id);$mp_32_36$;

    EXECUTE $mp_32_37$-- Reservas antigas apontam para a unidade criada acima. O início exato
-- (meia-noite de Brasília do dia de início) vem da trigger da seção 5.
UPDATE public.bookings b
   SET kind = 'continuous',
       group_id = g.id,
       unit_id = u.id
  FROM public.space_unit_groups g
  JOIN public.space_units u ON u.group_id = g.id
 WHERE g.space_id = b.space_id
   AND b.group_id IS NULL;$mp_32_37$;

    EXECUTE $mp_32_38$-- Atraso que já existia ganha o prazo novo a partir de agora (antes não
-- havia prazo nenhum: a unidade podia ficar ocupada para sempre).
UPDATE public.bookings
   SET payment_issue_started_at = now(),
       payment_issue_deadline_at = now() + interval '100 minutes'
 WHERE status = 'past_due' AND payment_issue_started_at IS NULL;$mp_32_38$;

    EXECUTE $mp_32_39$-- Cancelamentos anteriores já passavam pelo Asaas antes do banco.
UPDATE public.subscriptions
   SET provider_cancelled_at = cancelled_at
 WHERE status = 'cancelled' AND provider_cancelled_at IS NULL;$mp_32_39$;

    EXECUTE $mp_32_40$-- ---------------------------------------------------------------------------
-- 8. Restrições que dependem do preenchimento acima.
-- ---------------------------------------------------------------------------

-- Ninguém ocupa a mesma unidade ao mesmo tempo. Contínuo tem intervalo sem
-- fim (occupied_until NULL), então também bloqueia temporário por cima dele.
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_unit_no_overlap
  EXCLUDE USING gist (unit_id WITH =, tstzrange(starts_at, occupied_until, '[)') WITH &&)
  WHERE (unit_id IS NOT NULL AND status IN ('approved', 'awaiting_payment', 'active', 'past_due'));$mp_32_40$;

    EXECUTE $mp_32_41$ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_occupying_has_unit
  CHECK (status NOT IN ('approved', 'awaiting_payment', 'active', 'past_due')
         OR (unit_id IS NOT NULL AND group_id IS NOT NULL AND starts_at IS NOT NULL));$mp_32_41$;

    EXECUTE $mp_32_42$ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_temporary_shape
  CHECK (kind <> 'temporary' OR (
    group_id IS NOT NULL AND unit_id IS NOT NULL
    AND starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at
    AND occupied_until IS NOT NULL
    AND occupied_until >= ends_at
    AND occupied_until <= ends_at + interval '7 minutes'
    AND duration_units IS NOT NULL AND duration_units > 0 AND duration_unit IS NOT NULL
    AND status NOT IN ('requested', 'approved', 'rejected', 'past_due')
  ));$mp_32_42$;

    EXECUTE $mp_32_43$ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_continuous_open_ended
  CHECK (kind <> 'continuous' OR (
    ends_at IS NULL AND occupied_until IS NULL AND hold_expires_at IS NULL
    AND duration_units IS NULL AND duration_unit IS NULL AND renewed_from_id IS NULL
  ));$mp_32_43$;

    EXECUTE $mp_32_44$ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_temporary_hold
  CHECK (kind <> 'temporary' OR status <> 'awaiting_payment' OR hold_expires_at IS NOT NULL);$mp_32_44$;

    EXECUTE $mp_32_45$-- Pagamento pendente: só no contínuo, sempre com o prazo fixo de 40 min +
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
  );$mp_32_45$;

    EXECUTE $mp_32_46$-- `status::text`: 'expired' entrou no enum por ALTER TYPE ... ADD VALUE
-- (0010), e num banco novo todas as migrações rodam numa transação só — o
-- Postgres não deixa usar esse valor como literal na mesma transação.
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_end_reason_matches
  CHECK (end_reason IS NULL OR status::text IN ('ended', 'expired', 'cancelled'));$mp_32_46$;

    EXECUTE $mp_32_47$-- ---------------------------------------------------------------------------
-- 9. RLS (nenhum acesso direto do navegador) e configurações.
-- ---------------------------------------------------------------------------
ALTER TABLE public.space_unit_groups ENABLE ROW LEVEL SECURITY;$mp_32_47$;

    EXECUTE $mp_32_48$ALTER TABLE public.space_units ENABLE ROW LEVEL SECURITY;$mp_32_48$;

    EXECUTE $mp_32_49$DO $$
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
$$;$mp_32_49$;

    EXECUTE $mp_32_50$INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('rental.hold_minutes', '15'::jsonb,
   'Minutos que uma reserva temporária fica segura enquanto a pessoa paga.', true),
  ('rental.max_advance_days', '30'::jsonb,
   'Com quantos dias de antecedência dá para reservar um aluguel temporário.', true)
ON CONFLICT (key) DO NOTHING;$mp_32_50$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('507e172cc33e2c7833a47303de86d3382100df068bcd217ebb27861b385a03e2', 1790849030748);

    RAISE NOTICE 'Migracao 32 (0032_aluguel_unidades) aplicada.';
  END IF;
END
$mp_bloco_32$;


-- ============================================================================
-- Resumo
-- ============================================================================
DO $mp_resumo$
DECLARE aplicadas integer;
BEGIN
  SELECT count(*) INTO aplicadas FROM drizzle.__drizzle_migrations;
  RAISE NOTICE '---';
  RAISE NOTICE 'Pronto: % de 33 migracoes registradas no banco.', aplicadas;
END
$mp_resumo$;

-- Confira o resultado com:
--
--   SELECT count(*) FROM drizzle.__drizzle_migrations;            -- 33
--   SELECT key, value FROM platform_settings ORDER BY key;        -- taxas 3%+3%
--   SELECT PostGIS_Version();                                     -- extensao ativa
