-- ============================================================================
-- Contagem de locacoes concluidas
--
-- Conta os dois lados: quem alugou e quem foi alugado. Uma locacao que chegou
-- ao fim e sinal de confianca para ambos.
--
-- Este numero existe por uma razao de produto, nao so de exibicao: e a
-- reputacao que a pessoa perde ao sair da plataforma. Aviso nao segura
-- ninguem; historico construido aqui, sim.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.refresh_completed_bookings_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE pessoa uuid;
BEGIN
  FOREACH pessoa IN ARRAY ARRAY[
    COALESCE(NEW.renter_id, OLD.renter_id),
    COALESCE(NEW.owner_id, OLD.owner_id)
  ] LOOP
    UPDATE public.profiles p
    SET completed_bookings_count = (
      SELECT COUNT(*)
      FROM public.bookings b
      WHERE b.status = 'ended'
        AND (b.renter_id = pessoa OR b.owner_id = pessoa)
    )
    WHERE p.id = pessoa;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;
--> statement-breakpoint

-- Dispara so quando o status muda: UPDATE de qualquer outra coluna nao
-- precisa recontar nada.
CREATE TRIGGER bookings_refresh_completed_count
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.refresh_completed_bookings_count();
--> statement-breakpoint

-- A view publica de perfil ganha os sinais de confianca. Nada aqui e sensivel:
-- sao exatamente os dados que ajudam alguem a decidir se confia na outra parte.
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = true) AS
  SELECT id,
         full_name,
         avatar_path,
         created_at,
         phone_verified_at IS NOT NULL AS phone_verified,
         document_verified_at IS NOT NULL AS document_verified,
         completed_bookings_count
  FROM public.profiles
  WHERE status = 'active' AND deleted_at IS NULL;
--> statement-breakpoint

GRANT SELECT ON public.public_profiles TO anon, authenticated;
--> statement-breakpoint

INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('safety.visit_before_booking', 'true'::jsonb,
   'Recomendar visita ao espaco antes de fechar a reserva.', true),
  ('safety.protection_copy_version', '"2026-09-16"'::jsonb,
   'Versao do texto de protecao exibido. Muda quando a politica muda.', true)
ON CONFLICT (key) DO NOTHING;
