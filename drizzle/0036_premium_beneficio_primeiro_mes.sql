CREATE TYPE "public"."platform_transfer_status" AS ENUM('queued', 'sent', 'confirmed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."premium_benefit_status" AS ENUM('reserved', 'consumed', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."ledger_entry_type" ADD VALUE 'premium_benefit_funded' BEFORE 'deposit_charged';--> statement-breakpoint
CREATE TABLE "platform_transfers" (
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
);
--> statement-breakpoint
CREATE TABLE "premium_benefits" (
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
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "premium_benefit_id" uuid;--> statement-breakpoint
ALTER TABLE "platform_transfers" ADD CONSTRAINT "platform_transfers_benefit_id_premium_benefits_id_fk" FOREIGN KEY ("benefit_id") REFERENCES "public"."premium_benefits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_transfers" ADD CONSTRAINT "platform_transfers_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premium_benefits" ADD CONSTRAINT "premium_benefits_cycle_id_premium_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."premium_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premium_benefits" ADD CONSTRAINT "premium_benefits_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premium_benefits" ADD CONSTRAINT "premium_benefits_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_transfers_benefit_key" ON "platform_transfers" USING btree ("benefit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_transfers_provider_key" ON "platform_transfers" USING btree ("provider_transfer_id") WHERE "platform_transfers"."provider_transfer_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "platform_transfers_status_idx" ON "platform_transfers" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "premium_benefits_booking_key" ON "premium_benefits" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "premium_benefits_cycle_live_key" ON "premium_benefits" USING btree ("cycle_id") WHERE "premium_benefits"."status" <> 'cancelled';--> statement-breakpoint
CREATE UNIQUE INDEX "premium_benefits_identity_period_live_key" ON "premium_benefits" USING btree ("identity_hash","period_key") WHERE "premium_benefits"."status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX "premium_benefits_user_idx" ON "premium_benefits" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_premium_benefit_id_premium_benefits_id_fk" FOREIGN KEY ("premium_benefit_id") REFERENCES "public"."premium_benefits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_premium_benefit_idx" ON "ledger_entries" USING btree ("premium_benefit_id");--> statement-breakpoint

-- ===========================================================================
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
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint

-- O ciclo que dá direito ao benefício AGORA: pago (ou teste financeiro explícito), vigente, e — no cartão —
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
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.guard_premium_benefit()
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
$$;
--> statement-breakpoint

CREATE TRIGGER premium_benefits_guard
  BEFORE INSERT OR UPDATE ON public.premium_benefits
  FOR EACH ROW EXECUTE FUNCTION public.guard_premium_benefit();
--> statement-breakpoint

CREATE FUNCTION public.premium_benefits_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Beneficio nao se apaga' USING ERRCODE = 'check_violation', CONSTRAINT = 'premium_benefits_immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER premium_benefits_no_delete BEFORE DELETE ON public.premium_benefits
  FOR EACH ROW EXECUTE FUNCTION public.premium_benefits_no_delete();
--> statement-breakpoint

-- Exposição máxima teórica: Premium com direito financeiro vigente e SEM benefício vivo no ciclo × teto.
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
$$;
--> statement-breakpoint

ALTER TABLE public.premium_benefits ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.platform_transfers ENABLE ROW LEVEL SECURITY;
