-- ============================================================================
-- MyPlace — sistemas de seguranca interna + novas taxas
--
--   1. Bloqueio entre usuarios, garantido por trigger
--   2. Reincidencia: contagem de denuncias procedentes
--   3. Snapshot de evidencia (o conteudo denunciado nao some)
--   4. RLS das tabelas novas
--   5. Taxas 3% + 3% e aluguel minimo de R$ 35,00
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Bloqueio entre usuarios
--
-- O bloqueio e enforcado por TRIGGER, e nao so por RLS ou pelo codigo da
-- aplicacao, porque o servidor usa conexao privilegiada e ignora RLS. Trigger
-- pega os dois caminhos.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_blocked_between(a uuid, b uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = a AND blocked_id = b)
       OR (blocker_id = b AND blocked_id = a)
  );
$$;
--> statement-breakpoint

-- Conversa nova entre pessoas que se bloquearam nao nasce.
CREATE OR REPLACE FUNCTION public.guard_conversation_block()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.is_blocked_between(NEW.renter_id, NEW.owner_id) THEN
    RAISE EXCEPTION 'Nao e possivel iniciar conversa: ha bloqueio entre os usuarios'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER conversations_guard_block
  BEFORE INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.guard_conversation_block();
--> statement-breakpoint

-- E conversa antiga para de receber mensagem se o bloqueio vier depois.
CREATE OR REPLACE FUNCTION public.guard_message_block()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE c record;
BEGIN
  SELECT renter_id, owner_id, closed_at INTO c
  FROM public.conversations WHERE id = NEW.conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversa % nao existe', NEW.conversation_id;
  END IF;

  IF c.closed_at IS NOT NULL AND NEW.is_system = false THEN
    RAISE EXCEPTION 'Esta conversa esta encerrada' USING ERRCODE = 'check_violation';
  END IF;

  -- Mensagem do sistema ("reserva cancelada") continua passando: ela informa,
  -- nao e contato entre as pessoas.
  IF NEW.is_system = false AND public.is_blocked_between(c.renter_id, c.owner_id) THEN
    RAISE EXCEPTION 'Nao e possivel enviar mensagem: ha bloqueio entre os usuarios'
      USING ERRCODE = 'check_violation';
  END IF;

  -- O remetente tem que ser parte da conversa.
  IF NEW.is_system = false AND NEW.sender_id NOT IN (c.renter_id, c.owner_id) THEN
    RAISE EXCEPTION 'Remetente nao participa desta conversa'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER messages_guard_block
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_message_block();
--> statement-breakpoint

-- Bloqueio tambem impede reserva — senao contorna-se o bloqueio alugando.
CREATE OR REPLACE FUNCTION public.guard_booking_block()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.is_blocked_between(NEW.renter_id, NEW.owner_id) THEN
    RAISE EXCEPTION 'Nao e possivel reservar: ha bloqueio entre os usuarios'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER bookings_guard_block
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_block();
--> statement-breakpoint

-- Bloquear encerra a conversa existente entre as duas pessoas. Sem isso, a
-- thread continuaria aberta na tela das duas, sugerindo que da para responder.
CREATE OR REPLACE FUNCTION public.close_conversations_on_block()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET closed_at = now()
  WHERE closed_at IS NULL
    AND ((renter_id = NEW.blocker_id AND owner_id = NEW.blocked_id)
      OR (renter_id = NEW.blocked_id AND owner_id = NEW.blocker_id));
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER user_blocks_close_conversations
  AFTER INSERT ON public.user_blocks
  FOR EACH ROW EXECUTE FUNCTION public.close_conversations_on_block();
--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 2. Reincidencia
--
-- Quando o moderador resolve uma denuncia como procedente, o contador do
-- denunciado sobe. E o que permite aplicar politica de suspensao sem varrer a
-- tabela de denuncias a cada acao.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.refresh_upheld_report_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE alvo uuid;
BEGIN
  -- Para denuncia de anuncio ou mensagem, o responsavel e o autor do conteudo.
  alvo := COALESCE(
    NEW.target_user_id,
    (SELECT owner_id FROM public.spaces WHERE id = NEW.space_id),
    (SELECT sender_id FROM public.messages WHERE id = NEW.message_id)
  );

  IF alvo IS NULL THEN RETURN NEW; END IF;

  UPDATE public.profiles p
  SET upheld_report_count = (
    SELECT COUNT(*)
    FROM public.reports r
    WHERE r.upheld = true
      AND COALESCE(
            r.target_user_id,
            (SELECT owner_id FROM public.spaces WHERE id = r.space_id),
            (SELECT sender_id FROM public.messages WHERE id = r.message_id)
          ) = alvo
  )
  WHERE p.id = alvo;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER reports_refresh_upheld_count
  AFTER INSERT OR UPDATE OF upheld ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.refresh_upheld_report_count();
--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 3. Evidencia
--
-- Guarda o conteudo denunciado no momento da denuncia. Conteudo denunciado e
-- exatamente o que costuma ser editado ou apagado logo depois; sem a copia, o
-- moderador recebe um caso sem o que julgar.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.capture_report_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.evidence_snapshot IS NOT NULL THEN RETURN NEW; END IF;

  IF NEW.target_type = 'message' THEN
    SELECT jsonb_build_object(
             'body', m.body,
             'sender_id', m.sender_id,
             'conversation_id', m.conversation_id,
             'sent_at', m.created_at,
             'flag_reason', m.flag_reason)
      INTO NEW.evidence_snapshot
      FROM public.messages m WHERE m.id = NEW.message_id;

  ELSIF NEW.target_type = 'space' THEN
    SELECT jsonb_build_object(
             'title', s.title,
             'description', s.description,
             'price_monthly_cents', s.price_monthly_cents,
             'city', s.city,
             'district', s.district,
             'owner_id', s.owner_id,
             'status', s.status)
      INTO NEW.evidence_snapshot
      FROM public.spaces s WHERE s.id = NEW.space_id;

  ELSIF NEW.target_type = 'user' THEN
    SELECT jsonb_build_object(
             'full_name', p.full_name,
             'role', p.role,
             'status', p.status,
             'member_since', p.created_at,
             'upheld_report_count', p.upheld_report_count)
      INTO NEW.evidence_snapshot
      FROM public.profiles p WHERE p.id = NEW.target_user_id;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER reports_capture_evidence
  BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.capture_report_evidence();
--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 4. RLS das tabelas novas
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- A pessoa gerencia a propria lista de bloqueios. Ninguem consulta a lista de
-- outra pessoa — nem para saber se foi bloqueado.
CREATE POLICY "user_blocks_manage_own" ON public.user_blocks
  FOR ALL TO authenticated
  USING (blocker_id = auth.uid())
  WITH CHECK (blocker_id = auth.uid());
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON public.user_blocks TO authenticated;
--> statement-breakpoint

-- Denuncia: quem denunciou acompanha a propria denuncia. Ninguem ve denuncia
-- feita contra si — saber quem denunciou e o caminho mais curto para retaliacao.
CREATE POLICY "reports_select_own" ON public.reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());
--> statement-breakpoint
GRANT SELECT ON public.reports TO authenticated;
--> statement-breakpoint

-- INSERT de denuncia passa pelo servidor (que valida motivo, severidade,
-- limites e captura evidencia). Nao ha grant de INSERT para o navegador.


-- ---------------------------------------------------------------------------
-- 5. Taxas e limites
--
-- Mudanca de 2%+2% para 3%+3%, e aluguel minimo de R$ 50,00 para R$ 35,00.
--
-- IMPORTANTE: isto NAO altera reserva nenhuma ja existente. Cada reserva
-- guarda as taxas vigentes no momento do aceite (bookings.renter_fee_bps e
-- owner_fee_bps), entao contrato em andamento segue com o que foi combinado.
-- ---------------------------------------------------------------------------

UPDATE public.platform_settings
SET value = '300'::jsonb,
    description = 'Taxa cobrada de quem aluga, sobre o valor do aluguel. 300 = 3%.',
    updated_at = now()
WHERE key = 'fees.renter_fee_bps';
--> statement-breakpoint

UPDATE public.platform_settings
SET value = '300'::jsonb,
    description = 'Taxa retida de quem recebe, sobre o valor do aluguel. 300 = 3%.',
    updated_at = now()
WHERE key = 'fees.owner_fee_bps';
--> statement-breakpoint

UPDATE public.platform_settings
SET value = '3500'::jsonb,
    description = 'Aluguel minimo aceito (R$ 35,00). Ponto de equilibrio a 3%+3% e R$ 33,17 no Pix.',
    updated_at = now()
WHERE key = 'booking.min_rent_cents';
--> statement-breakpoint

INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('safety.flag_contact_info', 'true'::jsonb,
   'Sinalizar mensagens com telefone, e-mail ou chave Pix. Sinaliza e avisa; nao bloqueia o envio.', false),
  ('safety.auto_review_upheld_threshold', '3'::jsonb,
   'Denuncias procedentes ate a conta entrar em revisao obrigatoria.', false),
  ('safety.auto_suspend_upheld_threshold', '5'::jsonb,
   'Denuncias procedentes ate a suspensao automatica da conta.', false),
  ('safety.max_reports_per_day', '10'::jsonb,
   'Denuncias que um usuario pode abrir por dia. Evita uso da denuncia como assedio.', false),
  ('safety.reveal_address_on_status', '"active"'::jsonb,
   'Status de reserva a partir do qual o endereco completo e revelado ao locatario.', true)
ON CONFLICT (key) DO NOTHING;
