-- ===========================================================================
-- 0033 — Modelo mensal por quantidade.
--
-- O marketplace passa a trabalhar SÓ com aluguel mensal. Um anúncio tem uma
-- QUANTIDADE de unidades oferecidas (uma garagem = 1; um estacionamento = 80
-- de 100 vagas) e cada locação que ocupa consome uma. Saem as unidades
-- individuais (A1, B17…), os grupos de unidades e o aluguel por
-- hora/dia/semana da Parte 12: a organização física é do proprietário e vai
-- nas instruções de acesso, que agora são obrigatórias no aceite.
--
-- Ordem (cada passo depende do anterior):
--   1. dados que não podem ficar para trás (locações por hora, anúncios sem
--      preço mensal, pedidos duplicados);
--   2. quantidade nos anúncios e prazos/instruções nas reservas;
--   3. remoção do modelo antigo (gatilhos, colunas, tabelas, funções, tipos);
--   4. estruturas novas (enums, tabela de pedidos de encerramento, áudio);
--   5. regras no banco: última vaga, preço, aceite, prazos, encerramento;
--   6. calendário (bloqueio vale para o INÍCIO de novas locações);
--   7. Storage do áudio, configurações e RLS.
--
-- Nota: valores novos de enum EXISTENTE (notification_type) não são usados
-- como literal aqui — o migrador roda tudo numa transação só e o Postgres
-- não deixa usar um valor acrescentado na mesma transação.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Dados que não podem ficar para trás
-- ---------------------------------------------------------------------------

-- Locações por hora/dia/semana deixam de existir. As que ainda estão vivas
-- são encerradas — nunca apagadas: pagamentos e livro-razão apontam para elas
-- e o livro-razão não aceita DELETE. Cobrança ainda em aberto é marcada para
-- exclusão no gateway (a fila de manutenção executa).
UPDATE public.payments p
   SET delete_requested_at = now(), updated_at = now()
  FROM public.bookings b
 WHERE p.booking_id = b.id
   AND b.kind = 'temporary'
   AND b.status IN ('requested', 'approved', 'awaiting_payment')
   AND p.status IN ('pending', 'overdue')
   AND p.delete_requested_at IS NULL;
--> statement-breakpoint

-- (`cancelled`, não `expired`: num banco novo todas as migrações rodam numa
-- transação só e o Postgres não deixa usar na mesma transação o valor
-- `expired`, acrescentado ao enum pela 0010.)
UPDATE public.bookings
   SET status = 'cancelled',
       cancelled_at = now(),
       cancellation_reason = 'Aluguel por hora, dia ou semana descontinuado.',
       updated_at = now()
 WHERE kind = 'temporary' AND status IN ('requested', 'approved', 'awaiting_payment');
--> statement-breakpoint

UPDATE public.bookings
   SET status = 'ended',
       ended_at = COALESCE(LEAST(ends_at, now()), now()),
       updated_at = now()
 WHERE kind = 'temporary' AND status IN ('active', 'past_due');
--> statement-breakpoint

-- Anúncio no ar sem preço mensal (só alugava por hora) não pode continuar no
-- ar: preço mensal passa a ser obrigatório para publicar. Fica pausado até o
-- proprietário informar o preço.
UPDATE public.spaces
   SET status = 'paused', updated_at = now()
 WHERE price_monthly_cents IS NULL AND status IN ('published', 'rented');
--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 2. Quantidade nos anúncios e prazos/instruções nas reservas
-- ---------------------------------------------------------------------------

ALTER TABLE public.spaces ADD COLUMN quantity_offered integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE public.spaces ADD COLUMN quantity_total integer;
--> statement-breakpoint
ALTER TABLE public.spaces ADD COLUMN quantity_available integer DEFAULT 1 NOT NULL;
--> statement-breakpoint

-- Quem tinha N unidades ativas passa a oferecer N (no mínimo 1, e nunca menos
-- do que já está ocupado). O disponível sai da contagem de reservas.
UPDATE public.spaces s
   SET quantity_offered = GREATEST(
         1,
         (SELECT count(*) FROM public.space_units u WHERE u.space_id = s.id AND u.active)::integer,
         (SELECT count(*) FROM public.bookings b WHERE b.space_id = s.id AND public.booking_occupies(b.status))::integer
       );
--> statement-breakpoint

UPDATE public.spaces s
   SET quantity_available = s.quantity_offered
         - (SELECT count(*) FROM public.bookings b WHERE b.space_id = s.id AND public.booking_occupies(b.status))::integer;
--> statement-breakpoint

ALTER TABLE public.bookings ADD COLUMN response_deadline_at timestamp with time zone;
--> statement-breakpoint
ALTER TABLE public.bookings ADD COLUMN first_payment_deadline_at timestamp with time zone;
--> statement-breakpoint
ALTER TABLE public.bookings ADD COLUMN access_instructions text;
--> statement-breakpoint
ALTER TABLE public.bookings ADD COLUMN access_audio_path text;
--> statement-breakpoint
ALTER TABLE public.bookings ADD COLUMN access_audio_duration_ms integer;
--> statement-breakpoint
ALTER TABLE public.bookings ADD COLUMN access_audio_mime text;
--> statement-breakpoint
ALTER TABLE public.bookings ADD COLUMN access_instructions_at timestamp with time zone;
--> statement-breakpoint

-- Quem já estava esperando começa um prazo novo a partir de agora (o prazo
-- antigo era de 7 dias e não existia para pagar): ninguém expira de surpresa
-- por causa desta migração.
UPDATE public.bookings SET response_deadline_at = now() + interval '24 hours' WHERE status = 'requested';
--> statement-breakpoint
UPDATE public.bookings SET first_payment_deadline_at = now() + interval '24 hours'
 WHERE status IN ('approved', 'awaiting_payment');
--> statement-breakpoint

-- Dois pedidos PENDENTES da mesma pessoa para o mesmo anúncio: fica o mais
-- antigo, os outros são cancelados. Sem isto o índice único de pedido
-- pendente (abaixo) não nasceria.
UPDATE public.bookings d
   SET status = 'cancelled',
       cancelled_at = now(),
       cancellation_reason = 'Pedido duplicado, cancelado na migração do modelo mensal.',
       updated_at = now()
 WHERE d.status = 'requested'
   AND EXISTS (
     SELECT 1 FROM public.bookings o
      WHERE o.space_id = d.space_id AND o.renter_id = d.renter_id AND o.id <> d.id
        AND o.status = 'requested'
        AND (o.requested_at < d.requested_at
             OR (o.requested_at = d.requested_at AND o.id < d.id))
   );
--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 3. Remoção do modelo antigo (unidades, grupos, locação por hora)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS bookings_derive_rental_shape ON public.bookings;
--> statement-breakpoint
DROP TRIGGER IF EXISTS bookings_sync_space_occupancy ON public.bookings;
--> statement-breakpoint
DROP TRIGGER IF EXISTS bookings_guard_blocked_period ON public.bookings;
--> statement-breakpoint
DROP TRIGGER IF EXISTS spaces_price_from_units ON public.spaces;
--> statement-breakpoint
DROP TRIGGER IF EXISTS spaces_publish_requires_units ON public.spaces;
--> statement-breakpoint

-- As colunas levam junto o que depende delas: a restrição de exclusão por
-- unidade, as chaves para grupo/unidade e os índices e CHECKs do aluguel por
-- hora (o Postgres derruba restrição que envolve a coluna removida).
ALTER TABLE public.bookings
  DROP COLUMN kind,
  DROP COLUMN group_id,
  DROP COLUMN unit_id,
  DROP COLUMN starts_at,
  DROP COLUMN ends_at,
  DROP COLUMN occupied_until,
  DROP COLUMN duration_units,
  DROP COLUMN duration_unit,
  DROP COLUMN renewal_allowed,
  DROP COLUMN renewed_from_id,
  DROP COLUMN hold_expires_at;
--> statement-breakpoint

ALTER TABLE public.spaces
  DROP COLUMN temp_from_cents,
  DROP COLUMN temp_from_units,
  DROP COLUMN temp_from_unit;
--> statement-breakpoint

DROP TABLE public.space_units;
--> statement-breakpoint
DROP TABLE public.space_unit_groups;
--> statement-breakpoint

DROP FUNCTION IF EXISTS public.guard_unit_group_config();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.space_rental_summary(uuid);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.sync_space_rental_summary();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.guard_space_rental_summary();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.space_fully_rented(uuid);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.apply_space_occupancy(uuid);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.sync_space_occupancy();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.sync_occupancy_from_units();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.space_has_rentable_unit(uuid);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.guard_publish_requires_units();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.unit_has_live_rental(uuid);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.space_keeps_a_unit(uuid, uuid, uuid);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.guard_unit_change();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.guard_group_change();
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.temporary_rent_cents(uuid, integer, public.rental_time_unit);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.rental_unit_interval(public.rental_time_unit);
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.guard_booking_rental_shape();
--> statement-breakpoint

DROP TYPE public.rental_kind;
--> statement-breakpoint
DROP TYPE public.rental_time_unit;
--> statement-breakpoint
DROP TYPE public.temporary_pricing_mode;
--> statement-breakpoint
DROP TYPE public.operating_hours_mode;
--> statement-breakpoint

-- Motivos de encerramento: o tipo muda de valores (saem `completed` e
-- `hold_expired`, entram `request_not_answered` e `owner_end_request`).
-- Valor de enum não se apaga, então o tipo é recriado, preservando o que já
-- estava gravado (`hold_expired` vira `payment_not_received`; `completed`,
-- que era o fim natural do aluguel por hora, fica sem motivo).
CREATE TYPE public.booking_end_reason_novo AS ENUM (
  'cancelled_by_renter', 'cancelled_by_owner', 'request_not_answered', 'payment_not_received', 'owner_end_request'
);
--> statement-breakpoint
ALTER TABLE public.bookings ADD COLUMN end_reason_novo public.booking_end_reason_novo;
--> statement-breakpoint
UPDATE public.bookings
   SET end_reason_novo = (CASE end_reason::text
         WHEN 'cancelled_by_renter' THEN 'cancelled_by_renter'
         WHEN 'cancelled_by_owner' THEN 'cancelled_by_owner'
         WHEN 'payment_not_received' THEN 'payment_not_received'
         WHEN 'hold_expired' THEN 'payment_not_received'
         ELSE NULL
       END)::public.booking_end_reason_novo
 WHERE end_reason IS NOT NULL;
--> statement-breakpoint
ALTER TABLE public.bookings DROP COLUMN end_reason;
--> statement-breakpoint
DROP TYPE public.booking_end_reason;
--> statement-breakpoint
ALTER TYPE public.booking_end_reason_novo RENAME TO booking_end_reason;
--> statement-breakpoint
ALTER TABLE public.bookings RENAME COLUMN end_reason_novo TO end_reason;
--> statement-breakpoint

-- Configurações do modelo antigo (nada mais as lê).
DELETE FROM public.platform_settings
 WHERE key IN ('rental.hold_minutes', 'rental.max_advance_days', 'booking.request_expiry_days');
--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 4. Estruturas novas
-- ---------------------------------------------------------------------------

CREATE TYPE public.booking_end_request_status AS ENUM ('pending', 'withdrawn', 'completed');
--> statement-breakpoint
CREATE TYPE public.message_kind AS ENUM ('text', 'audio');
--> statement-breakpoint

ALTER TYPE public.notification_type ADD VALUE 'booking_request_expiring';
--> statement-breakpoint
ALTER TYPE public.notification_type ADD VALUE 'booking_expired';
--> statement-breakpoint
ALTER TYPE public.notification_type ADD VALUE 'rental_started';
--> statement-breakpoint
ALTER TYPE public.notification_type ADD VALUE 'rental_end_requested';
--> statement-breakpoint

CREATE TABLE public.booking_end_requests (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"requested_end_date" date NOT NULL,
	"reason" text,
	"status" public.booking_end_request_status DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "booking_end_requests_reason_max" CHECK ("booking_end_requests"."reason" IS NULL OR char_length("booking_end_requests"."reason") <= 500),
	CONSTRAINT "booking_end_requests_resolved_matches" CHECK (("booking_end_requests"."status" = 'pending') = ("booking_end_requests"."resolved_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE public.booking_end_requests ADD CONSTRAINT "booking_end_requests_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE public.booking_end_requests ADD CONSTRAINT "booking_end_requests_requested_by_profiles_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "booking_end_requests_booking_idx" ON public.booking_end_requests USING btree ("booking_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "booking_end_requests_one_pending" ON public.booking_end_requests USING btree ("booking_id") WHERE status = 'pending';
--> statement-breakpoint
CREATE INDEX "booking_end_requests_due_idx" ON public.booking_end_requests USING btree ("requested_end_date") WHERE status = 'pending';
--> statement-breakpoint

-- Mensagens: texto ou áudio (imagem não existe).
ALTER TABLE public.messages ADD COLUMN kind public.message_kind DEFAULT 'text' NOT NULL;
--> statement-breakpoint
ALTER TABLE public.messages ADD COLUMN audio_path text;
--> statement-breakpoint
ALTER TABLE public.messages ADD COLUMN audio_duration_ms integer;
--> statement-breakpoint
ALTER TABLE public.messages ADD COLUMN audio_mime text;
--> statement-breakpoint
ALTER TABLE public.messages ALTER COLUMN body SET DEFAULT '';
--> statement-breakpoint
ALTER TABLE public.messages DROP CONSTRAINT messages_body_not_empty;
--> statement-breakpoint
ALTER TABLE public.messages ADD CONSTRAINT messages_body_not_empty
  CHECK (kind::text = 'audio' OR length(trim(body)) > 0);
--> statement-breakpoint
ALTER TABLE public.messages ADD CONSTRAINT messages_audio_shape
  CHECK ((kind::text = 'text' AND audio_path IS NULL AND audio_duration_ms IS NULL AND audio_mime IS NULL)
      OR (kind::text = 'audio' AND audio_path IS NOT NULL AND audio_duration_ms BETWEEN 1000 AND 180000
          AND audio_mime IS NOT NULL AND body = ''));
--> statement-breakpoint
-- O arquivo de áudio mora na pasta da própria conversa: ninguém aponta uma
-- mensagem para o áudio de outra conversa.
ALTER TABLE public.messages ADD CONSTRAINT messages_audio_path_in_conversation
  CHECK (audio_path IS NULL OR audio_path LIKE (conversation_id::text || '/%'));
--> statement-breakpoint

-- Anúncios: quantidade e preço obrigatório para ir ao ar.
ALTER TABLE public.spaces ADD CONSTRAINT spaces_quantity_offered_range
  CHECK (quantity_offered BETWEEN 1 AND 10000);
--> statement-breakpoint
ALTER TABLE public.spaces ADD CONSTRAINT spaces_quantity_total_covers_offered
  CHECK (quantity_total IS NULL OR quantity_total >= quantity_offered);
--> statement-breakpoint
ALTER TABLE public.spaces ADD CONSTRAINT spaces_quantity_available_range
  CHECK (quantity_available BETWEEN 0 AND quantity_offered);
--> statement-breakpoint
ALTER TABLE public.spaces ADD CONSTRAINT spaces_published_requires_price
  CHECK (status NOT IN ('published', 'rented') OR price_monthly_cents IS NOT NULL);
--> statement-breakpoint

-- Reservas: índices de varredura, um pedido pendente por pessoa e anúncio, e
-- as regras de formato.
CREATE INDEX "bookings_space_occupying_idx" ON public.bookings USING btree ("space_id")
  WHERE status IN ('approved','awaiting_payment','active','past_due');
--> statement-breakpoint
CREATE INDEX "bookings_response_deadline_idx" ON public.bookings USING btree ("response_deadline_at")
  WHERE status = 'requested';
--> statement-breakpoint
CREATE INDEX "bookings_first_payment_deadline_idx" ON public.bookings USING btree ("first_payment_deadline_at")
  WHERE status IN ('approved','awaiting_payment');
--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_one_pending_per_renter_space" ON public.bookings USING btree ("space_id","renter_id")
  WHERE status = 'requested';
--> statement-breakpoint
ALTER TABLE public.bookings ADD CONSTRAINT bookings_access_instructions_length
  CHECK (access_instructions IS NULL OR char_length(btrim(access_instructions)) BETWEEN 10 AND 1000);
--> statement-breakpoint
-- O áudio das instruções anda junto com a duração e o tipo (mesmos limites do
-- áudio do chat: de 1 s a 3 min).
ALTER TABLE public.bookings ADD CONSTRAINT bookings_access_audio_shape
  CHECK ((access_audio_path IS NULL AND access_audio_duration_ms IS NULL AND access_audio_mime IS NULL)
      OR (access_audio_path IS NOT NULL AND access_audio_duration_ms BETWEEN 1000 AND 180000
          AND access_audio_mime IS NOT NULL));
--> statement-breakpoint
-- A janela do pagamento pendente passa a ser TOTAL de 2 h (era 40 min + 1 h =
-- 100 min). Quem está dentro dela agora recebe os 120 minutos completos; a
-- janela guardada nas locações já encerradas é histórico e fica como estava.
UPDATE public.bookings
   SET payment_issue_deadline_at = payment_issue_started_at + interval '120 minutes'
 WHERE status = 'past_due' AND payment_issue_started_at IS NOT NULL;
--> statement-breakpoint
ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_window
  CHECK ((status = 'past_due'
            AND payment_issue_started_at IS NOT NULL
            AND payment_issue_deadline_at = payment_issue_started_at + interval '120 minutes')
          OR (status <> 'past_due' AND payment_issue_started_at IS NULL AND payment_issue_deadline_at IS NULL)
          OR (status = 'ended' AND payment_issue_started_at IS NOT NULL AND payment_issue_deadline_at > payment_issue_started_at));
--> statement-breakpoint
-- `status::text`: 'expired' entrou no enum por ALTER TYPE ... ADD VALUE (0010),
-- e num banco novo todas as migrações rodam numa transação só — o Postgres não
-- deixa usar esse valor como literal na mesma transação.
ALTER TABLE public.bookings ADD CONSTRAINT bookings_end_reason_matches
  CHECK (end_reason IS NULL OR status::text IN ('ended', 'expired', 'cancelled'));
--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 5. Regras no banco
-- ---------------------------------------------------------------------------

-- Recontagem da disponibilidade de um anúncio. RECONTA (não soma/subtrai):
-- o número nunca diverge das reservas, mesmo se algum caminho esquecer de
-- avisar. Trava a linha do anúncio, então duas alterações simultâneas passam
-- em fila. Se a contagem passar do oferecido (nunca deveria: a trava de
-- capacidade impede), o CHECK `spaces_quantity_available_range` recusa em
-- voz alta em vez de esconder o problema.
CREATE OR REPLACE FUNCTION public.refresh_space_availability(p_space uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  oferecidas integer;
  situacao public.space_status;
  ocupadas integer;
  livres integer;
BEGIN
  SELECT quantity_offered, status INTO oferecidas, situacao
    FROM public.spaces WHERE id = p_space FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT count(*) INTO ocupadas
    FROM public.bookings b
   WHERE b.space_id = p_space AND public.booking_occupies(b.status);
  livres := oferecidas - ocupadas;

  UPDATE public.spaces SET quantity_available = livres
   WHERE id = p_space AND quantity_available IS DISTINCT FROM livres;

  IF situacao = 'published' AND livres <= 0 THEN
    UPDATE public.spaces SET status = 'rented' WHERE id = p_space;
  ELSIF situacao = 'rented' AND livres > 0 THEN
    BEGIN
      UPDATE public.spaces SET status = 'published' WHERE id = p_space;
    EXCEPTION WHEN check_violation THEN
      -- Não dá para voltar ao ar como está (ex.: ficou abaixo do mínimo de
      -- fotos). A locação encerra do mesmo jeito — travar o encerramento por
      -- causa do anúncio seria pior — e o anúncio fica pausado até o
      -- proprietário corrigir.
      UPDATE public.spaces SET status = 'paused' WHERE id = p_space;
    END;
  END IF;
END;
$$;
--> statement-breakpoint

-- Disponibilidade acompanha qualquer mudança de reserva.
CREATE OR REPLACE FUNCTION public.sync_space_availability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_space_availability(OLD.space_id);
  ELSE
    PERFORM public.refresh_space_availability(NEW.space_id);
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER bookings_sync_availability
  AFTER INSERT OR UPDATE OF status, space_id OR DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_space_availability();
--> statement-breakpoint

-- A ÚLTIMA VAGA. Quando uma reserva passa a ocupar (aceite, ou inserção
-- direta já ocupando), o banco trava a linha do anúncio e conta quem já
-- ocupa: se não sobra vaga, recusa. O SELECT ... FOR UPDATE e a contagem são
-- comandos separados de propósito — em READ COMMITTED a contagem enxerga o
-- que a transação concorrente acabou de gravar depois que ela solta a trava.
-- Duas pessoas aceitas ao mesmo tempo para a última vaga: uma passa, a outra
-- recebe `bookings_capacity`.
CREATE OR REPLACE FUNCTION public.guard_booking_capacity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  oferecidas integer;
  ocupadas integer;
BEGIN
  IF NOT public.booking_occupies(NEW.status) THEN
    RETURN NEW;
  END IF;
  -- Já ocupava uma vaga deste anúncio: nada novo (active -> past_due etc.).
  IF TG_OP = 'UPDATE'
     AND public.booking_occupies(OLD.status)
     AND NEW.space_id = OLD.space_id THEN
    RETURN NEW;
  END IF;

  SELECT quantity_offered INTO oferecidas
    FROM public.spaces WHERE id = NEW.space_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anuncio inexistente'
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'bookings_space_exists';
  END IF;

  SELECT count(*) INTO ocupadas
    FROM public.bookings b
   WHERE b.space_id = NEW.space_id
     AND b.id <> NEW.id
     AND public.booking_occupies(b.status);

  IF ocupadas >= oferecidas THEN
    RAISE EXCEPTION 'Nao ha vaga disponivel neste anuncio'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_capacity';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER bookings_guard_capacity
  BEFORE INSERT OR UPDATE OF status, space_id ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_capacity();
--> statement-breakpoint

-- O valor mensal da reserva é sempre o preço do anúncio: conferido quando o
-- pedido nasce e de novo no aceite (que congela o preço vigente). O servidor
-- calcula; o banco confere.
CREATE OR REPLACE FUNCTION public.guard_booking_price()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  preco integer;
BEGIN
  IF TG_OP = 'INSERT' OR (OLD.status = 'requested' AND NEW.status = 'approved') THEN
    SELECT price_monthly_cents INTO preco FROM public.spaces WHERE id = NEW.space_id;
    IF preco IS NULL OR preco IS DISTINCT FROM NEW.monthly_rent_cents THEN
      RAISE EXCEPTION 'Valor mensal diferente do preco do anuncio'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_rent_matches_space';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER bookings_guard_price
  BEFORE INSERT OR UPDATE OF status, monthly_rent_cents ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_price();
--> statement-breakpoint

-- Uma pessoa não tem duas locações vivas do MESMO anúncio: ao nascer um pedido
-- (ou reserva), se ela já tem outra viva ali, o banco recusa. É uma trava de
-- INSERT, não um índice sobre todas as linhas, para não depender de os dados
-- antigos estarem arrumados. Dois cliques ao mesmo tempo caem no índice único
-- de pedido pendente.
CREATE OR REPLACE FUNCTION public.guard_booking_single_live()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('requested', 'approved', 'awaiting_payment', 'active', 'past_due')
     AND EXISTS (
       SELECT 1 FROM public.bookings o
        WHERE o.space_id = NEW.space_id AND o.renter_id = NEW.renter_id AND o.id <> NEW.id
          AND o.status IN ('requested', 'approved', 'awaiting_payment', 'active', 'past_due')
     ) THEN
    RAISE EXCEPTION 'Voce ja tem uma locacao ou pedido em andamento neste anuncio'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_one_live_per_renter_space';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER bookings_guard_single_live
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_single_live();
--> statement-breakpoint

-- Pedido novo: o prazo de resposta (24 h) começa a contar no relógio do banco.
CREATE OR REPLACE FUNCTION public.set_booking_deadlines()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'requested' AND NEW.response_deadline_at IS NULL THEN
    NEW.response_deadline_at := now()
      + make_interval(hours => public.platform_setting_int('booking.request_expiry_hours', 24));
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER bookings_set_deadlines
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_booking_deadlines();
--> statement-breakpoint

-- O ACEITE: só dentro do prazo de resposta, só com instruções de acesso
-- (texto de pelo menos 10 caracteres OU áudio), e é nele que começa o prazo
-- de 24 h para o locatário pagar.
CREATE OR REPLACE FUNCTION public.guard_booking_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'requested' AND NEW.status = 'approved' THEN
    IF OLD.response_deadline_at IS NOT NULL AND OLD.response_deadline_at < now() THEN
      RAISE EXCEPTION 'O prazo para responder esta solicitacao terminou'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_response_window';
    END IF;
    IF NOT (
      (NEW.access_instructions IS NOT NULL AND char_length(btrim(NEW.access_instructions)) >= 10)
      OR NEW.access_audio_path IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Informe como o locatario encontra e usa o espaco (texto ou audio)'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_access_required';
    END IF;
    -- O áudio mora na pasta da conversa entre ESTE locatário e este anúncio:
    -- ninguém aponta a locação para o áudio de outra conversa.
    IF NEW.access_audio_path IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.conversations c
       WHERE c.space_id = NEW.space_id AND c.renter_id = NEW.renter_id
         AND NEW.access_audio_path LIKE (c.id::text || '/%')
    ) THEN
      RAISE EXCEPTION 'O audio das instrucoes precisa estar na conversa desta locacao'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_access_audio_in_conversation';
    END IF;
    NEW.access_instructions_at := now();
    NEW.first_payment_deadline_at := now()
      + make_interval(hours => public.platform_setting_int('booking.payment_deadline_hours', 24));
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER bookings_guard_approval
  BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_approval();
--> statement-breakpoint

-- Quantidade do anúncio: nunca abaixo do que já está ocupado; o disponível é
-- recalculado na hora (anúncio novo nasce com tudo disponível).
CREATE OR REPLACE FUNCTION public.guard_space_quantity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ocupadas integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.quantity_available := NEW.quantity_offered;
    RETURN NEW;
  END IF;

  IF NEW.quantity_offered IS DISTINCT FROM OLD.quantity_offered THEN
    SELECT count(*) INTO ocupadas
      FROM public.bookings b
     WHERE b.space_id = NEW.id AND public.booking_occupies(b.status);
    IF NEW.quantity_offered < ocupadas THEN
      RAISE EXCEPTION 'Ha % locacoes em andamento: a quantidade nao pode ser menor que isso', ocupadas
        USING ERRCODE = 'check_violation', CONSTRAINT = 'spaces_quantity_covers_rentals';
    END IF;
    NEW.quantity_available := NEW.quantity_offered - ocupadas;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER spaces_guard_quantity
  BEFORE INSERT OR UPDATE OF quantity_offered ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.guard_space_quantity();
--> statement-breakpoint

-- Mudou a quantidade oferecida: o status acompanha (alugado <-> no ar).
CREATE OR REPLACE FUNCTION public.sync_space_after_quantity_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_space_availability(NEW.id);
  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER spaces_sync_after_quantity_change
  AFTER UPDATE OF quantity_offered ON public.spaces
  FOR EACH ROW
  WHEN (NEW.quantity_offered IS DISTINCT FROM OLD.quantity_offered)
  EXECUTE FUNCTION public.sync_space_after_quantity_change();
--> statement-breakpoint

-- Nenhum anúncio fica `published` sem vaga: retomar um anúncio pausado ou
-- republicar um lotado volta para `rented`. (O gatilho já existe desde a 0026.)
CREATE OR REPLACE FUNCTION public.guard_published_not_occupied()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'published' AND NEW.quantity_available <= 0 THEN
    NEW.status := 'rented';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- Pedido de encerramento do proprietário: só ele pede, só de locação em
-- andamento, e a data respeita o prazo mínimo configurado (hoje 0 dias: as
-- regras de aviso prévio ainda não foram decididas e entram aqui, sem deploy).
CREATE OR REPLACE FUNCTION public.guard_booking_end_request()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  dono uuid;
  situacao public.booking_status;
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  minimo integer := public.platform_setting_int('rental.end_request_min_notice_days', 0);
BEGIN
  SELECT owner_id, status INTO dono, situacao
    FROM public.bookings WHERE id = NEW.booking_id FOR UPDATE;
  IF NOT FOUND OR dono <> NEW.requested_by THEN
    RAISE EXCEPTION 'So o proprietario da locacao pede o encerramento'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_end_requests_by_owner';
  END IF;
  IF situacao NOT IN ('active', 'past_due') THEN
    RAISE EXCEPTION 'So locacao em andamento pode ter encerramento pedido'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_end_requests_live_booking';
  END IF;
  IF NEW.requested_end_date < hoje + minimo THEN
    RAISE EXCEPTION 'A data pedida precisa ter pelo menos % dias de antecedencia', minimo
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_end_requests_min_notice';
  END IF;
  IF NEW.requested_end_date > hoje + 365 THEN
    RAISE EXCEPTION 'A data pedida esta longe demais'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'booking_end_requests_horizon';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER booking_end_requests_guard
  BEFORE INSERT ON public.booking_end_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_end_request();
--> statement-breakpoint

-- Encerrar o que venceu — sempre pelo relógio do banco. Chamada (a) pela
-- transação que vai aceitar um pedido, (b) pelas telas antes de mostrar e (c)
-- pelo agendador. Só mexe em estado; o que acontece FORA do banco (cancelar a
-- recorrência no Asaas, excluir cobrança que não vale mais, avisar) fica
-- marcado aqui e é executado pela aplicação, que repete até o gateway
-- confirmar. Trava o anúncio ANTES de mexer nas reservas dele — a mesma
-- ordem das ações da aplicação, para duas transações nunca se esperarem.
CREATE OR REPLACE FUNCTION public.release_expired_rentals(p_space uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  total integer := 0;
  n integer;
  alvo uuid;
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  FOR alvo IN
    SELECT DISTINCT b.space_id FROM public.bookings b
     WHERE (p_space IS NULL OR b.space_id = p_space)
       AND (   (b.status = 'requested' AND b.response_deadline_at <= now())
            OR (b.status IN ('approved', 'awaiting_payment') AND b.first_payment_deadline_at <= now())
            OR (b.status = 'past_due' AND b.payment_issue_deadline_at <= now())
            OR (b.status IN ('active', 'past_due') AND EXISTS (
                  SELECT 1 FROM public.booking_end_requests r
                   WHERE r.booking_id = b.id AND r.status = 'pending' AND r.requested_end_date <= hoje)))
  LOOP
    PERFORM 1 FROM public.spaces WHERE id = alvo FOR UPDATE;

    -- Pedido que o proprietário não respondeu em 24 h.
    UPDATE public.bookings
       SET status = 'expired', end_reason = 'request_not_answered', updated_at = now()
     WHERE space_id = alvo AND status = 'requested' AND response_deadline_at <= now();
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;

    -- Locação aceita que não foi paga em 24 h: a vaga volta; a cobrança em
    -- aberto e a recorrência ficam marcadas para o gateway.
    WITH vencidas AS (
      UPDATE public.bookings
         SET status = 'expired', end_reason = 'payment_not_received', updated_at = now()
       WHERE space_id = alvo AND status IN ('approved', 'awaiting_payment')
         AND first_payment_deadline_at <= now()
      RETURNING id
    ), cobrancas AS (
      UPDATE public.payments p
         SET delete_requested_at = now(), updated_at = now()
        FROM vencidas v
       WHERE p.booking_id = v.id AND p.status IN ('pending', 'overdue') AND p.delete_requested_at IS NULL
      RETURNING p.id
    ), assinaturas AS (
      UPDATE public.subscriptions s
         SET status = 'cancelled', cancelled_at = now(), updated_at = now()
        FROM vencidas v
       WHERE s.booking_id = v.id AND s.status IN ('pending_authorization', 'active', 'past_due', 'paused')
      RETURNING s.id
    )
    SELECT count(*) INTO n FROM vencidas;
    total := total + n;

    -- Pagamento pendente que passou da janela de 2 h: locação encerrada,
    -- recorrência marcada como cancelada.
    WITH encerradas AS (
      UPDATE public.bookings
         SET status = 'ended', end_reason = 'payment_not_received', ended_at = now(), updated_at = now()
       WHERE space_id = alvo AND status = 'past_due' AND payment_issue_deadline_at <= now()
      RETURNING id
    ), assinaturas AS (
      UPDATE public.subscriptions s
         SET status = 'cancelled', cancelled_at = now(), updated_at = now()
        FROM encerradas e
       WHERE s.booking_id = e.id AND s.status IN ('pending_authorization', 'active', 'past_due', 'paused')
      RETURNING s.id
    )
    SELECT count(*) INTO n FROM encerradas;
    total := total + n;

    -- Pedido de encerramento do proprietário cuja data chegou.
    WITH vencidos AS (
      SELECT r.id AS pedido, b.id AS reserva
        FROM public.booking_end_requests r
        JOIN public.bookings b ON b.id = r.booking_id
       WHERE b.space_id = alvo AND r.status = 'pending'
         AND r.requested_end_date <= hoje AND b.status IN ('active', 'past_due')
    ), encerradas AS (
      UPDATE public.bookings b
         SET status = 'ended', end_reason = 'owner_end_request', ended_at = now(), updated_at = now()
        FROM vencidos v
       WHERE b.id = v.reserva
      RETURNING b.id
    ), assinaturas AS (
      UPDATE public.subscriptions s
         SET status = 'cancelled', cancelled_at = now(), updated_at = now()
        FROM encerradas e
       WHERE s.booking_id = e.id AND s.status IN ('pending_authorization', 'active', 'past_due', 'paused')
      RETURNING s.id
    ), cumpridos AS (
      UPDATE public.booking_end_requests r
         SET status = 'completed', resolved_at = now()
        FROM vencidos v
       WHERE r.id = v.pedido
      RETURNING r.id
    )
    SELECT count(*) INTO n FROM encerradas;
    total := total + n;
  END LOOP;

  -- Pedido de encerramento que ficou para trás porque a locação terminou por
  -- outro motivo: não há mais o que pedir.
  UPDATE public.booking_end_requests r
     SET status = 'completed', resolved_at = now()
    FROM public.bookings b
   WHERE r.booking_id = b.id AND r.status = 'pending'
     AND b.status NOT IN ('active', 'past_due')
     AND (p_space IS NULL OR b.space_id = p_space);

  RETURN total;
END;
$$;
--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 6. Calendário: o bloqueio vale para o INÍCIO de novas locações
--
-- Num aluguel mensal sem data para terminar, "bloqueio nunca cobre reserva
-- vigente" impedia qualquer bloqueio futuro assim que existisse uma locação
-- ativa — e com várias vagas isso é o normal. Agora o bloqueio fecha dias
-- para o início de locações novas (o equivalente a um calendário de entrada);
-- quem já está dentro continua. O aceite de um pedido cuja data de início cai
-- num dia bloqueado é recusado.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_availability_block()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  periodo daterange;
BEGIN
  -- Desfazer um bloqueio nunca conflita com nada.
  IF NEW.cancelled_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- Datas invertidas: o CHECK space_availability_blocks_dates_ordered recusa.
  IF NEW.ends_on < NEW.starts_on THEN
    RETURN NEW;
  END IF;
  periodo := daterange(NEW.starts_on, NEW.ends_on, '[]');

  PERFORM 1 FROM public.spaces WHERE id = NEW.space_id FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.space_availability_blocks o
     WHERE o.space_id = NEW.space_id
       AND o.id <> NEW.id
       AND o.cancelled_at IS NULL
       AND daterange(o.starts_on, o.ends_on, '[]') && periodo
  ) THEN
    RAISE EXCEPTION 'Ja existe um bloqueio que cobre essas datas'
      USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'space_availability_blocks_no_overlap';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.guard_booking_against_blocks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  bloqueio record;
BEGIN
  IF NOT public.booking_occupies(NEW.status) THEN
    RETURN NEW;
  END IF;
  -- Já ocupava uma vaga com esta mesma data de início: nada novo.
  IF TG_OP = 'UPDATE'
     AND public.booking_occupies(OLD.status)
     AND NEW.start_date = OLD.start_date THEN
    RETURN NEW;
  END IF;

  PERFORM 1 FROM public.spaces WHERE id = NEW.space_id FOR UPDATE;

  SELECT k.starts_on, k.ends_on INTO bloqueio
    FROM public.space_availability_blocks k
   WHERE k.space_id = NEW.space_id
     AND k.cancelled_at IS NULL
     AND NEW.start_date BETWEEN k.starts_on AND k.ends_on
   ORDER BY k.starts_on
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'O proprietario bloqueou o inicio de locacoes de % a %',
      to_char(bloqueio.starts_on, 'DD/MM/YYYY'), to_char(bloqueio.ends_on, 'DD/MM/YYYY')
      USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'bookings_period_not_blocked';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER bookings_guard_blocked_period
  BEFORE INSERT OR UPDATE OF status, start_date ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_against_blocks();
--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 7. RLS, Storage do áudio e configurações
-- ---------------------------------------------------------------------------

ALTER TABLE public.booking_end_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$
DECLARE
  f text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.booking_end_requests FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.booking_end_requests FROM authenticated;
  END IF;

  -- Funções que mudam estado não são chamáveis pela API do navegador (RPC).
  FOREACH f IN ARRAY ARRAY['public.refresh_space_availability(uuid)', 'public.release_expired_rentals(uuid)'] LOOP
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
  ('booking.request_expiry_hours', '24'::jsonb,
   'Horas que o proprietário tem para aceitar ou recusar um pedido antes dele expirar.', true),
  ('booking.payment_deadline_hours', '24'::jsonb,
   'Horas que o locatário tem para pagar uma locação aceita antes dela expirar e a vaga voltar.', true),
  ('booking.max_start_advance_days', '90'::jsonb,
   'Com quantos dias de antecedência dá para escolher a data de início de uma locação.', true),
  ('rental.end_request_min_notice_days', '0'::jsonb,
   'Aviso prévio mínimo, em dias, para o proprietário pedir o encerramento de uma locação. As regras de aviso e multa ainda não foram definidas.', false),
  ('privacy.exact_location_types',
   '["loja","escritorio","galpao","estacionamento","espaco_eventos","oficina"]'::jsonb,
   'Tipos de espaço comercial cujo endereço já é público: o mapa mostra o ponto exato. Os demais mostram só a região aproximada até a locação ser confirmada.', false)
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint

-- Privacidade da localização por TIPO de espaço. O mapa público só lê
-- `approx_location`. Para residências e tipos pessoais ela é um ponto
-- DESLOCADO (o endereço só é liberado depois da locação confirmada). Para os
-- tipos comerciais listados em `privacy.exact_location_types` o endereço já é
-- público por natureza (loja, escritório, galpão…) e `approx_location` é o
-- ponto exato — assim nenhuma consulta pública precisa saber da exceção:
-- nenhuma delas lê `location`. Rua, número e complemento continuam privados
-- até a locação ser confirmada, para qualquer tipo.
CREATE OR REPLACE FUNCTION public.sync_approx_location()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  raio integer;
  exatos jsonb;
BEGIN
  IF NEW.location IS NULL THEN
    NEW.approx_location := NULL;
    RETURN NEW;
  END IF;

  SELECT value INTO exatos FROM public.platform_settings WHERE key = 'privacy.exact_location_types';
  IF jsonb_typeof(exatos) = 'array' AND exatos ? NEW.type::text THEN
    NEW.approx_location := NEW.location;
    RETURN NEW;
  END IF;

  -- So recalcula quando o ponto exato (ou o tipo) muda. Assim o deslocamento
  -- de um anuncio publicado nao "pula" a cada edicao de titulo ou preco.
  IF TG_OP = 'UPDATE'
     AND OLD.location IS NOT NULL
     AND ST_Equals(OLD.location, NEW.location)
     AND OLD.type IS NOT DISTINCT FROM NEW.type
     AND NEW.approx_location IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE((value #>> '{}')::integer, 300) INTO raio
  FROM public.platform_settings WHERE key = 'privacy.approx_location_meters';

  NEW.approx_location := public.fuzz_location(NEW.location, NEW.id, COALESCE(raio, 300));
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS spaces_sync_approx_location ON public.spaces;
--> statement-breakpoint
CREATE TRIGGER spaces_sync_approx_location
  BEFORE INSERT OR UPDATE OF location, type ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.sync_approx_location();
--> statement-breakpoint

-- Mudou a lista de tipos (ou o raio): os anúncios existentes são recalculados
-- na hora. O deslocamento dos que continuam aproximados é determinístico por
-- anúncio, então não "pula".
CREATE OR REPLACE FUNCTION public.resync_approx_after_privacy_setting()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.spaces SET approx_location = NULL, location = location WHERE location IS NOT NULL;
  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER platform_settings_privacy_resync
  AFTER INSERT OR UPDATE OF value ON public.platform_settings
  FOR EACH ROW
  WHEN (NEW.key IN ('privacy.exact_location_types', 'privacy.approx_location_meters'))
  EXECUTE FUNCTION public.resync_approx_after_privacy_setting();
--> statement-breakpoint

-- Aplica a regra aos anúncios que já existem.
UPDATE public.spaces SET approx_location = NULL, location = location WHERE location IS NOT NULL;
--> statement-breakpoint

DO $mp_audio_bucket$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'Schema storage ausente — pulando o bucket de áudio (normal fora do Supabase).';
    RETURN;
  END IF;

  -- Bucket PRIVADO. O áudio só é servido por URL assinada de validade curta,
  -- gerada no servidor para quem participa da conversa.
  BEGIN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'chat-audio', 'chat-audio', false, 5242880,
      ARRAY['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg']
    )
    ON CONFLICT (id) DO UPDATE SET
      public = false,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'];

    RAISE NOTICE 'Bucket chat-audio configurado: privado, 5 MB, webm/ogg/mp4/mpeg.';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'Sem permissao para configurar o bucket por SQL. Faca no painel: Storage > New bucket > chat-audio (privado, 5 MB, audio/webm,audio/ogg,audio/mp4,audio/mpeg).';
  END;
END $mp_audio_bucket$;
--> statement-breakpoint

DO $mp_audio_pol$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'Schema storage ausente — pulando politicas do áudio.';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE NOTICE 'Papel authenticated ausente — pulando politicas do áudio.';
    RETURN;
  END IF;

  /*
   * O caminho é `<id da conversa>/<uuid>.<ext>`. A primeira pasta ser o id da
   * conversa permite escrever a regra aqui: só quem participa dela (locatário
   * ou proprietário) lê ou envia. Não há política para `anon`, nem para
   * atualizar ou apagar: o áudio enviado não se edita. A autorização de
   * verdade está na aplicação (src/lib/messaging/audio.ts); estas políticas
   * são a segunda tranca.
   */
  BEGIN
    EXECUTE $pol$DROP POLICY IF EXISTS chat_audio_participante_le ON storage.objects$pol$;
    EXECUTE $pol$CREATE POLICY chat_audio_participante_le ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'chat-audio'
        AND EXISTS (
          SELECT 1 FROM public.conversations c
           WHERE c.id::text = (storage.foldername(name))[1]
             AND (c.renter_id = auth.uid() OR c.owner_id = auth.uid())
        )
      )$pol$;

    EXECUTE $pol$DROP POLICY IF EXISTS chat_audio_participante_envia ON storage.objects$pol$;
    EXECUTE $pol$CREATE POLICY chat_audio_participante_envia ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'chat-audio'
        AND EXISTS (
          SELECT 1 FROM public.conversations c
           WHERE c.id::text = (storage.foldername(name))[1]
             AND (c.renter_id = auth.uid() OR c.owner_id = auth.uid())
        )
      )$pol$;

    RAISE NOTICE 'Politicas do bucket chat-audio aplicadas (2 politicas, por conversa).';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'Sem permissao para criar politica em storage.objects. Crie no painel (Storage > Policies) restringindo leitura e envio do bucket chat-audio a quem participa da conversa da primeira pasta.';
  END;
END $mp_audio_pol$;
