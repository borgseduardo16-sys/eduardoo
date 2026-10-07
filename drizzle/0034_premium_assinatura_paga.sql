-- ===========================================================================
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

ALTER TYPE "public"."premium_membership_status" ADD VALUE 'pending_payment';--> statement-breakpoint
ALTER TYPE "public"."premium_membership_status" ADD VALUE 'expired';--> statement-breakpoint
CREATE TABLE "premium_charges" (
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
);
--> statement-breakpoint
CREATE TABLE "premium_cycles" (
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
);
--> statement-breakpoint
ALTER TABLE "premium_memberships" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "premium_memberships" ALTER COLUMN "source" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "premium_charge_id" uuid;--> statement-breakpoint
ALTER TABLE "premium_memberships" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "premium_memberships" ADD COLUMN "provider_subscription_id" text;--> statement-breakpoint
ALTER TABLE "premium_memberships" ADD COLUMN "billing_method" "payment_method";--> statement-breakpoint
ALTER TABLE "premium_memberships" ADD COLUMN "plan_cents" integer;--> statement-breakpoint
ALTER TABLE "premium_memberships" ADD COLUMN "current_period_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "premium_memberships" ADD COLUMN "current_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "premium_memberships" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "premium_memberships" ADD COLUMN "cancel_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "premium_memberships" ADD COLUMN "provider_cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "premium_memberships" ADD COLUMN "financial_test_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "premium_cycle_id" uuid;--> statement-breakpoint
ALTER TABLE "premium_charges" ADD CONSTRAINT "premium_charges_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premium_cycles" ADD CONSTRAINT "premium_cycles_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premium_cycles" ADD CONSTRAINT "premium_cycles_charge_id_premium_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."premium_charges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "premium_charges_provider_id_key" ON "premium_charges" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE INDEX "premium_charges_user_idx" ON "premium_charges" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "premium_charges_status_idx" ON "premium_charges" USING btree ("status");--> statement-breakpoint
CREATE INDEX "premium_charges_subscription_idx" ON "premium_charges" USING btree ("provider_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "premium_cycles_user_number_key" ON "premium_cycles" USING btree ("user_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "premium_cycles_charge_key" ON "premium_cycles" USING btree ("charge_id");--> statement-breakpoint
CREATE INDEX "premium_cycles_user_ends_idx" ON "premium_cycles" USING btree ("user_id","ends_at");--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_premium_charge_id_premium_charges_id_fk" FOREIGN KEY ("premium_charge_id") REFERENCES "public"."premium_charges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_premium_cycle_id_premium_cycles_id_fk" FOREIGN KEY ("premium_cycle_id") REFERENCES "public"."premium_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_premium_charge_idx" ON "ledger_entries" USING btree ("premium_charge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "premium_memberships_provider_sub_key" ON "premium_memberships" USING btree ("provider","provider_subscription_id") WHERE provider_subscription_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "premium_memberships_cancel_pending_idx" ON "premium_memberships" USING btree ("updated_at") WHERE provider_subscription_id IS NOT NULL AND provider_cancelled_at IS NULL;--> statement-breakpoint
CREATE INDEX "promotions_premium_cycle_idx" ON "promotions" USING btree ("premium_cycle_id","type");--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Tabelas novas: só o servidor lê (mesma categoria de payments/promotions —
-- RLS ligado e nenhuma policy; `ALTER DEFAULT PRIVILEGES` da 0001 já tira o
-- acesso de anon/authenticated).
-- ---------------------------------------------------------------------------
ALTER TABLE "premium_charges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "premium_cycles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Dados que já existiam. A concessão manual antiga não tinha data de fim
-- ("para sempre"). Daqui em diante TODO Premium tem fim: as concessões que
-- estão ativas passam a valer por mais 30 dias a partir desta migração, como
-- ciclo administrativo (sem benefícios financeiros). As demais ficam como estão.
-- ---------------------------------------------------------------------------
UPDATE public.premium_memberships
   SET current_period_start = now(),
       current_period_end = now() + interval '30 days',
       updated_at = now()
 WHERE status::text = 'active';
--> statement-breakpoint

INSERT INTO public.premium_cycles (user_id, number, source, starts_at, ends_at, financial_eligible)
SELECT user_id, 1, 'admin_grant', current_period_start, current_period_end, false
  FROM public.premium_memberships
 WHERE status::text = 'active';
--> statement-breakpoint

-- Agora as regras que dependem desses dados.
ALTER TABLE "premium_memberships" ADD CONSTRAINT "premium_memberships_period_order" CHECK ("premium_memberships"."current_period_start" IS NULL OR "premium_memberships"."current_period_end" IS NULL OR "premium_memberships"."current_period_end" > "premium_memberships"."current_period_start");--> statement-breakpoint
ALTER TABLE "premium_memberships" ADD CONSTRAINT "premium_memberships_active_has_period" CHECK ("premium_memberships"."status"::text <> 'active' OR "premium_memberships"."current_period_end" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "premium_memberships" ADD CONSTRAINT "premium_memberships_cancel_request_has_timestamp" CHECK (NOT "premium_memberships"."cancel_at_period_end" OR "premium_memberships"."cancel_requested_at" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "premium_memberships" ADD CONSTRAINT "premium_memberships_financial_test_admin_only" CHECK (NOT "premium_memberships"."financial_test_enabled" OR "premium_memberships"."source"::text = 'admin_grant');--> statement-breakpoint
ALTER TABLE "premium_memberships" ADD CONSTRAINT "premium_memberships_subscription_has_plan" CHECK ("premium_memberships"."source"::text <> 'subscription' OR ("premium_memberships"."plan_cents" IS NOT NULL AND "premium_memberships"."plan_cents" > 0));--> statement-breakpoint

-- Ciclos da mesma pessoa nunca se sobrepõem (intervalo meio-aberto: um ciclo
-- que começa exatamente quando o outro termina é permitido). O fim efetivo é
-- o antecipado, quando houver. `btree_gist` vem da 0032.
ALTER TABLE public.premium_cycles
  ADD CONSTRAINT premium_cycles_no_overlap
  EXCLUDE USING gist (user_id WITH =, tstzrange(starts_at, COALESCE(ended_early_at, ends_at)) WITH &&);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
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
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.premium_is_active(p_user uuid)
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
$$;
--> statement-breakpoint

-- Premium que dá direito aos benefícios FINANCEIROS (taxa reduzida, primeiro
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
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
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
$$;
--> statement-breakpoint
CREATE TRIGGER premium_cycles_immutable
  BEFORE UPDATE OR DELETE ON public.premium_cycles
  FOR EACH ROW EXECUTE FUNCTION public.premium_cycles_guard();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
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
$$;
--> statement-breakpoint
CREATE TRIGGER promotions_guard_premium_quota
  BEFORE INSERT ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.guard_premium_benefit_quota();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
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
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
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
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Configuração (mudar é um UPDATE, sem deploy).
--   * Preço definitivo do Premium: R$ 119,90 por mês. O plano anual NÃO existe.
--   * Saldo do ciclo, continuidade entre ciclos, abandono de assinatura nunca
--     paga e o alcance ampliado no mapa.
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('premium.price_monthly_cents', '11990'::jsonb,
   'Preço do Premium (assinatura mensal recorrente no Asaas), em centavos. Quem já assinou mantém o preço combinado.', true)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = now();
--> statement-breakpoint

DELETE FROM public.platform_settings WHERE key = 'premium.price_yearly_cents';
--> statement-breakpoint

INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
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
ON CONFLICT (key) DO NOTHING;
