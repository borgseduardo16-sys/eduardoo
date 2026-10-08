-- ===========================================================================
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
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
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
$$;
--> statement-breakpoint

-- O nome faz o gatilho rodar DEPOIS de `bookings_guard_price` (ordem alfabética): preço adulterado
-- continua sendo recusado por `bookings_rent_matches_space`, a regra mais específica.
CREATE TRIGGER bookings_guard_price_fee
  BEFORE INSERT OR UPDATE OF status, owner_fee_bps, owner_fee_cents, monthly_rent_cents ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_owner_fee();
