ALTER TYPE "public"."booking_status" ADD VALUE 'expired' BEFORE 'awaiting_payment';
--> statement-breakpoint

-- Prazo para o proprietario responder uma solicitacao antes dela expirar
-- sozinha. Nao existia settings key para isso ate a Parte 4 (fluxo real de
-- solicitacao/reserva) precisar de um estado "expirada" de verdade no banco.
INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('booking.request_expiry_days', '7'::jsonb,
   'Dias que uma solicitacao fica pendente antes de expirar sozinha, sem resposta do proprietario.', true)
ON CONFLICT (key) DO NOTHING;