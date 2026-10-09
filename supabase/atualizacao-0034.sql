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
-- Este arquivo tem SO as migracoes 34 em diante. Ele supoe que as
-- anteriores ja foram aplicadas: se o banco estiver mais atrasado, ele para
-- logo no comeco, sem mudar nada. Nesse caso (ou num projeto novo), use
-- supabase/setup.sql, que aplica tudo o que falta.
--
-- Ao terminar, a saida mostra quantas migracoes foram aplicadas agora e
-- quantas ja estavam no banco.
--
-- Gerado por scripts/build-supabase-setup.ts a partir de 4 migracoes
-- testadas contra um Postgres real. Nao edite a mao: altere src/db/schema/,
-- gere a migracao e rode este script de novo.
-- ============================================================================

-- O PostGIS do Supabase e instalado no schema "extensions", nao em "public".
-- Sem isto, o tipo geometry(Point,4326) e o cast ::geography nao sao
-- encontrados e a criacao das tabelas de espacos falha.
SET search_path = public, extensions;

-- Este arquivo continua de onde a migracao 33 parou. Banco mais
-- atrasado que isso: para aqui, antes de mudar qualquer coisa.
DO $mp_pre$
BEGIN
  IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN
    RAISE EXCEPTION 'Este banco ainda não tem o schema do MyPlace. Nada foi alterado: rode o supabase/setup.sql completo.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '602a6622fa40d80b91893ce7a2a449b714fa7c5a80e3cfa02ef8e2f57cea6d2f'
  ) THEN
    RAISE EXCEPTION 'Este banco ainda não tem a migração 33 (0033_modelo_mensal_quantidade). Nada foi alterado: rode o supabase/setup.sql completo, que aplica tudo o que falta.';
  END IF;
END
$mp_pre$;

-- Tabela de controle. Precisa existir antes das checagens abaixo.
CREATE SCHEMA IF NOT EXISTS drizzle;

CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);


-- ----------------------------------------------------------------------------
-- Migracao 34: 0034_premium_assinatura_paga  (56 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_34$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '52a8c8b227d07b52e5805d2e15ba0bb7b6264e40a0631bc8a0cafe5f49df5beb'
  ) THEN
    RAISE NOTICE 'Migracao 34 (0034_premium_assinatura_paga) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_34_0$-- ===========================================================================
-- 0034 — Premium pago (Etapa 2, Fase A).
--
-- O Premium deixa de ser uma concessão manual "para sempre" e vira uma
-- ASSINATURA PAGA de R$ 119,90 por mês, recorrente e PRÓPRIA no Asaas
-- (separada das assinaturas das locações: sem split, dinheiro da plataforma).
--
-- Ideias que o banco passa a garantir:
--   * Premium = pagamento confirmado. Existir uma assinatura NÃO basta: só um
--     CICLO pago cujo período cobre "agora" faz a pessoa ser Premium
--     (`premium_is_active`, pelo relógio do banco).
--   * Ciclo = período mensal EFETIVAMENTE pago. Cada cobrança confirmada gera
--     exatamente um ciclo; ciclos da mesma pessoa nunca se sobrepõem.
--   * Os benefícios (2 Destaques e 1 Turbo) valem POR CICLO e não acumulam: a
--     trava `promotions_guard_premium_quota` conta no ciclo, com o ciclo
--     travado, e recusa o que passa do limite.
--   * Concessão administrativa existe só como modo teste/suporte: tem data de
--     fim, não tem cobrança e NÃO dá os benefícios financeiros (taxa reduzida,
--     primeiro mês) a menos que a marca de teste seja ligada de propósito.
--
-- Nota sobre `premium_membership_status`: 'pending_payment' e 'expired' são
-- valores NOVOS de um enum EXISTENTE. O migrador roda tudo numa transação só e
-- o Postgres não deixa usar um valor recém-acrescentado na mesma transação —
-- por isso nada aqui os usa como literal (só em corpos plpgsql, que são
-- compilados na primeira execução, e em comparações por texto).
-- ===========================================================================

ALTER TYPE "public"."premium_membership_status" ADD VALUE 'pending_payment';$mp_34_0$;

    EXECUTE $mp_34_1$ALTER TYPE "public"."premium_membership_status" ADD VALUE 'expired';$mp_34_1$;

    EXECUTE $mp_34_2$CREATE TABLE "premium_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text DEFAULT 'asaas' NOT NULL,
	"provider_payment_id" text NOT NULL,
	"provider_subscription_id" text,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"method" "payment_method",
	"amount_cents" integer NOT NULL,
	"gateway_fee_cents" integer,
	"net_amount_cents" integer,
	"refunded_cents" integer DEFAULT 0 NOT NULL,
	"due_date" date NOT NULL,
	"paid_at" timestamp with time zone,
	"credited_at" timestamp with time zone,
	"invoice_url" text,
	"failure_reason" text,
	"provider_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "premium_charges_amount_positive" CHECK ("premium_charges"."amount_cents" > 0),
	CONSTRAINT "premium_charges_refund_within_amount" CHECK ("premium_charges"."refunded_cents" BETWEEN 0 AND "premium_charges"."amount_cents")
);$mp_34_2$;

    EXECUTE $mp_34_3$CREATE TABLE "premium_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"source" "premium_membership_source" NOT NULL,
	"charge_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"ended_early_at" timestamp with time zone,
	"ended_early_reason" text,
	"financial_eligible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "premium_cycles_ends_after_starts" CHECK ("premium_cycles"."ends_at" > "premium_cycles"."starts_at"),
	CONSTRAINT "premium_cycles_ended_early_within" CHECK ("premium_cycles"."ended_early_at" IS NULL OR ("premium_cycles"."ended_early_at" >= "premium_cycles"."starts_at" AND "premium_cycles"."ended_early_at" <= "premium_cycles"."ends_at")),
	CONSTRAINT "premium_cycles_charge_matches_source" CHECK (("premium_cycles"."source"::text = 'subscription') = ("premium_cycles"."charge_id" IS NOT NULL))
);$mp_34_3$;

    EXECUTE $mp_34_4$ALTER TABLE "premium_memberships" ALTER COLUMN "status" DROP DEFAULT;$mp_34_4$;

    EXECUTE $mp_34_5$ALTER TABLE "premium_memberships" ALTER COLUMN "source" DROP DEFAULT;$mp_34_5$;

    EXECUTE $mp_34_6$ALTER TABLE "ledger_entries" ADD COLUMN "premium_charge_id" uuid;$mp_34_6$;

    EXECUTE $mp_34_7$ALTER TABLE "premium_memberships" ADD COLUMN "provider" text;$mp_34_7$;

    EXECUTE $mp_34_8$ALTER TABLE "premium_memberships" ADD COLUMN "provider_subscription_id" text;$mp_34_8$;

    EXECUTE $mp_34_9$ALTER TABLE "premium_memberships" ADD COLUMN "billing_method" "payment_method";$mp_34_9$;

    EXECUTE $mp_34_10$ALTER TABLE "premium_memberships" ADD COLUMN "plan_cents" integer;$mp_34_10$;

    EXECUTE $mp_34_11$ALTER TABLE "premium_memberships" ADD COLUMN "current_period_start" timestamp with time zone;$mp_34_11$;

    EXECUTE $mp_34_12$ALTER TABLE "premium_memberships" ADD COLUMN "current_period_end" timestamp with time zone;$mp_34_12$;

    EXECUTE $mp_34_13$ALTER TABLE "premium_memberships" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;$mp_34_13$;

    EXECUTE $mp_34_14$ALTER TABLE "premium_memberships" ADD COLUMN "cancel_requested_at" timestamp with time zone;$mp_34_14$;

    EXECUTE $mp_34_15$ALTER TABLE "premium_memberships" ADD COLUMN "provider_cancelled_at" timestamp with time zone;$mp_34_15$;

    EXECUTE $mp_34_16$ALTER TABLE "premium_memberships" ADD COLUMN "financial_test_enabled" boolean DEFAULT false NOT NULL;$mp_34_16$;

    EXECUTE $mp_34_17$ALTER TABLE "promotions" ADD COLUMN "premium_cycle_id" uuid;$mp_34_17$;

    EXECUTE $mp_34_18$ALTER TABLE "premium_charges" ADD CONSTRAINT "premium_charges_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;$mp_34_18$;

    EXECUTE $mp_34_19$ALTER TABLE "premium_cycles" ADD CONSTRAINT "premium_cycles_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;$mp_34_19$;

    EXECUTE $mp_34_20$ALTER TABLE "premium_cycles" ADD CONSTRAINT "premium_cycles_charge_id_premium_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."premium_charges"("id") ON DELETE restrict ON UPDATE no action;$mp_34_20$;

    EXECUTE $mp_34_21$CREATE UNIQUE INDEX "premium_charges_provider_id_key" ON "premium_charges" USING btree ("provider","provider_payment_id");$mp_34_21$;

    EXECUTE $mp_34_22$CREATE INDEX "premium_charges_user_idx" ON "premium_charges" USING btree ("user_id","created_at");$mp_34_22$;

    EXECUTE $mp_34_23$CREATE INDEX "premium_charges_status_idx" ON "premium_charges" USING btree ("status");$mp_34_23$;

    EXECUTE $mp_34_24$CREATE INDEX "premium_charges_subscription_idx" ON "premium_charges" USING btree ("provider_subscription_id");$mp_34_24$;

    EXECUTE $mp_34_25$CREATE UNIQUE INDEX "premium_cycles_user_number_key" ON "premium_cycles" USING btree ("user_id","number");$mp_34_25$;

    EXECUTE $mp_34_26$CREATE UNIQUE INDEX "premium_cycles_charge_key" ON "premium_cycles" USING btree ("charge_id");$mp_34_26$;

    EXECUTE $mp_34_27$CREATE INDEX "premium_cycles_user_ends_idx" ON "premium_cycles" USING btree ("user_id","ends_at");$mp_34_27$;

    EXECUTE $mp_34_28$ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_premium_charge_id_premium_charges_id_fk" FOREIGN KEY ("premium_charge_id") REFERENCES "public"."premium_charges"("id") ON DELETE restrict ON UPDATE no action;$mp_34_28$;

    EXECUTE $mp_34_29$ALTER TABLE "promotions" ADD CONSTRAINT "promotions_premium_cycle_id_premium_cycles_id_fk" FOREIGN KEY ("premium_cycle_id") REFERENCES "public"."premium_cycles"("id") ON DELETE restrict ON UPDATE no action;$mp_34_29$;

    EXECUTE $mp_34_30$CREATE INDEX "ledger_premium_charge_idx" ON "ledger_entries" USING btree ("premium_charge_id");$mp_34_30$;

    EXECUTE $mp_34_31$CREATE UNIQUE INDEX "premium_memberships_provider_sub_key" ON "premium_memberships" USING btree ("provider","provider_subscription_id") WHERE provider_subscription_id IS NOT NULL;$mp_34_31$;

    EXECUTE $mp_34_32$CREATE INDEX "premium_memberships_cancel_pending_idx" ON "premium_memberships" USING btree ("updated_at") WHERE provider_subscription_id IS NOT NULL AND provider_cancelled_at IS NULL;$mp_34_32$;

    EXECUTE $mp_34_33$CREATE INDEX "promotions_premium_cycle_idx" ON "promotions" USING btree ("premium_cycle_id","type");$mp_34_33$;

    EXECUTE $mp_34_34$-- ---------------------------------------------------------------------------
-- Tabelas novas: só o servidor lê (mesma categoria de payments/promotions —
-- RLS ligado e nenhuma policy; `ALTER DEFAULT PRIVILEGES` da 0001 já tira o
-- acesso de anon/authenticated).
-- ---------------------------------------------------------------------------
ALTER TABLE "premium_charges" ENABLE ROW LEVEL SECURITY;$mp_34_34$;

    EXECUTE $mp_34_35$ALTER TABLE "premium_cycles" ENABLE ROW LEVEL SECURITY;$mp_34_35$;

    EXECUTE $mp_34_36$-- ---------------------------------------------------------------------------
-- Dados que já existiam. A concessão manual antiga não tinha data de fim
-- ("para sempre"). Daqui em diante TODO Premium tem fim: as concessões que
-- estão ativas passam a valer por mais 30 dias a partir desta migração, como
-- ciclo administrativo (sem benefícios financeiros). As demais ficam como estão.
-- ---------------------------------------------------------------------------
UPDATE public.premium_memberships
   SET current_period_start = now(),
       current_period_end = now() + interval '30 days',
       updated_at = now()
 WHERE status::text = 'active';$mp_34_36$;

    EXECUTE $mp_34_37$INSERT INTO public.premium_cycles (user_id, number, source, starts_at, ends_at, financial_eligible)
SELECT user_id, 1, 'admin_grant', current_period_start, current_period_end, false
  FROM public.premium_memberships
 WHERE status::text = 'active';$mp_34_37$;

    EXECUTE $mp_34_38$-- Agora as regras que dependem desses dados.
ALTER TABLE "premium_memberships" ADD CONSTRAINT "premium_memberships_period_order" CHECK ("premium_memberships"."current_period_start" IS NULL OR "premium_memberships"."current_period_end" IS NULL OR "premium_memberships"."current_period_end" > "premium_memberships"."current_period_start");$mp_34_38$;

    EXECUTE $mp_34_39$ALTER TABLE "premium_memberships" ADD CONSTRAINT "premium_memberships_active_has_period" CHECK ("premium_memberships"."status"::text <> 'active' OR "premium_memberships"."current_period_end" IS NOT NULL);$mp_34_39$;

    EXECUTE $mp_34_40$ALTER TABLE "premium_memberships" ADD CONSTRAINT "premium_memberships_cancel_request_has_timestamp" CHECK (NOT "premium_memberships"."cancel_at_period_end" OR "premium_memberships"."cancel_requested_at" IS NOT NULL);$mp_34_40$;

    EXECUTE $mp_34_41$ALTER TABLE "premium_memberships" ADD CONSTRAINT "premium_memberships_financial_test_admin_only" CHECK (NOT "premium_memberships"."financial_test_enabled" OR "premium_memberships"."source"::text = 'admin_grant');$mp_34_41$;

    EXECUTE $mp_34_42$ALTER TABLE "premium_memberships" ADD CONSTRAINT "premium_memberships_subscription_has_plan" CHECK ("premium_memberships"."source"::text <> 'subscription' OR ("premium_memberships"."plan_cents" IS NOT NULL AND "premium_memberships"."plan_cents" > 0));$mp_34_42$;

    EXECUTE $mp_34_43$-- Ciclos da mesma pessoa nunca se sobrepõem (intervalo meio-aberto: um ciclo
-- que começa exatamente quando o outro termina é permitido). O fim efetivo é
-- o antecipado, quando houver. `btree_gist` vem da 0032.
ALTER TABLE public.premium_cycles
  ADD CONSTRAINT premium_cycles_no_overlap
  EXCLUDE USING gist (user_id WITH =, tstzrange(starts_at, COALESCE(ended_early_at, ends_at)) WITH &&);$mp_34_43$;

    EXECUTE $mp_34_44$-- ---------------------------------------------------------------------------
-- "Esta pessoa é Premium agora?" — UMA definição, usada por todo o app e por
-- todo gatilho. Pelo relógio do banco (`now()`), nunca do servidor.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.premium_current_cycle_id(p_user uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT c.id
    FROM public.premium_cycles c
   WHERE c.user_id = p_user
     AND c.starts_at <= now()
     AND now() < COALESCE(c.ended_early_at, c.ends_at)
   ORDER BY c.ends_at DESC
   LIMIT 1
$$;$mp_34_44$;

    EXECUTE $mp_34_45$CREATE OR REPLACE FUNCTION public.premium_is_active(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.premium_cycles c
     WHERE c.user_id = p_user
       AND c.starts_at <= now()
       AND now() < COALESCE(c.ended_early_at, c.ends_at)
  )
$$;$mp_34_45$;

    EXECUTE $mp_34_46$-- Premium que dá direito aos benefícios FINANCEIROS (taxa reduzida, primeiro
-- mês): o ciclo vigente precisa ter nascido de pagamento confirmado — ou de
-- concessão administrativa com a marca de teste ligada de propósito.
CREATE OR REPLACE FUNCTION public.premium_financial_active(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.premium_cycles c
     WHERE c.user_id = p_user
       AND c.financial_eligible
       AND c.starts_at <= now()
       AND now() < COALESCE(c.ended_early_at, c.ends_at)
  )
$$;$mp_34_46$;

    EXECUTE $mp_34_47$-- ---------------------------------------------------------------------------
-- Ciclo não se edita nem se apaga: o direito aos benefícios nasce dele. A
-- única mudança permitida é marcar o fim antecipado (estorno, contestação,
-- revogação), uma vez só.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.premium_cycles_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Ciclo do Premium não se apaga: encerre-o (ended_early_at).'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_cycles_immutable';
  END IF;

  IF NEW.user_id <> OLD.user_id
     OR NEW.number <> OLD.number
     OR NEW.source <> OLD.source
     OR NEW.charge_id IS DISTINCT FROM OLD.charge_id
     OR NEW.starts_at <> OLD.starts_at
     OR NEW.ends_at <> OLD.ends_at
     OR NEW.financial_eligible <> OLD.financial_eligible THEN
    RAISE EXCEPTION 'Ciclo do Premium não se altera: só o fim antecipado pode ser marcado.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_cycles_immutable';
  END IF;

  IF OLD.ended_early_at IS NOT NULL AND NEW.ended_early_at IS DISTINCT FROM OLD.ended_early_at THEN
    RAISE EXCEPTION 'Este ciclo já foi encerrado antes do fim.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_cycles_immutable';
  END IF;
  RETURN NEW;
END;
$$;$mp_34_47$;

    EXECUTE $mp_34_48$CREATE TRIGGER premium_cycles_immutable
  BEFORE UPDATE OR DELETE ON public.premium_cycles
  FOR EACH ROW EXECUTE FUNCTION public.premium_cycles_guard();$mp_34_48$;

    EXECUTE $mp_34_49$-- ---------------------------------------------------------------------------
-- Benefício do Premium (Destaque/Turbo) — saldo POR CICLO, garantido pelo
-- banco. O código confere antes (mensagem clara), mas é aqui que vale de
-- verdade: duas abas ativando ao mesmo tempo, ou uma chamada direta, não
-- passam do limite. O ciclo é travado (FOR UPDATE) durante a conta, então dois
-- inserts simultâneos entram em fila e o segundo já enxerga o primeiro.
-- Promoção cancelada CONTA: o benefício usado não volta. Limites vêm de
-- platform_settings (`premium.cycle_destaque_limit` / `premium.cycle_turbo_limit`).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_premium_benefit_quota()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_cycle public.premium_cycles%ROWTYPE;
  v_limit integer;
  v_used integer;
BEGIN
  IF NEW.source <> 'premium_benefit' THEN
    RETURN NEW;
  END IF;

  IF NEW.premium_cycle_id IS NULL THEN
    RAISE EXCEPTION 'O benefício do Premium precisa estar ligado a um ciclo pago.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'promotions_premium_needs_cycle';
  END IF;

  SELECT * INTO v_cycle FROM public.premium_cycles WHERE id = NEW.premium_cycle_id FOR UPDATE;
  IF NOT FOUND
     OR v_cycle.user_id <> NEW.owner_id
     OR v_cycle.starts_at > now()
     OR now() >= COALESCE(v_cycle.ended_early_at, v_cycle.ends_at) THEN
    RAISE EXCEPTION 'O ciclo do Premium não está vigente para esta pessoa.'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'promotions_premium_cycle_not_current';
  END IF;

  v_limit := public.platform_setting_int(
    'premium.cycle_' || NEW.type::text || '_limit',
    CASE WHEN NEW.type::text = 'turbo' THEN 1 ELSE 2 END
  );
  SELECT count(*) INTO v_used
    FROM public.promotions
   WHERE premium_cycle_id = NEW.premium_cycle_id AND type = NEW.type;

  IF v_used >= v_limit THEN
    RAISE EXCEPTION 'Os benefícios deste ciclo do Premium já foram usados (limite %).', v_limit
      USING ERRCODE = 'check_violation', CONSTRAINT = 'promotions_premium_cycle_quota';
  END IF;
  RETURN NEW;
END;
$$;$mp_34_49$;

    EXECUTE $mp_34_50$CREATE TRIGGER promotions_guard_premium_quota
  BEFORE INSERT ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.guard_premium_benefit_quota();$mp_34_50$;

    EXECUTE $mp_34_51$-- ---------------------------------------------------------------------------
-- Varredura: arruma o ESTADO guardado para refletir o relógio. A correção não
-- depende dela (as consultas usam `premium_is_active`); ela existe para
-- avisar quem precisa saber e para o agendador cancelar a recorrência no
-- gateway do que acabou.
--   1. período pago acabou sem renovação confirmada → `expired` (ou `cancelled`,
--      se a pessoa tinha pedido para não renovar);
--   2. assinatura que nunca foi paga (abandonada há N dias) → `expired`.
-- Devolve quantas assinaturas mudaram. Idempotente.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_premium_memberships()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_total integer := 0;
  v_n integer;
BEGIN
  UPDATE public.premium_memberships pm
     SET status = CASE WHEN pm.cancel_at_period_end
                       THEN 'cancelled'::public.premium_membership_status
                       ELSE 'expired'::public.premium_membership_status END,
         cancelled_at = CASE WHEN pm.cancel_at_period_end THEN COALESCE(pm.cancelled_at, now()) ELSE pm.cancelled_at END,
         updated_at = now()
   WHERE pm.status::text = 'active'
     AND NOT public.premium_is_active(pm.user_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  UPDATE public.premium_memberships pm
     SET status = 'expired'::public.premium_membership_status,
         updated_at = now()
   WHERE pm.status::text = 'pending_payment'
     AND pm.updated_at < now() - make_interval(days => public.platform_setting_int('premium.pending_max_days', 3));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  RETURN v_total;
END;
$$;$mp_34_51$;

    EXECUTE $mp_34_52$-- ---------------------------------------------------------------------------
-- O limite de alertas por plano passa a olhar o Premium VIGENTE (ciclo pago),
-- não a linha `status = 'active'`, que pode sobrar depois do fim do período.
-- (Mesma função da 0028 — só a pergunta "é Premium?" mudou.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_saved_search_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_premium boolean;
  v_limite integer;
  v_ativos integer;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN
    RETURN NEW; -- já contava; editar critérios de um alerta ativo não muda a conta
  END IF;

  PERFORM 1 FROM profiles WHERE id = NEW.user_id FOR UPDATE;

  v_premium := public.premium_is_active(NEW.user_id);

  SELECT COALESCE(
    (SELECT (value #>> '{}')::integer FROM platform_settings
      WHERE key = CASE WHEN v_premium THEN 'alerts.saved_search_max_premium' ELSE 'alerts.saved_search_max_free' END),
    CASE WHEN v_premium THEN 20 ELSE 2 END
  ) INTO v_limite;

  SELECT count(*) INTO v_ativos
  FROM saved_searches
  WHERE user_id = NEW.user_id AND status = 'active' AND id <> NEW.id;

  IF v_ativos >= v_limite THEN
    RAISE EXCEPTION 'Limite de % alertas ativos atingido', v_limite
      USING ERRCODE = 'check_violation', CONSTRAINT = 'saved_searches_active_limit';
  END IF;
  RETURN NEW;
END;
$$;$mp_34_52$;

    EXECUTE $mp_34_53$-- ---------------------------------------------------------------------------
-- Configuração (mudar é um UPDATE, sem deploy).
--   * Preço definitivo do Premium: R$ 119,90 por mês. O plano anual NÃO existe.
--   * Saldo do ciclo, continuidade entre ciclos, abandono de assinatura nunca
--     paga e o alcance ampliado no mapa.
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('premium.price_monthly_cents', '11990'::jsonb,
   'Preço do Premium (assinatura mensal recorrente no Asaas), em centavos. Quem já assinou mantém o preço combinado.', true)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = now();$mp_34_53$;

    EXECUTE $mp_34_54$DELETE FROM public.platform_settings WHERE key = 'premium.price_yearly_cents';$mp_34_54$;

    EXECUTE $mp_34_55$INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('premium.cycle_destaque_limit', '2'::jsonb,
   'Destaques gratuitos por ciclo pago do Premium. Não acumulam para o ciclo seguinte.', false),
  ('premium.cycle_turbo_limit', '1'::jsonb,
   'Turbos gratuitos por ciclo pago do Premium. Não acumulam para o ciclo seguinte.', false),
  ('premium.cycle_continuity_hours', '24'::jsonb,
   'Renovação confirmada até N horas depois do fim do ciclo anterior continua o ciclo (sem buraco no calendário); depois disso, o novo ciclo começa na confirmação.', false),
  ('premium.pending_max_days', '3'::jsonb,
   'Dias que uma assinatura nunca paga fica aguardando o primeiro pagamento antes de ser dada como expirada.', false),
  ('premium.expired_cancel_after_days', '3'::jsonb,
   'Dias entre o Premium expirar e a recorrência ser cancelada no Asaas. Nesse intervalo, um pagamento atrasado ainda reativa o Premium e a assinatura segue.', false),
  ('premium.map_extra_radius_m', '10000'::jsonb,
   'Alcance ampliado do Premium no mapa: metros ALÉM do raio normal em que os anúncios de assinantes podem aparecer.', false),
  ('premium.map_max_outside_pins', '5'::jsonb,
   'Máximo de anúncios Premium individuais mostrados fora do raio normal, além do que Destaque/Turbo já mostram.', false)
ON CONFLICT (key) DO NOTHING;$mp_34_55$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('52a8c8b227d07b52e5805d2e15ba0bb7b6264e40a0631bc8a0cafe5f49df5beb', 1791329586945);

    RAISE NOTICE 'Migracao 34 (0034_premium_assinatura_paga) aplicada.';
  END IF;
END
$mp_bloco_34$;


-- ----------------------------------------------------------------------------
-- Migracao 35: 0035_taxa_premium_proprietario  (3 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_35$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '4e1f15597806378d85f9f5a3af9f7b0f513459a4543d51b46ec37ce8ea7ade67'
  ) THEN
    RAISE NOTICE 'Migracao 35 (0035_taxa_premium_proprietario) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_35_0$-- ===========================================================================
-- 0035 — Taxa do proprietário no Premium (Etapa 2, Fase B).
--
-- Decisão do produto: o proprietário com Premium PAGO e vigente paga 2% de taxa
-- de serviço em vez de 3%, desde que o aluguel seja de R$ 50,00 ou mais. A taxa
-- do locatário NÃO muda (segue a regra normal, 3%).
--
-- Por que existe o piso de R$ 50: com 3% do locatário + 2% do proprietário, o
-- Pix (R$ 1,99 por recebimento) só se paga a partir de R$ 39,80 — abaixo disso
-- o líquido da cobrança fica MENOR que o repasse ao proprietário e o Asaas
-- rejeitaria o split. Abaixo do piso vale a taxa padrão (a conta fecha).
--
-- Quem decide é o servidor (`resolveBookingFees`, src/lib/bookings/fees.ts); o
-- banco confere. A taxa é decidida quando a locação nasce, é refeita e
-- CONGELADA no aceite, e dali em diante só muda se alguém mexer nas colunas de
-- taxa (o que o gatilho abaixo também confere). Um Premium que acaba depois do
-- aceite não altera uma locação já aceita; locações novas pagam a taxa padrão.
--
-- Premium concedido pela administração (modo teste/suporte) NÃO reduz a taxa,
-- a menos que a concessão tenha a marca de teste financeiro ligada de propósito
-- (`premium_financial_active`, migração 0034).
-- ===========================================================================

INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('fees.owner_fee_bps_premium', '200'::jsonb,
   'Taxa de serviço do proprietário com Premium pago e vigente, em pontos-base (200 = 2%). Vale para aluguel a partir do piso abaixo.', true),
  ('fees.premium_min_rent_cents', '5000'::jsonb,
   'Aluguel mínimo, em centavos, para a taxa reduzida do Premium. Abaixo disso vale a taxa padrão (o gateway rejeitaria o repasse).', true)
ON CONFLICT (key) DO NOTHING;$mp_35_0$;

    EXECUTE $mp_35_1$-- ---------------------------------------------------------------------------
-- A taxa do proprietário numa locação só pode ser a padrão OU a reduzida — e a
-- reduzida só com Premium financeiro vigente e aluguel acima do piso. Também
-- confere que os centavos batem com os pontos-base (mesmo arredondamento do
-- servidor, meio para cima), porque são os centavos que movem o dinheiro.
-- Confere no nascimento da locação, no aceite (que congela a taxa) e quando
-- alguém muda as colunas de taxa. Mexidas que não tocam na taxa (pagamento,
-- encerramento…) passam direto: uma locação antiga não é reavaliada.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_booking_owner_fee()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_padrao integer := public.platform_setting_int('fees.owner_fee_bps', 300);
  v_premium integer := public.platform_setting_int('fees.owner_fee_bps_premium', 200);
  v_piso integer := public.platform_setting_int('fees.premium_min_rent_cents', 5000);
BEGIN
  IF TG_OP = 'INSERT'
     OR (OLD.status = 'requested' AND NEW.status = 'approved')
     OR NEW.owner_fee_bps IS DISTINCT FROM OLD.owner_fee_bps
     OR NEW.owner_fee_cents IS DISTINCT FROM OLD.owner_fee_cents THEN

    IF NEW.owner_fee_cents <> round(NEW.monthly_rent_cents::numeric * NEW.owner_fee_bps / 10000) THEN
      RAISE EXCEPTION 'Taxa do proprietario em centavos nao confere com a porcentagem'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_owner_fee_matches_bps';
    END IF;

    IF NEW.owner_fee_bps = v_padrao THEN
      RETURN NEW;
    END IF;

    IF NEW.owner_fee_bps = v_premium
       AND v_premium < v_padrao
       AND NEW.monthly_rent_cents >= v_piso
       AND public.premium_financial_active(NEW.owner_id) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Taxa do proprietario nao permitida para esta locacao'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_owner_fee_allowed';
  END IF;
  RETURN NEW;
END;
$$;$mp_35_1$;

    EXECUTE $mp_35_2$-- O nome faz o gatilho rodar DEPOIS de `bookings_guard_price` (ordem alfabética): preço adulterado
-- continua sendo recusado por `bookings_rent_matches_space`, a regra mais específica.
CREATE TRIGGER bookings_guard_price_fee
  BEFORE INSERT OR UPDATE OF status, owner_fee_bps, owner_fee_cents, monthly_rent_cents ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_owner_fee();$mp_35_2$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('4e1f15597806378d85f9f5a3af9f7b0f513459a4543d51b46ec37ce8ea7ade67', 1791331653515);

    RAISE NOTICE 'Migracao 35 (0035_taxa_premium_proprietario) aplicada.';
  END IF;
END
$mp_bloco_35$;


-- ----------------------------------------------------------------------------
-- Migracao 36: 0036_premium_beneficio_primeiro_mes  (29 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_36$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '6287b513025d94a8670a48433a6043e9567190861e5cbee786629a286feb0868'
  ) THEN
    RAISE NOTICE 'Migracao 36 (0036_premium_beneficio_primeiro_mes) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_36_0$CREATE TYPE "public"."platform_transfer_status" AS ENUM('queued', 'sent', 'confirmed', 'failed', 'cancelled');$mp_36_0$;

    EXECUTE $mp_36_1$CREATE TYPE "public"."premium_benefit_status" AS ENUM('reserved', 'consumed', 'cancelled');$mp_36_1$;

    EXECUTE $mp_36_2$ALTER TYPE "public"."ledger_entry_type" ADD VALUE 'premium_benefit_funded' BEFORE 'deposit_charged';$mp_36_2$;

    EXECUTE $mp_36_3$CREATE TABLE "platform_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"benefit_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"destination_wallet_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" "platform_transfer_status" DEFAULT 'queued' NOT NULL,
	"provider_transfer_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	CONSTRAINT "platform_transfers_amount_positive" CHECK ("platform_transfers"."amount_cents" > 0)
);$mp_36_3$;

    EXECUTE $mp_36_4$CREATE TABLE "premium_benefits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"identity_hash" text NOT NULL,
	"period_key" text NOT NULL,
	"booking_id" uuid NOT NULL,
	"status" "premium_benefit_status" DEFAULT 'reserved' NOT NULL,
	"max_cents" integer NOT NULL,
	"benefit_cents" integer NOT NULL,
	"charge_total_cents" integer NOT NULL,
	"payer_pays_cents" integer NOT NULL,
	"owner_payout_cents" integer NOT NULL,
	"provider_payment_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	CONSTRAINT "premium_benefits_amount_positive" CHECK ("premium_benefits"."benefit_cents" > 0),
	CONSTRAINT "premium_benefits_within_max" CHECK ("premium_benefits"."benefit_cents" <= "premium_benefits"."max_cents"),
	CONSTRAINT "premium_benefits_payer_pays" CHECK ("premium_benefits"."payer_pays_cents" = "premium_benefits"."charge_total_cents" - "premium_benefits"."benefit_cents" AND "premium_benefits"."payer_pays_cents" > 0),
	CONSTRAINT "premium_benefits_cancel_has_timestamp" CHECK ("premium_benefits"."status"::text <> 'cancelled' OR "premium_benefits"."cancelled_at" IS NOT NULL),
	CONSTRAINT "premium_benefits_consumed_has_timestamp" CHECK ("premium_benefits"."status"::text <> 'consumed' OR "premium_benefits"."consumed_at" IS NOT NULL)
);$mp_36_4$;

    EXECUTE $mp_36_5$ALTER TABLE "ledger_entries" ADD COLUMN "premium_benefit_id" uuid;$mp_36_5$;

    EXECUTE $mp_36_6$ALTER TABLE "platform_transfers" ADD CONSTRAINT "platform_transfers_benefit_id_premium_benefits_id_fk" FOREIGN KEY ("benefit_id") REFERENCES "public"."premium_benefits"("id") ON DELETE restrict ON UPDATE no action;$mp_36_6$;

    EXECUTE $mp_36_7$ALTER TABLE "platform_transfers" ADD CONSTRAINT "platform_transfers_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;$mp_36_7$;

    EXECUTE $mp_36_8$ALTER TABLE "premium_benefits" ADD CONSTRAINT "premium_benefits_cycle_id_premium_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."premium_cycles"("id") ON DELETE restrict ON UPDATE no action;$mp_36_8$;

    EXECUTE $mp_36_9$ALTER TABLE "premium_benefits" ADD CONSTRAINT "premium_benefits_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;$mp_36_9$;

    EXECUTE $mp_36_10$ALTER TABLE "premium_benefits" ADD CONSTRAINT "premium_benefits_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;$mp_36_10$;

    EXECUTE $mp_36_11$CREATE UNIQUE INDEX "platform_transfers_benefit_key" ON "platform_transfers" USING btree ("benefit_id");$mp_36_11$;

    EXECUTE $mp_36_12$CREATE UNIQUE INDEX "platform_transfers_provider_key" ON "platform_transfers" USING btree ("provider_transfer_id") WHERE "platform_transfers"."provider_transfer_id" IS NOT NULL;$mp_36_12$;

    EXECUTE $mp_36_13$CREATE INDEX "platform_transfers_status_idx" ON "platform_transfers" USING btree ("status");$mp_36_13$;

    EXECUTE $mp_36_14$CREATE UNIQUE INDEX "premium_benefits_booking_key" ON "premium_benefits" USING btree ("booking_id");$mp_36_14$;

    EXECUTE $mp_36_15$CREATE UNIQUE INDEX "premium_benefits_cycle_live_key" ON "premium_benefits" USING btree ("cycle_id") WHERE "premium_benefits"."status" <> 'cancelled';$mp_36_15$;

    EXECUTE $mp_36_16$CREATE UNIQUE INDEX "premium_benefits_identity_period_live_key" ON "premium_benefits" USING btree ("identity_hash","period_key") WHERE "premium_benefits"."status" <> 'cancelled';$mp_36_16$;

    EXECUTE $mp_36_17$CREATE INDEX "premium_benefits_user_idx" ON "premium_benefits" USING btree ("user_id");$mp_36_17$;

    EXECUTE $mp_36_18$ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_premium_benefit_id_premium_benefits_id_fk" FOREIGN KEY ("premium_benefit_id") REFERENCES "public"."premium_benefits"("id") ON DELETE restrict ON UPDATE no action;$mp_36_18$;

    EXECUTE $mp_36_19$CREATE INDEX "ledger_premium_benefit_idx" ON "ledger_entries" USING btree ("premium_benefit_id");$mp_36_19$;

    EXECUTE $mp_36_20$-- ===========================================================================
-- 0036 — Benefício do primeiro mês do Premium (Etapa 2, Fase C).
--
-- ATRÁS DE FEATURE FLAG, DESLIGADA (`premium.first_month_benefit_enabled` = 0):
-- nenhum dinheiro da plataforma se move enquanto o fluxo de transferência não
-- for validado no Asaas (sandbox e configuração real) — ver
-- docs/PREMIUM-BENEFICIO.md. O banco recusa criar benefício com a flag
-- desligada, então nem um bug no servidor libera o benefício financeiro.
-- ===========================================================================

INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('premium.first_month_benefit_enabled', '0'::jsonb,
   'FEATURE FLAG do benefício de primeiro mês (0 = desligado, 1 = ligado). NÃO ligar antes de validar a transferência no Asaas.', false),
  ('premium.first_month_benefit_max_cents', '10000'::jsonb,
   'Teto do benefício de primeiro mês por ciclo, em centavos (R$ 100,00). Nunca é ultrapassado.', true),
  ('premium.card_hold_days', '7'::jsonb,
   'Carência, em dias, do benefício financeiro quando o Premium foi pago no cartão (trava de risco, não garantia contra contestação). Pix libera na confirmação.', true),
  ('premium.benefit_min_charge_cents', '500'::jsonb,
   'Menor cobrança que o gateway aceita (R$ 5,00). Se o benefício deixaria a cobrança abaixo disso, ele não é aplicado — nunca se aumenta o benefício para completar.', true)
ON CONFLICT (key) DO NOTHING;$mp_36_20$;

    EXECUTE $mp_36_21$-- O ciclo que dá direito ao benefício AGORA: pago (ou teste financeiro explícito), vigente, e — no cartão —
-- fora da carência. Tudo pelo relógio do banco.
CREATE OR REPLACE FUNCTION public.premium_benefit_cycle_id(p_user uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT c.id
    FROM public.premium_cycles c
    LEFT JOIN public.premium_charges ch ON ch.id = c.charge_id
   WHERE c.user_id = p_user
     AND c.financial_eligible
     AND c.starts_at <= now()
     AND now() < COALESCE(c.ended_early_at, c.ends_at)
     AND (
           c.charge_id IS NULL                       -- teste financeiro explícito da administração
        OR ch.method::text = 'pix'
        OR (ch.paid_at IS NOT NULL
            AND ch.paid_at + make_interval(days => public.platform_setting_int('premium.card_hold_days', 7)) <= now())
     )
   ORDER BY c.starts_at DESC
   LIMIT 1
$$;$mp_36_21$;

    EXECUTE $mp_36_22$CREATE OR REPLACE FUNCTION public.guard_premium_benefit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_max integer := public.platform_setting_int('premium.first_month_benefit_max_cents', 10000);
  v_min integer := public.platform_setting_int('premium.benefit_min_charge_cents', 500);
  v_cycle uuid;
  b record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Só o estado e seus carimbos mudam; o direito, os valores e a identidade não.
    IF NEW.cycle_id <> OLD.cycle_id OR NEW.user_id <> OLD.user_id OR NEW.identity_hash <> OLD.identity_hash
       OR NEW.period_key <> OLD.period_key OR NEW.booking_id <> OLD.booking_id OR NEW.max_cents <> OLD.max_cents
       OR NEW.benefit_cents <> OLD.benefit_cents OR NEW.charge_total_cents <> OLD.charge_total_cents
       OR NEW.payer_pays_cents <> OLD.payer_pays_cents OR NEW.owner_payout_cents <> OLD.owner_payout_cents THEN
      RAISE EXCEPTION 'Beneficio nao pode ser editado' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_immutable';
    END IF;
    IF OLD.status::text <> 'reserved' AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Beneficio ja encerrado' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF public.platform_setting_int('premium.first_month_benefit_enabled', 0) <> 1 THEN
    RAISE EXCEPTION 'Beneficio de primeiro mes desligado' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_flag_off';
  END IF;

  v_cycle := public.premium_benefit_cycle_id(NEW.user_id);
  IF v_cycle IS NULL OR v_cycle <> NEW.cycle_id THEN
    RAISE EXCEPTION 'Ciclo sem direito ao beneficio' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_cycle_not_eligible';
  END IF;

  IF NEW.max_cents <> v_max THEN
    RAISE EXCEPTION 'Teto diferente do configurado' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_max_setting';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = NEW.booking_id;
  IF NOT FOUND OR b.renter_id <> NEW.user_id THEN
    RAISE EXCEPTION 'Beneficio so vale na propria locacao como locatario' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_not_renter';
  END IF;
  IF b.status::text NOT IN ('approved', 'awaiting_payment') THEN
    RAISE EXCEPTION 'Beneficio so vale numa locacao aceita aguardando o primeiro pagamento' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_first_charge_only';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payments p WHERE p.booking_id = b.id AND p.status::text IN ('confirmed', 'received')) THEN
    RAISE EXCEPTION 'Beneficio so vale na primeira cobranca' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_first_charge_only';
  END IF;

  IF NEW.charge_total_cents <> b.total_charged_cents OR NEW.owner_payout_cents <> b.owner_payout_cents
     OR NEW.benefit_cents > b.monthly_rent_cents THEN
    RAISE EXCEPTION 'Valores do beneficio nao conferem com a locacao' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_matches_booking';
  END IF;
  IF NEW.payer_pays_cents < v_min THEN
    RAISE EXCEPTION 'Cobranca restante abaixo do minimo do gateway' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_min_charge';
  END IF;

  IF NEW.period_key <> to_char((SELECT starts_at FROM public.premium_cycles WHERE id = NEW.cycle_id) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') THEN
    RAISE EXCEPTION 'Periodo do beneficio invalido' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_period_key';
  END IF;
  RETURN NEW;
END;
$$;$mp_36_22$;

    EXECUTE $mp_36_23$CREATE TRIGGER premium_benefits_guard
  BEFORE INSERT OR UPDATE ON public.premium_benefits
  FOR EACH ROW EXECUTE FUNCTION public.guard_premium_benefit();$mp_36_23$;

    EXECUTE $mp_36_24$CREATE FUNCTION public.premium_benefits_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Beneficio nao se apaga' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_immutable';
END;
$$;$mp_36_24$;

    EXECUTE $mp_36_25$CREATE TRIGGER premium_benefits_no_delete BEFORE DELETE ON public.premium_benefits
  FOR EACH ROW EXECUTE FUNCTION public.premium_benefits_no_delete();$mp_36_25$;

    EXECUTE $mp_36_26$-- Exposição máxima teórica: Premium com direito financeiro vigente e SEM benefício vivo no ciclo × teto.
CREATE OR REPLACE FUNCTION public.premium_benefit_exposure()
RETURNS TABLE (eligible_cycles integer, unused_cycles integer, max_exposure_cents bigint, committed_cents bigint, pending_transfer_cents bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    (SELECT count(*)::int FROM public.premium_cycles c WHERE c.financial_eligible AND c.starts_at <= now() AND now() < COALESCE(c.ended_early_at, c.ends_at)),
    (SELECT count(*)::int FROM public.premium_cycles c
      WHERE c.financial_eligible AND c.starts_at <= now() AND now() < COALESCE(c.ended_early_at, c.ends_at)
        AND NOT EXISTS (SELECT 1 FROM public.premium_benefits pb WHERE pb.cycle_id = c.id AND pb.status::text <> 'cancelled')),
    ((SELECT count(*) FROM public.premium_cycles c
       WHERE c.financial_eligible AND c.starts_at <= now() AND now() < COALESCE(c.ended_early_at, c.ends_at)
         AND NOT EXISTS (SELECT 1 FROM public.premium_benefits pb WHERE pb.cycle_id = c.id AND pb.status::text <> 'cancelled'))
      * public.platform_setting_int('premium.first_month_benefit_max_cents', 10000))::bigint,
    COALESCE((SELECT sum(benefit_cents) FROM public.premium_benefits WHERE status::text IN ('reserved', 'consumed')), 0)::bigint,
    COALESCE((SELECT sum(amount_cents) FROM public.platform_transfers WHERE status::text IN ('queued', 'sent')), 0)::bigint
$$;$mp_36_26$;

    EXECUTE $mp_36_27$ALTER TABLE public.premium_benefits ENABLE ROW LEVEL SECURITY;$mp_36_27$;

    EXECUTE $mp_36_28$ALTER TABLE public.platform_transfers ENABLE ROW LEVEL SECURITY;$mp_36_28$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('6287b513025d94a8670a48433a6043e9567190861e5cbee786629a286feb0868', 1791460156786);

    RAISE NOTICE 'Migracao 36 (0036_premium_beneficio_primeiro_mes) aplicada.';
  END IF;
END
$mp_bloco_36$;


-- ----------------------------------------------------------------------------
-- Migracao 37: 0037_taxa_segue_premium_e_contas_vinculadas  (8 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_37$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '1f158cfae0e0b348a8ea08f1840824c7d8755725793b192261d4d9e8d52e004d'
  ) THEN
    RAISE NOTICE 'Migracao 37 (0037_taxa_segue_premium_e_contas_vinculadas) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_37_0$ALTER TABLE "subscriptions" ADD COLUMN "gateway_owner_payout_cents" integer;;$mp_37_0$;

    EXECUTE $mp_37_1$-- ===========================================================================
-- 0037 — Decisões do produto de 08/10/2026:
--   1. A taxa do proprietário SEGUE o Premium: quando o Premium acaba, as próximas
--      mensalidades das locações dele voltam a 3% (e voltam a 2% se ele assinar de
--      novo). O split da recorrência no Asaas acompanha (`gateway_owner_payout_cents`
--      guarda o que está configurado lá; a manutenção atualiza quando difere).
--   2. Mais rigidez contra contas duplicadas/vinculadas: uma mesma pessoa não mantém
--      dois Premium vivos (mesmo e-mail normalizado ou mesmo telefone), e o benefício
--      financeiro não vale entre contas vinculadas.
-- ===========================================================================

UPDATE public.subscriptions s
   SET gateway_owner_payout_cents = b.owner_payout_cents
  FROM public.bookings b
 WHERE b.id = s.booking_id AND s.gateway_owner_payout_cents IS NULL;$mp_37_1$;

    EXECUTE $mp_37_2$-- E-mail canônico: minúsculas, sem "+etiqueta"; no Gmail, sem pontos e com gmail.com.
CREATE OR REPLACE FUNCTION public.canonical_email(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
           WHEN p IS NULL OR position('@' IN p) = 0 THEN NULL
           WHEN lower(split_part(p, '@', 2)) IN ('gmail.com', 'googlemail.com')
             THEN replace(split_part(lower(split_part(p, '@', 1)), '+', 1), '.', '') || '@gmail.com'
           ELSE split_part(lower(split_part(p, '@', 1)), '+', 1) || '@' || lower(split_part(p, '@', 2))
         END
$$;$mp_37_2$;

    EXECUTE $mp_37_3$-- Telefone canônico: só dígitos, os 11 últimos (DDD + número), ignorando +55.
CREATE OR REPLACE FUNCTION public.canonical_phone(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(right(regexp_replace(COALESCE(p, ''), '\D', '', 'g'), 11), '')
$$;$mp_37_3$;

    EXECUTE $mp_37_4$-- Por que duas contas parecem ser a mesma pessoa (NULL = nenhum sinal). Sinais:
-- mesmo e-mail canônico, mesmo telefone, mesmo documento, ou já houve locação PAGA
-- no sentido inverso (b alugou de a) — o "rodízio" entre as próprias contas.
CREATE OR REPLACE FUNCTION public.premium_accounts_linked(p_a uuid, p_b uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_a = p_b THEN 'mesma conta'
    WHEN EXISTS (SELECT 1 FROM auth.users ua, auth.users ub
                  WHERE ua.id = p_a AND ub.id = p_b
                    AND public.canonical_email(ua.email) = public.canonical_email(ub.email)) THEN 'mesmo e-mail'
    WHEN EXISTS (SELECT 1 FROM profiles pa, profiles pb
                  WHERE pa.id = p_a AND pb.id = p_b
                    AND public.canonical_phone(pa.phone) IS NOT NULL
                    AND public.canonical_phone(pa.phone) = public.canonical_phone(pb.phone)) THEN 'mesmo telefone'
    WHEN EXISTS (SELECT 1 FROM profiles pa, profiles pb
                  WHERE pa.id = p_a AND pb.id = p_b AND pa.cpf_cnpj IS NOT NULL
                    AND regexp_replace(pa.cpf_cnpj, '\D', '', 'g') = regexp_replace(pb.cpf_cnpj, '\D', '', 'g')) THEN 'mesmo documento'
    WHEN EXISTS (SELECT 1 FROM bookings bk
                  WHERE bk.renter_id = p_b AND bk.owner_id = p_a AND bk.activated_at IS NOT NULL) THEN 'locação no sentido inverso'
    ELSE NULL
  END
$$;$mp_37_4$;

    EXECUTE $mp_37_5$CREATE OR REPLACE FUNCTION public.guard_premium_benefit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_max integer := public.platform_setting_int('premium.first_month_benefit_max_cents', 10000);
  v_min integer := public.platform_setting_int('premium.benefit_min_charge_cents', 500);
  v_cycle uuid;
  b record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Só o estado e seus carimbos mudam; o direito, os valores e a identidade não.
    IF NEW.cycle_id <> OLD.cycle_id OR NEW.user_id <> OLD.user_id OR NEW.identity_hash <> OLD.identity_hash
       OR NEW.period_key <> OLD.period_key OR NEW.booking_id <> OLD.booking_id OR NEW.max_cents <> OLD.max_cents
       OR NEW.benefit_cents <> OLD.benefit_cents OR NEW.charge_total_cents <> OLD.charge_total_cents
       OR NEW.payer_pays_cents <> OLD.payer_pays_cents OR NEW.owner_payout_cents <> OLD.owner_payout_cents THEN
      RAISE EXCEPTION 'Beneficio nao pode ser editado' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_immutable';
    END IF;
    IF OLD.status::text <> 'reserved' AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Beneficio ja encerrado' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF public.platform_setting_int('premium.first_month_benefit_enabled', 0) <> 1 THEN
    RAISE EXCEPTION 'Beneficio de primeiro mes desligado' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_flag_off';
  END IF;

  v_cycle := public.premium_benefit_cycle_id(NEW.user_id);
  IF v_cycle IS NULL OR v_cycle <> NEW.cycle_id THEN
    RAISE EXCEPTION 'Ciclo sem direito ao beneficio' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_cycle_not_eligible';
  END IF;

  IF NEW.max_cents <> v_max THEN
    RAISE EXCEPTION 'Teto diferente do configurado' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_max_setting';
  END IF;

  SELECT * INTO b FROM public.bookings WHERE id = NEW.booking_id;
  IF NOT FOUND OR b.renter_id <> NEW.user_id THEN
    RAISE EXCEPTION 'Beneficio so vale na propria locacao como locatario' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_not_renter';
  END IF;
  -- Contas vinculadas (0037): o benefício não pode sair da plataforma para o "outro lado" da mesma pessoa.
  IF public.premium_accounts_linked(NEW.user_id, b.owner_id) IS NOT NULL THEN
    RAISE EXCEPTION 'Locatario e proprietario parecem ser a mesma pessoa (%)', public.premium_accounts_linked(NEW.user_id, b.owner_id)
      USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_linked_accounts';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.user_id AND p.phone_verified_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Beneficio exige telefone verificado' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_phone_unverified';
  END IF;
  IF b.status::text NOT IN ('approved', 'awaiting_payment') THEN
    RAISE EXCEPTION 'Beneficio so vale numa locacao aceita aguardando o primeiro pagamento' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_first_charge_only';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payments p WHERE p.booking_id = b.id AND p.status::text IN ('confirmed', 'received')) THEN
    RAISE EXCEPTION 'Beneficio so vale na primeira cobranca' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_first_charge_only';
  END IF;

  IF NEW.charge_total_cents <> b.total_charged_cents OR NEW.owner_payout_cents <> b.owner_payout_cents
     OR NEW.benefit_cents > b.monthly_rent_cents THEN
    RAISE EXCEPTION 'Valores do beneficio nao conferem com a locacao' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_matches_booking';
  END IF;
  IF NEW.payer_pays_cents < v_min THEN
    RAISE EXCEPTION 'Cobranca restante abaixo do minimo do gateway' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_min_charge';
  END IF;

  IF NEW.period_key <> to_char((SELECT starts_at FROM public.premium_cycles WHERE id = NEW.cycle_id) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') THEN
    RAISE EXCEPTION 'Periodo do beneficio invalido' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_period_key';
  END IF;
  RETURN NEW;
END;
$$;$mp_37_5$;

    EXECUTE $mp_37_6$-- Uma pessoa, um Premium vivo: outra conta com o mesmo e-mail canônico ou o mesmo
-- telefone não abre (nem mantém) uma segunda assinatura em paralelo.
CREATE OR REPLACE FUNCTION public.guard_premium_membership_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_outra uuid;
BEGIN
  IF NEW.status::text NOT IN ('pending_payment', 'active') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status::text IN ('pending_payment', 'active') THEN
    RETURN NEW;  -- já estava viva: a trava vale na abertura
  END IF;
  SELECT pm.user_id INTO v_outra
    FROM premium_memberships pm
   WHERE pm.user_id <> NEW.user_id
     AND pm.status::text IN ('pending_payment', 'active')
     AND public.premium_accounts_linked(NEW.user_id, pm.user_id) IN ('mesmo e-mail', 'mesmo telefone', 'mesmo documento')
   LIMIT 1;
  IF v_outra IS NOT NULL THEN
    RAISE EXCEPTION 'Ja existe um Premium em outra conta desta pessoa'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_memberships_linked_account';
  END IF;
  RETURN NEW;
END;
$$;$mp_37_6$;

    EXECUTE $mp_37_7$CREATE TRIGGER premium_memberships_guard_identity
  BEFORE INSERT OR UPDATE OF status ON public.premium_memberships
  FOR EACH ROW EXECUTE FUNCTION public.guard_premium_membership_identity();$mp_37_7$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('1f158cfae0e0b348a8ea08f1840824c7d8755725793b192261d4d9e8d52e004d', 1791545573652);

    RAISE NOTICE 'Migracao 37 (0037_taxa_segue_premium_e_contas_vinculadas) aplicada.';
  END IF;
END
$mp_bloco_37$;


-- ============================================================================
-- Resumo
-- ============================================================================
DO $mp_resumo$
DECLARE aplicadas integer;
BEGIN
  SELECT count(*) INTO aplicadas FROM drizzle.__drizzle_migrations;
  RAISE NOTICE '---';
  RAISE NOTICE 'Pronto: % de 38 migracoes registradas no banco.', aplicadas;
END
$mp_resumo$;

-- Confira o resultado com:
--
--   SELECT count(*) FROM drizzle.__drizzle_migrations;            -- 38
--   SELECT key, value FROM platform_settings ORDER BY key;        -- taxas 3%+3%
--   SELECT PostGIS_Version();                                     -- extensao ativa
