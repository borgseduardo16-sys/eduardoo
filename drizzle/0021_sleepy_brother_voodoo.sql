-- ============================================================================
-- MyPlace — confianca, perfil, reputacao e verificacao (Fase 21)
--
-- O que este arquivo faz, em ordem:
--   1. Estruturas novas: nome de exibicao/bio/verificacoes no perfil,
--      verificacao de telefone, preferencias de notificacao, denuncia de
--      avaliacao e "quem recebeu" em cada avaliacao
--   2. Avaliacao: quem recebeu vem da reserva; nota e texto sao imutaveis;
--      apagar exige decisao explicita; media com UMA regra de arredondamento
--   3. Denuncia de avaliacao: evidencia e reincidencia cobrem o alvo novo
--   4. E-mail verificado: copia fiel de auth.users.email_confirmed_at
--   5. Telefone verificado: trocar o numero derruba a verificacao
--   6. RLS: fecha a leitura de telefone/CPF de terceiros pela API
--
-- Nota sobre enum: valores acrescentados com ALTER TYPE ... ADD VALUE nao
-- podem ser usados como literal na mesma transacao (o migrador do Drizzle
-- roda todas as migracoes pendentes numa transacao so). Por isso o CHECK
-- de denuncia compara `target_type::text` e as funcoes idem.
-- ============================================================================

CREATE TYPE "public"."identity_verification_status" AS ENUM('not_started', 'pending', 'verified', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."notification_category" AS ENUM('reservas', 'pagamentos', 'mensagens', 'avaliacoes', 'meus_espacos', 'recomendacoes', 'conta');--> statement-breakpoint
CREATE TYPE "public"."phone_verification_status" AS ENUM('pending', 'approved', 'failed', 'expired', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'review_available';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'promotion_expiring';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'premium_changed';--> statement-breakpoint
ALTER TYPE "public"."report_reason" ADD VALUE 'fotos_enganosas';--> statement-breakpoint
ALTER TYPE "public"."report_reason" ADD VALUE 'comportamento_suspeito';--> statement-breakpoint
ALTER TYPE "public"."report_reason" ADD VALUE 'informacao_falsa';--> statement-breakpoint
ALTER TYPE "public"."report_reason" ADD VALUE 'conteudo_ofensivo';--> statement-breakpoint
ALTER TYPE "public"."report_target" ADD VALUE 'review';--> statement-breakpoint
CREATE TABLE "phone_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"status" "phone_verification_status" DEFAULT 'pending' NOT NULL,
	"provider" text DEFAULT 'twilio_verify' NOT NULL,
	"provider_sid" text,
	"check_attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "phone_verifications_phone_e164" CHECK ("phone_verifications"."phone" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "phone_verifications_attempts_range" CHECK ("phone_verifications"."check_attempts" BETWEEN 0 AND 10),
	CONSTRAINT "phone_verifications_resolved_matches_status" CHECK (("phone_verifications"."status" = 'pending') = ("phone_verifications"."resolved_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid NOT NULL,
	"category" "notification_category" NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"push" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_category_pk" PRIMARY KEY("user_id","category"),
	CONSTRAINT "notification_preferences_essential_locked" CHECK ("notification_preferences"."category" NOT IN ('reservas', 'pagamentos', 'conta') OR ("notification_preferences"."in_app" AND "notification_preferences"."push"))
);
--> statement-breakpoint
ALTER TABLE "reports" DROP CONSTRAINT "reports_target_matches_type";--> statement-breakpoint
DROP INDEX "reports_one_open_per_target";--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "public_name" text GENERATED ALWAYS AS (COALESCE(NULLIF(btrim("display_name"), ''), NULLIF(split_part(btrim(COALESCE("full_name", '')), ' ', 1), ''))) STORED;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "identity_verification_status" "identity_verification_status" DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "review_id" uuid;--> statement-breakpoint

-- `reviewed_user_id` nasce nulo, e preenchido a partir da propria reserva e
-- so entao vira NOT NULL — ja ha avaliacoes gravadas. As triggers ficam
-- desligadas so durante este UPDATE: ele nao mexe em nota nem texto, entao
-- nao ha media a recalcular nem `updated_at` a alterar.
ALTER TABLE "reviews" ADD COLUMN "reviewed_user_id" uuid;--> statement-breakpoint
ALTER TABLE "reviews" DISABLE TRIGGER USER;--> statement-breakpoint
UPDATE "reviews" r
SET "reviewed_user_id" = CASE WHEN r."kind" = 'renter_to_space' THEN b."owner_id" ELSE b."renter_id" END
FROM "bookings" b
WHERE b."id" = r."booking_id";--> statement-breakpoint
ALTER TABLE "reviews" ENABLE TRIGGER USER;--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "reviewed_user_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "phone_verifications" ADD CONSTRAINT "phone_verifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "phone_verifications_one_pending_per_user" ON "phone_verifications" USING btree ("user_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "phone_verifications_user_created_idx" ON "phone_verifications" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewed_user_id_profiles_id_fk" FOREIGN KEY ("reviewed_user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_verified_phone_key" ON "profiles" USING btree ("phone") WHERE phone_verified_at IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "reports_review_idx" ON "reports" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "reviews_reviewed_user_idx" ON "reviews" USING btree ("reviewed_user_id","kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_one_open_per_target" ON "reports" USING btree ("reporter_id","target_type",COALESCE(space_id, target_user_id, message_id, review_id)) WHERE status IN ('open','reviewing') AND reporter_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_display_name_length" CHECK ("profiles"."display_name" IS NULL OR char_length(btrim("profiles"."display_name")) BETWEEN 2 AND 40);--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_bio_length" CHECK ("profiles"."bio" IS NULL OR char_length("profiles"."bio") <= 500);--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_avatar_path_own_folder" CHECK ("profiles"."avatar_path" IS NULL OR "profiles"."avatar_path" LIKE ("profiles"."id"::text || '/avatar/%'));--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_identity_status_matches" CHECK (("profiles"."identity_verification_status" = 'verified') = ("profiles"."document_verified_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_matches_type" CHECK (("reports"."target_type"::text = 'space'   AND "reports"."space_id" IS NOT NULL AND "reports"."target_user_id" IS NULL AND "reports"."message_id" IS NULL AND "reports"."review_id" IS NULL)
          OR ("reports"."target_type"::text = 'user'    AND "reports"."target_user_id" IS NOT NULL AND "reports"."space_id" IS NULL AND "reports"."message_id" IS NULL AND "reports"."review_id" IS NULL)
          OR ("reports"."target_type"::text = 'message' AND "reports"."message_id" IS NOT NULL AND "reports"."space_id" IS NULL AND "reports"."target_user_id" IS NULL AND "reports"."review_id" IS NULL)
          OR ("reports"."target_type"::text = 'review'  AND "reports"."review_id" IS NOT NULL AND "reports"."space_id" IS NULL AND "reports"."target_user_id" IS NULL AND "reports"."message_id" IS NULL));--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_not_self" CHECK ("reviews"."author_id" <> "reviews"."reviewed_user_id");--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 2. Avaliacao
-- ---------------------------------------------------------------------------

-- Mesma validacao de antes (reserva existe, esta encerrada, autor e a parte
-- certa) e agora tambem decide QUEM recebeu a avaliacao: sempre a outra parte
-- da reserva. Um INSERT que omite o campo recebe o valor certo; um que
-- informa outra pessoa e recusado.
CREATE OR REPLACE FUNCTION public.validate_review()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  b record;
  avaliado uuid;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = NEW.booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva % nao existe', NEW.booking_id;
  END IF;

  IF b.status <> 'ended' THEN
    RAISE EXCEPTION 'So e possivel avaliar apos o encerramento da locacao (status atual: %)', b.status;
  END IF;

  IF NEW.kind = 'renter_to_space' THEN
    IF NEW.author_id <> b.renter_id THEN
      RAISE EXCEPTION 'Apenas o locatario da reserva pode avaliar o espaco';
    END IF;
    IF NEW.space_id <> b.space_id THEN
      RAISE EXCEPTION 'A avaliacao aponta para um espaco diferente do da reserva';
    END IF;
    avaliado := b.owner_id;
  ELSE
    IF NEW.author_id <> b.owner_id THEN
      RAISE EXCEPTION 'Apenas o proprietario da reserva pode avaliar o locatario';
    END IF;
    IF NEW.target_user_id <> b.renter_id THEN
      RAISE EXCEPTION 'A avaliacao aponta para um usuario que nao e o locatario da reserva';
    END IF;
    avaliado := b.renter_id;
  END IF;

  IF NEW.reviewed_user_id IS NULL THEN
    NEW.reviewed_user_id := avaliado;
  ELSIF NEW.reviewed_user_id <> avaliado THEN
    RAISE EXCEPTION 'A avaliacao aponta para uma pessoa que nao e a outra parte da reserva';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- Avaliacao publicada nao muda: nem nota, nem texto, nem autor, nem alvo.
-- A moderacao so pode OCULTAR (hidden_at/hidden_reason), e isso fica
-- registrado. Apagar tambem e bloqueado — apagar avaliacao ruim e o jeito mais
-- simples de inflar media. Para manutencao excepcional (ex.: pedido de
-- exclusao de dados pela LGPD), quem opera o banco liga explicitamente
-- `SET LOCAL myplace.allow_review_delete = 'on'` na propria transacao; a
-- aplicacao nunca faz isso.
CREATE OR REPLACE FUNCTION public.guard_review_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('myplace.allow_review_delete', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Avaliacao nao pode ser apagada; para tirar do ar, oculte (hidden_at)';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.booking_id IS DISTINCT FROM OLD.booking_id
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.author_id IS DISTINCT FROM OLD.author_id
     OR NEW.space_id IS DISTINCT FROM OLD.space_id
     OR NEW.target_user_id IS DISTINCT FROM OLD.target_user_id
     OR NEW.reviewed_user_id IS DISTINCT FROM OLD.reviewed_user_id
     OR NEW.rating IS DISTINCT FROM OLD.rating
     OR NEW.comment IS DISTINCT FROM OLD.comment
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Avaliacao publicada nao pode ser alterada (so ocultada pela moderacao)';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER reviews_guard_immutable
  BEFORE UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.guard_review_immutable();
--> statement-breakpoint

-- Media do anuncio com UMA casa decimal, arredondada uma unica vez a partir
-- das notas (metade para cima: 4,65 -> 4,7; 4,6666 -> 4,7). Antes guardava
-- duas casas e a tela arredondava de novo — dois arredondamentos seguidos
-- podem divergir do valor certo (4,649 -> 4,65 -> 4,7, quando o certo e 4,6).
-- A reputacao por pessoa usa a mesma regra (src/lib/reviews/reputation.ts).
CREATE OR REPLACE FUNCTION public.refresh_space_rating()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE target uuid;
BEGIN
  target := COALESCE(NEW.space_id, OLD.space_id);
  IF target IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  UPDATE public.spaces s
  SET rating_avg = sub.avg_rating,
      rating_count = sub.cnt
  FROM (
    SELECT ROUND(AVG(rating)::numeric, 1) AS avg_rating, COUNT(*)::int AS cnt
    FROM public.reviews
    WHERE space_id = target AND hidden_at IS NULL
  ) sub
  WHERE s.id = target;

  RETURN COALESCE(NEW, OLD);
END;
$$;
--> statement-breakpoint

-- Recalcula as medias ja gravadas com a regra nova (so onde muda algo).
UPDATE public.spaces s
SET rating_avg = sub.avg_rating,
    rating_count = sub.cnt
FROM (
  SELECT space_id, ROUND(AVG(rating)::numeric, 1) AS avg_rating, COUNT(*)::int AS cnt
  FROM public.reviews
  WHERE space_id IS NOT NULL AND hidden_at IS NULL
  GROUP BY space_id
) sub
WHERE s.id = sub.space_id
  AND (s.rating_avg IS DISTINCT FROM sub.avg_rating OR s.rating_count IS DISTINCT FROM sub.cnt);
--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 3. Denuncia de avaliacao
-- ---------------------------------------------------------------------------

-- Evidencia: agora tambem copia a avaliacao denunciada.
CREATE OR REPLACE FUNCTION public.capture_report_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.evidence_snapshot IS NOT NULL THEN RETURN NEW; END IF;

  IF NEW.target_type::text = 'message' THEN
    SELECT jsonb_build_object(
             'body', m.body,
             'sender_id', m.sender_id,
             'conversation_id', m.conversation_id,
             'sent_at', m.created_at,
             'flag_reason', m.flag_reason)
      INTO NEW.evidence_snapshot
      FROM public.messages m WHERE m.id = NEW.message_id;

  ELSIF NEW.target_type::text = 'space' THEN
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

  ELSIF NEW.target_type::text = 'user' THEN
    SELECT jsonb_build_object(
             'full_name', p.full_name,
             'role', p.role,
             'status', p.status,
             'member_since', p.created_at,
             'upheld_report_count', p.upheld_report_count)
      INTO NEW.evidence_snapshot
      FROM public.profiles p WHERE p.id = NEW.target_user_id;

  ELSIF NEW.target_type::text = 'review' THEN
    SELECT jsonb_build_object(
             'rating', rv.rating,
             'comment', rv.comment,
             'kind', rv.kind,
             'author_id', rv.author_id,
             'reviewed_user_id', rv.reviewed_user_id,
             'booking_id', rv.booking_id,
             'space_id', rv.space_id,
             'created_at', rv.created_at)
      INTO NEW.evidence_snapshot
      FROM public.reviews rv WHERE rv.id = NEW.review_id;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- Reincidencia: denuncia procedente de avaliacao conta contra quem ESCREVEU.
-- Resto igual a 0011 (suspensao automatica ao atingir o limite).
CREATE OR REPLACE FUNCTION public.refresh_upheld_report_count()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  alvo uuid;
  novo_total integer;
  limite integer;
BEGIN
  -- Para denuncia de anuncio, mensagem ou avaliacao, o responsavel e o autor do conteudo.
  alvo := COALESCE(
    NEW.target_user_id,
    (SELECT owner_id FROM public.spaces WHERE id = NEW.space_id),
    (SELECT sender_id FROM public.messages WHERE id = NEW.message_id),
    (SELECT author_id FROM public.reviews WHERE id = NEW.review_id)
  );

  IF alvo IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO novo_total
  FROM public.reports r
  WHERE r.upheld = true
    AND COALESCE(
          r.target_user_id,
          (SELECT owner_id FROM public.spaces WHERE id = r.space_id),
          (SELECT sender_id FROM public.messages WHERE id = r.message_id),
          (SELECT author_id FROM public.reviews WHERE id = r.review_id)
        ) = alvo;

  UPDATE public.profiles SET upheld_report_count = novo_total WHERE id = alvo;

  SELECT (value #>> '{}')::int INTO limite
  FROM public.platform_settings WHERE key = 'safety.auto_suspend_upheld_threshold';
  limite := COALESCE(limite, 5);

  IF novo_total >= limite THEN
    UPDATE public.profiles
    SET status = 'suspended',
        status_reason = 'Suspensão automática: ' || novo_total || ' denúncias procedentes.'
    WHERE id = alvo AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 4. E-mail verificado
--
-- A fonte da verdade e o Supabase Auth: `auth.users.email_confirmed_at` so e
-- preenchido quando a pessoa abre o link de confirmacao. `profiles` guarda
-- uma copia, mantida por trigger, para o selo sair do dado real e nao de uma
-- suposicao do app. (Exige "Confirm email" LIGADO no Supabase — com ele
-- desligado o Auth marca todo cadastro como confirmado; ver docs/SETUP.md.)
-- ---------------------------------------------------------------------------

-- O stub local de auth.users (migracao 0001) nao tinha a coluna. No Supabase
-- ela ja existe e nada acontece aqui.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_confirmed_at'
  ) THEN
    ALTER TABLE auth.users ADD COLUMN email_confirmed_at timestamptz;
  END IF;
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email_verified_at)
  VALUES (
    NEW.id,
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')), ''),
    NEW.email_confirmed_at
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.sync_email_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET email_verified_at = NEW.email_confirmed_at
  WHERE id = NEW.id
    AND email_verified_at IS DISTINCT FROM NEW.email_confirmed_at;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
--> statement-breakpoint
CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_email_verified();
--> statement-breakpoint

-- Quem ja confirmou antes desta migracao.
UPDATE public.profiles p
SET email_verified_at = u.email_confirmed_at
FROM auth.users u
WHERE u.id = p.id
  AND u.email_confirmed_at IS NOT NULL
  AND p.email_verified_at IS NULL;
--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 5. Selos so mudam pelo caminho certo
--
-- (a) Trocar o telefone derruba a verificacao do numero anterior — senao a
--     pessoa verificaria um numero e depois trocaria por outro mantendo o selo.
-- (b) Pela API do navegador (requisicao com JWT), ninguem altera selo nem
--     contador, nem no proprio perfil. O privilegio por coluna ja impede;
--     isto e a segunda trava. O servidor (sem JWT) e as triggers do sistema
--     seguem livres — e so por eles que a verificacao real chega.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_profile_verification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() AND (
       NEW.email_verified_at IS DISTINCT FROM OLD.email_verified_at
    OR NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at
    OR NEW.document_verified_at IS DISTINCT FROM OLD.document_verified_at
    OR NEW.identity_verification_status IS DISTINCT FROM OLD.identity_verification_status
    OR NEW.completed_bookings_count IS DISTINCT FROM OLD.completed_bookings_count
    OR NEW.upheld_report_count IS DISTINCT FROM OLD.upheld_report_count
  ) THEN
    RAISE EXCEPTION 'Verificacoes e contadores do perfil nao podem ser alterados por esta via';
  END IF;

  IF NEW.phone IS DISTINCT FROM OLD.phone
     AND NEW.phone_verified_at IS NOT DISTINCT FROM OLD.phone_verified_at THEN
    NEW.phone_verified_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER profiles_guard_verification
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_verification();
--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 6. RLS — o que o navegador consegue ler
--
-- Achado desta fase: `authenticated` tinha SELECT em TODAS as colunas de
-- profiles, e a policy "profiles_select_public_subset" libera todas as
-- linhas ativas. Somadas, qualquer conta logada lia telefone e CPF de todo
-- mundo pela API REST do Supabase, com a chave publica. O app nao usa esse
-- caminho (o servidor le com conexao privilegiada), mas a porta existia.
--
-- Correcao: SELECT por COLUNA, so nas colunas que podem ser publicas.
-- Telefone, CPF/CNPJ, nome completo, cidade, motivo de bloqueio e contadores
-- de moderacao ficam de fora. O proprio usuario tambem perde a leitura
-- direta desses campos pela API — o app ja os le pelo servidor.
-- ---------------------------------------------------------------------------

REVOKE SELECT ON public.profiles FROM anon, authenticated;
--> statement-breakpoint
GRANT SELECT (id, public_name, avatar_path, bio, created_at,
              email_verified_at, phone_verified_at, document_verified_at,
              identity_verification_status, completed_bookings_count,
              status, deleted_at)
  ON public.profiles TO authenticated;
--> statement-breakpoint

-- A view publica passa a expor o nome PUBLICO (nome de exibicao ou primeiro
-- nome), nunca o nome completo, e os selos como booleanos.
DROP VIEW IF EXISTS public.public_profiles;
--> statement-breakpoint
CREATE VIEW public.public_profiles
WITH (security_invoker = true) AS
  SELECT id,
         public_name,
         avatar_path,
         bio,
         created_at,
         email_verified_at IS NOT NULL AS email_verified,
         phone_verified_at IS NOT NULL AS phone_verified,
         identity_verification_status = 'verified' AS identity_verified,
         completed_bookings_count
  FROM public.profiles
  WHERE status = 'active' AND deleted_at IS NULL;
--> statement-breakpoint
GRANT SELECT ON public.public_profiles TO authenticated;
--> statement-breakpoint

-- Quem denunciou acompanha o andamento da propria denuncia, mas nao le a
-- evidencia copiada (que pode trazer dado de moderacao do denunciado, como
-- o contador de denuncias procedentes) nem a anotacao interna de quem julgou.
REVOKE SELECT ON public.reports FROM authenticated;
--> statement-breakpoint
GRANT SELECT (id, target_type, space_id, target_user_id, message_id, review_id,
              booking_id, reporter_id, reason, details, status, created_at, resolved_at)
  ON public.reports TO authenticated;
--> statement-breakpoint

-- Tabelas sem RLS ligada (criadas depois da 0001, que ligou em todas as que
-- existiam). Sem grant elas ja eram inalcancaveis pelo navegador; com RLS
-- ligada e nenhuma policy, continuam assim mesmo que alguem conceda um grant
-- por engano no futuro. O servidor e dono das tabelas e nao e afetado.
ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.booking_deposits ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.space_quality_assessments ENABLE ROW LEVEL SECURITY;
