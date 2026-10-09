ALTER TABLE "subscriptions" ADD COLUMN "gateway_owner_payout_cents" integer;;--> statement-breakpoint

-- ===========================================================================
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
 WHERE b.id = s.booking_id AND s.gateway_owner_payout_cents IS NULL;
--> statement-breakpoint

-- E-mail canônico: minúsculas, sem "+etiqueta"; no Gmail, sem pontos e com gmail.com.
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
$$;
--> statement-breakpoint

-- Telefone canônico: só dígitos, os 11 últimos (DDD + número), ignorando +55.
CREATE OR REPLACE FUNCTION public.canonical_phone(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(right(regexp_replace(COALESCE(p, ''), '\D', '', 'g'), 11), '')
$$;
--> statement-breakpoint

-- Por que duas contas parecem ser a mesma pessoa (NULL = nenhum sinal). Sinais:
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
$$;
--> statement-breakpoint

--> statement-breakpoint

-- Uma pessoa, um Premium vivo: outra conta com o mesmo e-mail canônico ou o mesmo
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
$$;
--> statement-breakpoint

CREATE TRIGGER premium_memberships_guard_identity
  BEFORE INSERT OR UPDATE OF status ON public.premium_memberships
  FOR EACH ROW EXECUTE FUNCTION public.guard_premium_membership_identity();
