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
-- Este arquivo tem SO as migracoes 25 em diante. Ele supoe que as
-- anteriores ja foram aplicadas: se o banco estiver mais atrasado, ele para
-- logo no comeco, sem mudar nada. Nesse caso (ou num projeto novo), use
-- supabase/setup.sql, que aplica tudo o que falta.
--
-- Ao terminar, a saida mostra quantas migracoes foram aplicadas agora e
-- quantas ja estavam no banco.
--
-- Gerado por scripts/build-supabase-setup.ts a partir de 13 migracoes
-- testadas contra um Postgres real. Nao edite a mao: altere src/db/schema/,
-- gere a migracao e rode este script de novo.
-- ============================================================================

-- O PostGIS do Supabase e instalado no schema "extensions", nao em "public".
-- Sem isto, o tipo geometry(Point,4326) e o cast ::geography nao sao
-- encontrados e a criacao das tabelas de espacos falha.
SET search_path = public, extensions;

-- Este arquivo continua de onde a migracao 24 parou. Banco mais
-- atrasado que isso: para aqui, antes de mudar qualquer coisa.
DO $mp_pre$
BEGIN
  IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN
    RAISE EXCEPTION 'Este banco ainda não tem o schema do MyPlace. Nada foi alterado: rode o supabase/setup.sql completo.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = 'dc24726c525e93d0ec621804ef70990161da8bf617c47ad9c92d4641a4ffee60'
  ) THEN
    RAISE EXCEPTION 'Este banco ainda não tem a migração 24 (0024_rotulos_com_acento). Nada foi alterado: rode o supabase/setup.sql completo, que aplica tudo o que falta.';
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
-- Migracao 25: 0025_chemical_marrow  (43 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_25$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = 'd36311c02b67aecf12887584441dc31e6a544f1440d27d8e3114151f13d3c7cf'
  ) THEN
    RAISE NOTICE 'Migracao 25 (0025_chemical_marrow) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_25_0$CREATE TYPE "public"."availability_block_reason" AS ENUM('manutencao', 'uso_proprio', 'viagem', 'outro');$mp_25_0$;

    EXECUTE $mp_25_1$CREATE TYPE "public"."listing_suggestion_status" AS ENUM('ready', 'partially_applied', 'applied', 'dismissed', 'failed');$mp_25_1$;

    EXECUTE $mp_25_2$CREATE TYPE "public"."saved_search_status" AS ENUM('active', 'paused');$mp_25_2$;

    EXECUTE $mp_25_3$CREATE TYPE "public"."waitlist_status" AS ENUM('waiting', 'notified', 'left', 'closed');$mp_25_3$;

    EXECUTE $mp_25_4$ALTER TYPE "public"."notification_category" ADD VALUE 'alertas';$mp_25_4$;

    EXECUTE $mp_25_5$ALTER TYPE "public"."notification_type" ADD VALUE 'waitlist_available';$mp_25_5$;

    EXECUTE $mp_25_6$ALTER TYPE "public"."notification_type" ADD VALUE 'saved_search_match';$mp_25_6$;

    EXECUTE $mp_25_7$ALTER TYPE "public"."notification_type" ADD VALUE 'monthly_report';$mp_25_7$;

    EXECUTE $mp_25_8$CREATE TABLE "ai_usage_counters" (
	"day" date NOT NULL,
	"feature" text NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_usage_counters_day_feature_pk" PRIMARY KEY("day","feature"),
	CONSTRAINT "ai_usage_counters_calls_non_negative" CHECK ("ai_usage_counters"."calls" >= 0)
);$mp_25_8$;

    EXECUTE $mp_25_9$CREATE TABLE "listing_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"status" "listing_suggestion_status" NOT NULL,
	"model" text,
	"input_snapshot" jsonb NOT NULL,
	"suggestion" jsonb,
	"removed_claims" jsonb,
	"applied_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);$mp_25_9$;

    EXECUTE $mp_25_10$CREATE TABLE "saved_search_matches" (
	"saved_search_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"matched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone,
	CONSTRAINT "saved_search_matches_saved_search_id_space_id_pk" PRIMARY KEY("saved_search_id","space_id")
);$mp_25_10$;

    EXECUTE $mp_25_11$CREATE TABLE "saved_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"criteria" jsonb NOT NULL,
	"status" "saved_search_status" DEFAULT 'active' NOT NULL,
	"last_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_searches_label_length" CHECK (char_length("saved_searches"."label") BETWEEN 1 AND 160),
	CONSTRAINT "saved_searches_criteria_object" CHECK (jsonb_typeof("saved_searches"."criteria") = 'object')
);$mp_25_11$;

    EXECUTE $mp_25_12$CREATE TABLE "space_availability_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"reason" "availability_block_reason" NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "space_availability_blocks_dates_ordered" CHECK ("space_availability_blocks"."ends_on" >= "space_availability_blocks"."starts_on"),
	CONSTRAINT "space_availability_blocks_max_length" CHECK ("space_availability_blocks"."ends_on" - "space_availability_blocks"."starts_on" <= 366),
	CONSTRAINT "space_availability_blocks_note_length" CHECK ("space_availability_blocks"."note" IS NULL OR char_length("space_availability_blocks"."note") <= 200)
);$mp_25_12$;

    EXECUTE $mp_25_13$CREATE TABLE "space_daily_stats" (
	"space_id" uuid NOT NULL,
	"day" date NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "space_daily_stats_space_id_day_pk" PRIMARY KEY("space_id","day"),
	CONSTRAINT "space_daily_stats_non_negative" CHECK ("space_daily_stats"."views" >= 0 AND "space_daily_stats"."shares" >= 0)
);$mp_25_13$;

    EXECUTE $mp_25_14$CREATE TABLE "space_price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"old_price_cents" integer NOT NULL,
	"new_price_cents" integer NOT NULL,
	"changed_by" uuid,
	"space_status" "space_status" NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_price_history_prices_positive" CHECK ("space_price_history"."old_price_cents" > 0 AND "space_price_history"."new_price_cents" > 0),
	CONSTRAINT "space_price_history_real_change" CHECK ("space_price_history"."old_price_cents" <> "space_price_history"."new_price_cents")
);$mp_25_14$;

    EXECUTE $mp_25_15$CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"status" "waitlist_status" DEFAULT 'waiting' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	CONSTRAINT "waitlist_entries_status_dates" CHECK (("waitlist_entries"."status" = 'left') = ("waitlist_entries"."left_at" IS NOT NULL)
          AND ("waitlist_entries"."status" = 'notified') = ("waitlist_entries"."notified_at" IS NOT NULL)
          AND ("waitlist_entries"."status" = 'closed') = ("waitlist_entries"."closed_at" IS NOT NULL))
);$mp_25_15$;

    EXECUTE $mp_25_16$ALTER TABLE "favorites" ADD COLUMN "price_alert" boolean DEFAULT true NOT NULL;$mp_25_16$;

    EXECUTE $mp_25_17$ALTER TABLE "favorites" ADD COLUMN "price_alert_baseline_cents" integer;$mp_25_17$;

    EXECUTE $mp_25_18$ALTER TABLE "favorites" ADD COLUMN "price_alert_notified_at" timestamp with time zone;$mp_25_18$;

    EXECUTE $mp_25_19$ALTER TABLE "listing_suggestions" ADD CONSTRAINT "listing_suggestions_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;$mp_25_19$;

    EXECUTE $mp_25_20$ALTER TABLE "listing_suggestions" ADD CONSTRAINT "listing_suggestions_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;$mp_25_20$;

    EXECUTE $mp_25_21$ALTER TABLE "saved_search_matches" ADD CONSTRAINT "saved_search_matches_saved_search_id_saved_searches_id_fk" FOREIGN KEY ("saved_search_id") REFERENCES "public"."saved_searches"("id") ON DELETE cascade ON UPDATE no action;$mp_25_21$;

    EXECUTE $mp_25_22$ALTER TABLE "saved_search_matches" ADD CONSTRAINT "saved_search_matches_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;$mp_25_22$;

    EXECUTE $mp_25_23$ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;$mp_25_23$;

    EXECUTE $mp_25_24$ALTER TABLE "space_availability_blocks" ADD CONSTRAINT "space_availability_blocks_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;$mp_25_24$;

    EXECUTE $mp_25_25$ALTER TABLE "space_availability_blocks" ADD CONSTRAINT "space_availability_blocks_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;$mp_25_25$;

    EXECUTE $mp_25_26$ALTER TABLE "space_daily_stats" ADD CONSTRAINT "space_daily_stats_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;$mp_25_26$;

    EXECUTE $mp_25_27$ALTER TABLE "space_price_history" ADD CONSTRAINT "space_price_history_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;$mp_25_27$;

    EXECUTE $mp_25_28$ALTER TABLE "space_price_history" ADD CONSTRAINT "space_price_history_changed_by_profiles_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;$mp_25_28$;

    EXECUTE $mp_25_29$ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;$mp_25_29$;

    EXECUTE $mp_25_30$ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;$mp_25_30$;

    EXECUTE $mp_25_31$CREATE INDEX "listing_suggestions_owner_idx" ON "listing_suggestions" USING btree ("owner_id","created_at");$mp_25_31$;

    EXECUTE $mp_25_32$CREATE INDEX "listing_suggestions_space_idx" ON "listing_suggestions" USING btree ("space_id","created_at");$mp_25_32$;

    EXECUTE $mp_25_33$CREATE INDEX "saved_search_matches_pending_idx" ON "saved_search_matches" USING btree ("saved_search_id","notified_at");$mp_25_33$;

    EXECUTE $mp_25_34$CREATE INDEX "saved_search_matches_space_idx" ON "saved_search_matches" USING btree ("space_id");$mp_25_34$;

    EXECUTE $mp_25_35$CREATE INDEX "saved_searches_user_idx" ON "saved_searches" USING btree ("user_id","created_at");$mp_25_35$;

    EXECUTE $mp_25_36$CREATE INDEX "saved_searches_status_idx" ON "saved_searches" USING btree ("status");$mp_25_36$;

    EXECUTE $mp_25_37$CREATE INDEX "space_availability_blocks_space_idx" ON "space_availability_blocks" USING btree ("space_id","starts_on");$mp_25_37$;

    EXECUTE $mp_25_38$CREATE INDEX "space_price_history_space_idx" ON "space_price_history" USING btree ("space_id","changed_at");$mp_25_38$;

    EXECUTE $mp_25_39$CREATE UNIQUE INDEX "waitlist_entries_one_waiting_per_user_space" ON "waitlist_entries" USING btree ("user_id","space_id") WHERE status = 'waiting';$mp_25_39$;

    EXECUTE $mp_25_40$CREATE INDEX "waitlist_entries_space_status_idx" ON "waitlist_entries" USING btree ("space_id","status");$mp_25_40$;

    EXECUTE $mp_25_41$CREATE INDEX "waitlist_entries_user_joined_idx" ON "waitlist_entries" USING btree ("user_id","joined_at");$mp_25_41$;

    EXECUTE $mp_25_42$ALTER TABLE "favorites" ADD CONSTRAINT "favorites_price_alert_baseline_positive" CHECK ("favorites"."price_alert_baseline_cents" IS NULL OR "favorites"."price_alert_baseline_cents" > 0);$mp_25_42$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('d36311c02b67aecf12887584441dc31e6a544f1440d27d8e3114151f13d3c7cf', 1790736611137);

    RAISE NOTICE 'Migracao 25 (0025_chemical_marrow) aplicada.';
  END IF;
END
$mp_bloco_25$;


-- ----------------------------------------------------------------------------
-- Migracao 26: 0026_gatilhos_descoberta  (30 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_26$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '3cd55828946dd292e778f592516b46129305aa4dcd21752034fff55fc4e49d09'
  ) THEN
    RAISE NOTICE 'Migracao 26 (0026_gatilhos_descoberta) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_26_0$-- ===========================================================================
-- Fase 23 — gatilhos, travas e permissões das funcionalidades de descoberta,
-- disponibilidade, acompanhamento de preço e desempenho.
--
-- As tabelas em si vêm da 0025 (gerada pelo Drizzle). Aqui fica o que o
-- Drizzle não expressa: triggers, travas de concorrência, RLS, dados
-- existentes que precisam ser corrigidos e os valores iniciais de
-- configuração.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. Ocupação real do espaço
--
-- Achado da auditoria desta fase: o status `rented` existia no schema, e a
-- aplicação já o tratava (aba "Alugados", edição restrita, "Alugado no
-- momento" nos favoritos), mas nada o aplicava. Um espaço com aluguel ativo
-- continuava `published`: aparecia na busca como disponível, aceitava
-- solicitações que o índice `bookings_one_active_per_space` impediria de
-- aceitar. Era disponibilidade falsa.
--
-- Agora o banco mantém o status em dia sozinho, a partir da própria reserva:
-- qualquer caminho que mude o status da reserva (aceite, pagamento, webhook,
-- cancelamento, encerramento) leva o anúncio junto.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.booking_occupies(s public.booking_status)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT s IN ('approved', 'awaiting_payment', 'active', 'past_due')
$$;$mp_26_0$;

    EXECUTE $mp_26_1$CREATE OR REPLACE FUNCTION public.sync_space_occupancy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ocupava boolean := TG_OP = 'UPDATE' AND public.booking_occupies(OLD.status);
  ocupa boolean := public.booking_occupies(NEW.status);
BEGIN
  IF ocupa AND NOT ocupava THEN
    -- Só publicado vira alugado. Pausado continua pausado (quem pausou
    -- decidiu tirar do ar); rascunho nunca chega aqui.
    UPDATE public.spaces SET status = 'rented'
     WHERE id = NEW.space_id AND status = 'published';

  ELSIF ocupava AND NOT ocupa THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.bookings b
       WHERE b.space_id = NEW.space_id
         AND b.id <> NEW.id
         AND public.booking_occupies(b.status)
    ) THEN
      BEGIN
        UPDATE public.spaces SET status = 'published'
         WHERE id = NEW.space_id AND status = 'rented';
      EXCEPTION WHEN check_violation THEN
        -- Não dá para voltar ao ar como está (ex.: ficou abaixo do mínimo de
        -- fotos). O aluguel encerra do mesmo jeito — travar o encerramento
        -- por causa do anúncio seria pior — e o anúncio fica pausado até o
        -- proprietário corrigir.
        UPDATE public.spaces SET status = 'paused'
         WHERE id = NEW.space_id AND status = 'rented';
      END;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;$mp_26_1$;

    EXECUTE $mp_26_2$CREATE TRIGGER bookings_sync_space_occupancy
  AFTER INSERT OR UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_space_occupancy();$mp_26_2$;

    EXECUTE $mp_26_3$-- O caminho inverso também: nenhum anúncio fica `published` enquanto tem
-- reserva vigente — retomar um anúncio pausado, ou republicar depois de
-- editar a descrição de um espaço alugado, volta para `rented`.
CREATE OR REPLACE FUNCTION public.guard_published_not_occupied()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'published' AND EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.space_id = NEW.id AND public.booking_occupies(b.status)
  ) THEN
    NEW.status := 'rented';
  END IF;
  RETURN NEW;
END;
$$;$mp_26_3$;

    EXECUTE $mp_26_4$CREATE TRIGGER spaces_published_not_occupied
  BEFORE INSERT OR UPDATE OF status ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.guard_published_not_occupied();$mp_26_4$;

    EXECUTE $mp_26_5$-- Dados existentes: publicado com reserva vigente passa a alugado.
UPDATE public.spaces s
   SET status = 'rented'
 WHERE s.status = 'published'
   AND s.deleted_at IS NULL
   AND EXISTS (
     SELECT 1 FROM public.bookings b
      WHERE b.space_id = s.id AND public.booking_occupies(b.status)
   );$mp_26_5$;

    EXECUTE $mp_26_6$-- Anúncio alugado também não pode ficar abaixo do mínimo de fotos: senão,
-- quando o aluguel acabasse, ele não conseguiria voltar ao ar.
CREATE OR REPLACE FUNCTION public.guard_delete_photo_of_published()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  minimo integer := public.min_photos_to_publish();
  situacao space_status;
  restantes integer;
BEGIN
  SELECT status INTO situacao FROM public.spaces WHERE id = OLD.space_id;

  -- Anuncio sendo apagado em cascata: nao ha o que proteger.
  IF situacao IS NULL OR situacao NOT IN ('published', 'rented') THEN
    RETURN OLD;
  END IF;

  SELECT count(*) - 1 INTO restantes
    FROM public.space_images WHERE space_id = OLD.space_id;

  IF restantes < minimo THEN
    RAISE EXCEPTION
      'anuncio publicado ficaria com % fotos, abaixo do minimo de %', restantes, minimo
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END;
$$;$mp_26_6$;

    EXECUTE $mp_26_7$-- ---------------------------------------------------------------------------
-- 2. Histórico de preço — registrado pelo banco, imutável
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_space_price_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ator uuid;
BEGIN
  -- Antes da primeira publicação o preço não era público, e o rascunho nasce
  -- com um valor provisório (o CHECK exige > 0 desde o INSERT). Registrar
  -- isso seria histórico artificial.
  IF OLD.published_at IS NULL THEN
    RETURN NULL;
  END IF;

  -- Quem mudou: o servidor informa na mesma transação do UPDATE
  -- (set_config('myplace.actor_id', ..., true)). Ausente = fora do app.
  BEGIN
    ator := NULLIF(current_setting('myplace.actor_id', true), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    ator := NULL;
  END;

  INSERT INTO public.space_price_history
    (space_id, old_price_cents, new_price_cents, changed_by, space_status)
  VALUES
    (NEW.id, OLD.price_monthly_cents, NEW.price_monthly_cents, ator, NEW.status);

  RETURN NULL;
END;
$$;$mp_26_7$;

    EXECUTE $mp_26_8$CREATE TRIGGER spaces_record_price_change
  AFTER UPDATE OF price_monthly_cents ON public.spaces
  FOR EACH ROW
  WHEN (OLD.price_monthly_cents IS DISTINCT FROM NEW.price_monthly_cents)
  EXECUTE FUNCTION public.record_space_price_change();$mp_26_8$;

    EXECUTE $mp_26_9$CREATE OR REPLACE FUNCTION public.guard_price_history_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- A única saída de uma linha do histórico é o próprio anúncio deixar de
  -- existir (DELETE em cascata): aí o pai já não está mais visível aqui.
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.spaces WHERE id = OLD.space_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'O historico de preco e imutavel (tentativa de %)', TG_OP;
END;
$$;$mp_26_9$;

    EXECUTE $mp_26_10$CREATE TRIGGER space_price_history_immutable
  BEFORE UPDATE OR DELETE ON public.space_price_history
  FOR EACH ROW EXECUTE FUNCTION public.guard_price_history_immutable();$mp_26_10$;

    EXECUTE $mp_26_11$-- ---------------------------------------------------------------------------
-- 3. Favoritos: preço de referência do aviso de queda
--
-- O navegador tem INSERT em `favorites` (policy `favorites_all_own`). Pela
-- API, os campos que o servidor calcula — preço no momento de favoritar e o
-- menor preço já conhecido — vêm do anúncio, nunca do que foi enviado: um
-- valor inventado faria o aviso mostrar um "preço anterior" que nunca existiu.
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER: pelo navegador, quem dispara é o papel `authenticated`,
-- que não lê `spaces` diretamente (RLS). A função só lê o preço do próprio
-- anúncio favoritado, com search_path fixo.
CREATE OR REPLACE FUNCTION public.guard_favorite_server_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  preco integer;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'UPDATE' AND (
         NEW.price_cents_at_favorite IS DISTINCT FROM OLD.price_cents_at_favorite
      OR NEW.price_alert_baseline_cents IS DISTINCT FROM OLD.price_alert_baseline_cents
      OR NEW.price_alert_notified_at IS DISTINCT FROM OLD.price_alert_notified_at
    ) THEN
      RAISE EXCEPTION 'Campos calculados pelo servidor nao podem ser alterados por esta via';
    END IF;
    IF TG_OP = 'INSERT' THEN
      SELECT price_monthly_cents INTO preco FROM public.spaces WHERE id = NEW.space_id;
      NEW.price_cents_at_favorite := preco;
      NEW.price_alert_baseline_cents := preco;
      NEW.price_alert_notified_at := NULL;
    END IF;
  ELSIF TG_OP = 'INSERT' AND NEW.price_alert_baseline_cents IS NULL THEN
    SELECT price_monthly_cents INTO NEW.price_alert_baseline_cents
      FROM public.spaces WHERE id = NEW.space_id;
  END IF;
  RETURN NEW;
END;
$$;$mp_26_11$;

    EXECUTE $mp_26_12$CREATE TRIGGER favorites_guard_server_fields
  BEFORE INSERT OR UPDATE ON public.favorites
  FOR EACH ROW EXECUTE FUNCTION public.guard_favorite_server_fields();$mp_26_12$;

    EXECUTE $mp_26_13$-- Favoritos existentes partem do preço de hoje: nenhum aviso retroativo.
UPDATE public.favorites f
   SET price_alert_baseline_cents = s.price_monthly_cents
  FROM public.spaces s
 WHERE s.id = f.space_id
   AND f.price_alert_baseline_cents IS NULL;$mp_26_13$;

    EXECUTE $mp_26_14$-- ---------------------------------------------------------------------------
-- 4. Lista de espera: quem pode entrar
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_waitlist_entry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  dono uuid;
  apagado timestamptz;
BEGIN
  SELECT owner_id, deleted_at INTO dono, apagado FROM public.spaces WHERE id = NEW.space_id;
  IF dono IS NULL OR apagado IS NOT NULL THEN
    RAISE EXCEPTION 'Espaco inexistente'
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'waitlist_entries_space_exists';
  END IF;
  IF dono = NEW.user_id THEN
    RAISE EXCEPTION 'O proprietario nao entra na lista de espera do proprio espaco'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'waitlist_entries_not_owner';
  END IF;
  -- Bloqueio entre as duas pessoas vale aqui também: quem bloqueou (ou foi
  -- bloqueado) não recebe aviso sobre o espaço da outra.
  IF public.is_blocked_between(NEW.user_id, dono) THEN
    RAISE EXCEPTION 'Ha bloqueio entre os usuarios'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'waitlist_entries_not_blocked';
  END IF;
  RETURN NEW;
END;
$$;$mp_26_14$;

    EXECUTE $mp_26_15$CREATE TRIGGER waitlist_entries_guard
  BEFORE INSERT ON public.waitlist_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_waitlist_entry();$mp_26_15$;

    EXECUTE $mp_26_16$-- ---------------------------------------------------------------------------
-- 5. Calendário: bloqueio de datas × reservas
--
-- As duas regras ("bloqueio não cobre reserva vigente" e "reserva não é
-- aceita por cima de bloqueio") vivem no banco e trancam a linha do espaço
-- (SELECT ... FOR UPDATE) antes de conferir: um bloqueio criado numa aba e
-- um aceite na outra, no mesmo instante, passam em fila — um dos dois vê o
-- outro e é recusado. Uma reserva sem data de término ocupa o espaço de
-- `start_date` em diante, para sempre (daterange sem limite superior).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_availability_block()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  periodo daterange := daterange(NEW.starts_on, NEW.ends_on, '[]');
BEGIN
  -- Desfazer um bloqueio nunca conflita com nada.
  IF NEW.cancelled_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

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

  IF EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.space_id = NEW.space_id
       AND public.booking_occupies(b.status)
       AND daterange(b.start_date, b.end_date, '[)') && periodo
  ) THEN
    RAISE EXCEPTION 'Ha uma reserva vigente nessas datas'
      USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'space_availability_blocks_no_booking';
  END IF;

  RETURN NEW;
END;
$$;$mp_26_16$;

    EXECUTE $mp_26_17$CREATE TRIGGER space_availability_blocks_guard
  BEFORE INSERT OR UPDATE ON public.space_availability_blocks
  FOR EACH ROW EXECUTE FUNCTION public.guard_availability_block();$mp_26_17$;

    EXECUTE $mp_26_18$CREATE OR REPLACE FUNCTION public.guard_booking_against_blocks()
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
  -- Já ocupava exatamente o mesmo período (ex.: active -> past_due): nada novo.
  IF TG_OP = 'UPDATE'
     AND public.booking_occupies(OLD.status)
     AND NEW.start_date = OLD.start_date
     AND NEW.end_date IS NOT DISTINCT FROM OLD.end_date THEN
    RETURN NEW;
  END IF;

  PERFORM 1 FROM public.spaces WHERE id = NEW.space_id FOR UPDATE;

  SELECT k.starts_on, k.ends_on INTO bloqueio
    FROM public.space_availability_blocks k
   WHERE k.space_id = NEW.space_id
     AND k.cancelled_at IS NULL
     AND daterange(k.starts_on, k.ends_on, '[]') && daterange(NEW.start_date, NEW.end_date, '[)')
   ORDER BY k.starts_on
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'O proprietario bloqueou o espaco de % a %',
      to_char(bloqueio.starts_on, 'DD/MM/YYYY'), to_char(bloqueio.ends_on, 'DD/MM/YYYY')
      USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'bookings_period_not_blocked';
  END IF;

  RETURN NEW;
END;
$$;$mp_26_18$;

    EXECUTE $mp_26_19$CREATE TRIGGER bookings_guard_blocked_period
  BEFORE INSERT OR UPDATE OF status, start_date, end_date ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_against_blocks();$mp_26_19$;

    EXECUTE $mp_26_20$-- ---------------------------------------------------------------------------
-- 6. Nenhuma tabela nova é alcançável pelo navegador
--
-- RLS ligada e nenhuma policy, e sem privilégio para os papéis da API: o
-- Supabase concede privilégios padrão em tabelas novas do schema public, e
-- a RLS sozinha já barraria, mas as duas travas juntas não dependem uma da
-- outra. O servidor (dono das tabelas) não é afetado.
-- ---------------------------------------------------------------------------

ALTER TABLE public.space_price_history ENABLE ROW LEVEL SECURITY;$mp_26_20$;

    EXECUTE $mp_26_21$ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;$mp_26_21$;

    EXECUTE $mp_26_22$ALTER TABLE public.space_availability_blocks ENABLE ROW LEVEL SECURITY;$mp_26_22$;

    EXECUTE $mp_26_23$ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;$mp_26_23$;

    EXECUTE $mp_26_24$ALTER TABLE public.saved_search_matches ENABLE ROW LEVEL SECURITY;$mp_26_24$;

    EXECUTE $mp_26_25$ALTER TABLE public.listing_suggestions ENABLE ROW LEVEL SECURITY;$mp_26_25$;

    EXECUTE $mp_26_26$ALTER TABLE public.space_daily_stats ENABLE ROW LEVEL SECURITY;$mp_26_26$;

    EXECUTE $mp_26_27$ALTER TABLE public.ai_usage_counters ENABLE ROW LEVEL SECURITY;$mp_26_27$;

    EXECUTE $mp_26_28$DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'space_price_history', 'waitlist_entries', 'space_availability_blocks',
    'saved_searches', 'saved_search_matches', 'listing_suggestions',
    'space_daily_stats', 'ai_usage_counters'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END;
$$;$mp_26_28$;

    EXECUTE $mp_26_29$-- ---------------------------------------------------------------------------
-- 7. Configuração inicial (mudar é um UPDATE, sem deploy)
-- ---------------------------------------------------------------------------

INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('alerts.saved_search_max_free', '2'::jsonb,
   'Alertas de busca ATIVOS por conta sem Premium.', false),
  ('alerts.saved_search_max_premium', '20'::jsonb,
   'Alertas de busca ATIVOS por conta Premium.', false),
  ('alerts.price_drop_min_bps', '100'::jsonb,
   'Queda minima, em pontos-base sobre o menor preco ja avisado, para gerar aviso de queda (100 = 1%).', false),
  ('alerts.price_drop_cooldown_hours', '24'::jsonb,
   'Janela minima entre dois avisos de queda de preco do mesmo espaco para a mesma pessoa.', false),
  ('analytics.free_history_days', '30'::jsonb,
   'Dias de historico do painel de desempenho para contas sem Premium.', false),
  ('ai.search_daily_limit', '500'::jsonb,
   'Teto diario de interpretacoes de busca por IA, somando todas as pessoas.', false),
  ('ai.listing_daily_limit_per_owner', '5'::jsonb,
   'Pedidos de melhoria de anuncio por IA, por proprietario, por dia.', false),
  ('ai.listing_space_cooldown_minutes', '10'::jsonb,
   'Intervalo minimo entre dois pedidos de melhoria para o mesmo anuncio.', false),
  ('ai.listing_daily_limit', '300'::jsonb,
   'Teto diario de pedidos de melhoria de anuncio, somando todas as pessoas.', false),
  ('premium.price_monthly_cents', '7990'::jsonb,
   'Preco do Premium mensal, em centavos. A assinatura paga ainda nao existe.', true),
  ('premium.price_yearly_cents', '75905'::jsonb,
   'Preco do Premium anual, em centavos. A assinatura paga ainda nao existe.', true)
ON CONFLICT (key) DO NOTHING;$mp_26_29$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('3cd55828946dd292e778f592516b46129305aa4dcd21752034fff55fc4e49d09', 1790736629418);

    RAISE NOTICE 'Migracao 26 (0026_gatilhos_descoberta) aplicada.';
  END IF;
END
$mp_bloco_26$;


-- ----------------------------------------------------------------------------
-- Migracao 27: 0027_certain_bloodstorm  (2 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_27$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '86644415bb4e9d81c4db191a64fb01570cdd9fd21a166854cccf3dbeb38f1b53'
  ) THEN
    RAISE NOTICE 'Migracao 27 (0027_certain_bloodstorm) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_27_0$ALTER TABLE "saved_searches" ADD COLUMN "criteria_key" text NOT NULL;$mp_27_0$;

    EXECUTE $mp_27_1$CREATE UNIQUE INDEX "saved_searches_user_criteria_key" ON "saved_searches" USING btree ("user_id","criteria_key");$mp_27_1$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('86644415bb4e9d81c4db191a64fb01570cdd9fd21a166854cccf3dbeb38f1b53', 1790740678115);

    RAISE NOTICE 'Migracao 27 (0027_certain_bloodstorm) aplicada.';
  END IF;
END
$mp_bloco_27$;


-- ----------------------------------------------------------------------------
-- Migracao 28: 0028_limite_alertas  (4 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_28$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '0335e942c91ec021aa5d556925d4257f4b3b4cba996e7000bdb2b6f249a637e7'
  ) THEN
    RAISE NOTICE 'Migracao 28 (0028_limite_alertas) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_28_0$-- Fase 23 — limite de alertas ativos por pessoa, garantido pelo banco.
--
-- O código confere antes (para dar uma mensagem clara), mas é aqui que a
-- regra vale de verdade: duas abas criando alerta ao mesmo tempo, ou uma
-- chamada direta à ação, não passam do limite. A linha do perfil é travada
-- (FOR UPDATE) durante a conta, então dois inserts simultâneos da mesma
-- pessoa entram em fila e o segundo já enxerga o primeiro.
--
-- O limite vem de platform_settings (plano gratuito x Premium ativo), o
-- mesmo lugar de onde o app lê — mudar o número não exige deploy.

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

  SELECT EXISTS (
    SELECT 1 FROM premium_memberships pm WHERE pm.user_id = NEW.user_id AND pm.status = 'active'
  ) INTO v_premium;

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
$$;$mp_28_0$;

    EXECUTE $mp_28_1$DROP TRIGGER IF EXISTS saved_searches_active_limit ON public.saved_searches;$mp_28_1$;

    EXECUTE $mp_28_2$CREATE TRIGGER saved_searches_active_limit
  BEFORE INSERT OR UPDATE OF status ON public.saved_searches
  FOR EACH ROW EXECUTE FUNCTION public.guard_saved_search_limit();$mp_28_2$;

    EXECUTE $mp_28_3$-- Intervalo mínimo entre dois avisos do mesmo alerta (horas). O que chegar
-- nesse meio-tempo vem agrupado no aviso seguinte ("Encontramos 4 novos
-- espaços…") ou no resumo diário do cron.
INSERT INTO public.platform_settings (key, value, description, is_public)
VALUES
  ('alerts.digest_hours_free', '24'::jsonb, 'Intervalo mínimo entre avisos do mesmo alerta, plano gratuito (horas).', false),
  ('alerts.digest_hours_premium', '1'::jsonb, 'Intervalo mínimo entre avisos do mesmo alerta, Premium (horas).', false)
ON CONFLICT (key) DO NOTHING;$mp_28_3$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('0335e942c91ec021aa5d556925d4257f4b3b4cba996e7000bdb2b6f249a637e7', 1790740684524);

    RAISE NOTICE 'Migracao 28 (0028_limite_alertas) aplicada.';
  END IF;
END
$mp_bloco_28$;


-- ----------------------------------------------------------------------------
-- Migracao 29: 0029_inicio_contagem_visualizacoes  (1 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_29$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '41e2a5411b6b463774afb15ffec097cccd01aae94664f824db093023a628869f'
  ) THEN
    RAISE NOTICE 'Migracao 29 (0029_inicio_contagem_visualizacoes) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_29_0$-- Fase 23 — desde quando o app conta visualizações de anúncio.
--
-- O painel de desempenho não pode mostrar "0 visualizações" num período em
-- que a contagem nem existia: antes desta data, a tela mostra "—" e diz a
-- partir de quando os números valem. É gravado uma vez (ON CONFLICT DO
-- NOTHING): rodar de novo não empurra a data para frente.
INSERT INTO public.platform_settings (key, value, description, is_public)
VALUES (
  'analytics.views_counting_since',
  to_jsonb(to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')),
  'Primeiro dia em que visualizações de anúncio passaram a ser contadas.',
  false
)
ON CONFLICT (key) DO NOTHING;$mp_29_0$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('41e2a5411b6b463774afb15ffec097cccd01aae94664f824db093023a628869f', 1790777551398);

    RAISE NOTICE 'Migracao 29 (0029_inicio_contagem_visualizacoes) aplicada.';
  END IF;
END
$mp_bloco_29$;


-- ----------------------------------------------------------------------------
-- Migracao 30: 0030_datas_invertidas  (2 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_30$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = 'ca2f97e555d8231f3c3455c45c76b1379188319a62419e4cabf059f3ecc38e25'
  ) THEN
    RAISE NOTICE 'Migracao 30 (0030_datas_invertidas) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_30_0$-- Fase 23 — datas invertidas recusadas pela regra certa.
--
-- Achado da verificação do schema: as triggers de calendário montam o
-- intervalo de datas (daterange) antes de qualquer outra conferência. Com a
-- data final antes da inicial, o próprio daterange estourava ("range lower
-- bound must be less than or equal to range upper bound") e a recusa saía
-- com essa mensagem crua, sem o nome da regra. As triggers rodam antes dos
-- CHECKs; agora elas deixam passar o que está invertido e quem recusa é o
-- CHECK de sempre (`space_availability_blocks_dates_ordered`,
-- `bookings_dates_ordered`), com o nome dele no erro. Nada que era aceito
-- passa a ser aceito: só muda QUEM recusa.

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

  IF EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.space_id = NEW.space_id
       AND public.booking_occupies(b.status)
       AND daterange(b.start_date, b.end_date, '[)') && periodo
  ) THEN
    RAISE EXCEPTION 'Ha uma reserva vigente nessas datas'
      USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'space_availability_blocks_no_booking';
  END IF;

  RETURN NEW;
END;
$$;$mp_30_0$;

    EXECUTE $mp_30_1$CREATE OR REPLACE FUNCTION public.guard_booking_against_blocks()
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
  -- Datas invertidas: o CHECK bookings_dates_ordered recusa.
  IF NEW.end_date IS NOT NULL AND NEW.end_date <= NEW.start_date THEN
    RETURN NEW;
  END IF;
  -- Já ocupava exatamente o mesmo período (ex.: active -> past_due): nada novo.
  IF TG_OP = 'UPDATE'
     AND public.booking_occupies(OLD.status)
     AND NEW.start_date = OLD.start_date
     AND NEW.end_date IS NOT DISTINCT FROM OLD.end_date THEN
    RETURN NEW;
  END IF;

  PERFORM 1 FROM public.spaces WHERE id = NEW.space_id FOR UPDATE;

  SELECT k.starts_on, k.ends_on INTO bloqueio
    FROM public.space_availability_blocks k
   WHERE k.space_id = NEW.space_id
     AND k.cancelled_at IS NULL
     AND daterange(k.starts_on, k.ends_on, '[]') && daterange(NEW.start_date, NEW.end_date, '[)')
   ORDER BY k.starts_on
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'O proprietario bloqueou o espaco de % a %',
      to_char(bloqueio.starts_on, 'DD/MM/YYYY'), to_char(bloqueio.ends_on, 'DD/MM/YYYY')
      USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'bookings_period_not_blocked';
  END IF;

  RETURN NEW;
END;
$$;$mp_30_1$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('ca2f97e555d8231f3c3455c45c76b1379188319a62419e4cabf059f3ecc38e25', 1790821127802);

    RAISE NOTICE 'Migracao 30 (0030_datas_invertidas) aplicada.';
  END IF;
END
$mp_bloco_30$;


-- ----------------------------------------------------------------------------
-- Migracao 31: 0031_third_fenris  (67 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_31$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = 'ab85c1164bc709fa9ee0b55f66962496fadbe454274df5c3e3f858d5848ea062'
  ) THEN
    RAISE NOTICE 'Migracao 31 (0031_third_fenris) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_31_0$CREATE TYPE "public"."booking_end_reason" AS ENUM('completed', 'cancelled_by_renter', 'cancelled_by_owner', 'payment_not_received', 'hold_expired');$mp_31_0$;

    EXECUTE $mp_31_1$CREATE TYPE "public"."operating_hours_mode" AS ENUM('always', 'daily');$mp_31_1$;

    EXECUTE $mp_31_2$CREATE TYPE "public"."rental_kind" AS ENUM('continuous', 'temporary');$mp_31_2$;

    EXECUTE $mp_31_3$CREATE TYPE "public"."rental_time_unit" AS ENUM('hour', 'day', 'week');$mp_31_3$;

    EXECUTE $mp_31_4$CREATE TYPE "public"."temporary_pricing_mode" AS ENUM('per_period', 'packages');$mp_31_4$;

    EXECUTE $mp_31_5$ALTER TYPE "public"."notification_type" ADD VALUE 'rental_ending_soon';$mp_31_5$;

    EXECUTE $mp_31_6$ALTER TYPE "public"."notification_type" ADD VALUE 'payment_refunded';$mp_31_6$;

    EXECUTE $mp_31_7$ALTER TYPE "public"."space_type" ADD VALUE 'estacionamento';$mp_31_7$;

    EXECUTE $mp_31_8$ALTER TYPE "public"."space_type" ADD VALUE 'espaco_eventos';$mp_31_8$;

    EXECUTE $mp_31_9$ALTER TYPE "public"."space_type" ADD VALUE 'area_lazer';$mp_31_9$;

    EXECUTE $mp_31_10$ALTER TYPE "public"."space_type" ADD VALUE 'oficina';$mp_31_10$;

    EXECUTE $mp_31_11$CREATE TABLE "space_unit_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"allows_continuous" boolean DEFAULT true NOT NULL,
	"allows_temporary" boolean DEFAULT false NOT NULL,
	"monthly_price_cents" integer,
	"temp_pricing_mode" "temporary_pricing_mode",
	"temp_unit" "rental_time_unit",
	"temp_price_cents" integer,
	"temp_max_units" integer,
	"temp_allow_fraction" boolean DEFAULT false NOT NULL,
	"temp_packages" jsonb,
	"renewal_allowed" boolean DEFAULT true NOT NULL,
	"hours_mode" "operating_hours_mode" DEFAULT 'always' NOT NULL,
	"opens_at" time,
	"closes_at" time,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_unit_groups_space_id_id_key" UNIQUE("space_id","id"),
	CONSTRAINT "space_unit_groups_name_length" CHECK (char_length(trim("space_unit_groups"."name")) BETWEEN 1 AND 60),
	CONSTRAINT "space_unit_groups_some_mode" CHECK ("space_unit_groups"."allows_continuous" OR "space_unit_groups"."allows_temporary"),
	CONSTRAINT "space_unit_groups_continuous_price" CHECK (NOT "space_unit_groups"."allows_continuous" OR ("space_unit_groups"."monthly_price_cents" IS NOT NULL AND "space_unit_groups"."monthly_price_cents" BETWEEN 1 AND 100000000)),
	CONSTRAINT "space_unit_groups_temporary_rule" CHECK (NOT "space_unit_groups"."allows_temporary" OR (
            "space_unit_groups"."temp_pricing_mode" IS NOT NULL AND "space_unit_groups"."temp_unit" IS NOT NULL AND (
              ("space_unit_groups"."temp_pricing_mode" = 'per_period'
                AND "space_unit_groups"."temp_price_cents" BETWEEN 1 AND 100000000
                AND "space_unit_groups"."temp_max_units" BETWEEN 1 AND 1000)
              OR ("space_unit_groups"."temp_pricing_mode" = 'packages'
                AND jsonb_typeof("space_unit_groups"."temp_packages") = 'array'
                AND jsonb_array_length("space_unit_groups"."temp_packages") BETWEEN 1 AND 6)
            )
          )),
	CONSTRAINT "space_unit_groups_fraction_rule" CHECK (NOT "space_unit_groups"."temp_allow_fraction" OR ("space_unit_groups"."temp_pricing_mode" = 'per_period' AND "space_unit_groups"."temp_unit" IN ('day', 'week'))),
	CONSTRAINT "space_unit_groups_hours_temporary" CHECK ("space_unit_groups"."hours_mode" = 'always' OR NOT "space_unit_groups"."allows_temporary" OR "space_unit_groups"."temp_unit" = 'hour'),
	CONSTRAINT "space_unit_groups_hours" CHECK (("space_unit_groups"."hours_mode" = 'always' AND "space_unit_groups"."opens_at" IS NULL AND "space_unit_groups"."closes_at" IS NULL)
          OR ("space_unit_groups"."hours_mode" = 'daily' AND "space_unit_groups"."opens_at" IS NOT NULL AND "space_unit_groups"."closes_at" IS NOT NULL AND "space_unit_groups"."opens_at" < "space_unit_groups"."closes_at"))
);$mp_31_11$;

    EXECUTE $mp_31_12$CREATE TABLE "space_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"label" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_units_space_id_id_key" UNIQUE("space_id","id"),
	CONSTRAINT "space_units_group_id_id_key" UNIQUE("group_id","id"),
	CONSTRAINT "space_units_label_length" CHECK (char_length(trim("space_units"."label")) BETWEEN 1 AND 40)
);$mp_31_12$;

    EXECUTE $mp_31_13$ALTER TABLE "spaces" DROP CONSTRAINT "spaces_price_positive";$mp_31_13$;

    EXECUTE $mp_31_14$ALTER TABLE "spaces" DROP CONSTRAINT "spaces_price_sane";$mp_31_14$;

    EXECUTE $mp_31_15$DROP INDEX "bookings_one_active_per_space";$mp_31_15$;

    EXECUTE $mp_31_16$ALTER TABLE "spaces" ALTER COLUMN "price_monthly_cents" DROP NOT NULL;$mp_31_16$;

    EXECUTE $mp_31_17$ALTER TABLE "spaces" ADD COLUMN "temp_from_cents" integer;$mp_31_17$;

    EXECUTE $mp_31_18$ALTER TABLE "spaces" ADD COLUMN "temp_from_units" integer;$mp_31_18$;

    EXECUTE $mp_31_19$ALTER TABLE "spaces" ADD COLUMN "temp_from_unit" "rental_time_unit";$mp_31_19$;

    EXECUTE $mp_31_20$ALTER TABLE "bookings" ADD COLUMN "kind" "rental_kind" DEFAULT 'continuous' NOT NULL;$mp_31_20$;

    EXECUTE $mp_31_21$ALTER TABLE "bookings" ADD COLUMN "group_id" uuid;$mp_31_21$;

    EXECUTE $mp_31_22$ALTER TABLE "bookings" ADD COLUMN "unit_id" uuid;$mp_31_22$;

    EXECUTE $mp_31_23$ALTER TABLE "bookings" ADD COLUMN "starts_at" timestamp with time zone;$mp_31_23$;

    EXECUTE $mp_31_24$ALTER TABLE "bookings" ADD COLUMN "ends_at" timestamp with time zone;$mp_31_24$;

    EXECUTE $mp_31_25$ALTER TABLE "bookings" ADD COLUMN "occupied_until" timestamp with time zone;$mp_31_25$;

    EXECUTE $mp_31_26$ALTER TABLE "bookings" ADD COLUMN "duration_units" integer;$mp_31_26$;

    EXECUTE $mp_31_27$ALTER TABLE "bookings" ADD COLUMN "duration_unit" "rental_time_unit";$mp_31_27$;

    EXECUTE $mp_31_28$ALTER TABLE "bookings" ADD COLUMN "renewal_allowed" boolean DEFAULT false NOT NULL;$mp_31_28$;

    EXECUTE $mp_31_29$ALTER TABLE "bookings" ADD COLUMN "renewed_from_id" uuid;$mp_31_29$;

    EXECUTE $mp_31_30$ALTER TABLE "bookings" ADD COLUMN "hold_expires_at" timestamp with time zone;$mp_31_30$;

    EXECUTE $mp_31_31$ALTER TABLE "bookings" ADD COLUMN "payment_issue_started_at" timestamp with time zone;$mp_31_31$;

    EXECUTE $mp_31_32$ALTER TABLE "bookings" ADD COLUMN "payment_issue_deadline_at" timestamp with time zone;$mp_31_32$;

    EXECUTE $mp_31_33$ALTER TABLE "bookings" ADD COLUMN "end_reason" "booking_end_reason";$mp_31_33$;

    EXECUTE $mp_31_34$ALTER TABLE "bookings" ADD COLUMN "idempotency_key" text;$mp_31_34$;

    EXECUTE $mp_31_35$ALTER TABLE "payments" ADD COLUMN "pix_payload" text;$mp_31_35$;

    EXECUTE $mp_31_36$ALTER TABLE "payments" ADD COLUMN "pix_qr_image" text;$mp_31_36$;

    EXECUTE $mp_31_37$ALTER TABLE "payments" ADD COLUMN "pix_expires_at" timestamp with time zone;$mp_31_37$;

    EXECUTE $mp_31_38$ALTER TABLE "payments" ADD COLUMN "payer_started_at" timestamp with time zone;$mp_31_38$;

    EXECUTE $mp_31_39$ALTER TABLE "payments" ADD COLUMN "refund_requested_at" timestamp with time zone;$mp_31_39$;

    EXECUTE $mp_31_40$ALTER TABLE "payments" ADD COLUMN "refund_reason" text;$mp_31_40$;

    EXECUTE $mp_31_41$ALTER TABLE "payments" ADD COLUMN "delete_requested_at" timestamp with time zone;$mp_31_41$;

    EXECUTE $mp_31_42$ALTER TABLE "payments" ADD COLUMN "provider_deleted_at" timestamp with time zone;$mp_31_42$;

    EXECUTE $mp_31_43$ALTER TABLE "subscriptions" ADD COLUMN "provider_cancelled_at" timestamp with time zone;$mp_31_43$;

    EXECUTE $mp_31_44$ALTER TABLE "space_unit_groups" ADD CONSTRAINT "space_unit_groups_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;$mp_31_44$;

    EXECUTE $mp_31_45$ALTER TABLE "space_units" ADD CONSTRAINT "space_units_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;$mp_31_45$;

    EXECUTE $mp_31_46$ALTER TABLE "space_units" ADD CONSTRAINT "space_units_group_same_space_fk" FOREIGN KEY ("space_id","group_id") REFERENCES "public"."space_unit_groups"("space_id","id") ON DELETE cascade ON UPDATE no action;$mp_31_46$;

    EXECUTE $mp_31_47$CREATE INDEX "space_unit_groups_space_idx" ON "space_unit_groups" USING btree ("space_id");$mp_31_47$;

    EXECUTE $mp_31_48$CREATE UNIQUE INDEX "space_unit_groups_space_name_key" ON "space_unit_groups" USING btree ("space_id",lower("name"));$mp_31_48$;

    EXECUTE $mp_31_49$CREATE INDEX "space_units_group_idx" ON "space_units" USING btree ("group_id","position");$mp_31_49$;

    EXECUTE $mp_31_50$CREATE INDEX "space_units_space_idx" ON "space_units" USING btree ("space_id");$mp_31_50$;

    EXECUTE $mp_31_51$CREATE UNIQUE INDEX "space_units_space_label_key" ON "space_units" USING btree ("space_id","label");$mp_31_51$;

    EXECUTE $mp_31_52$ALTER TABLE "bookings" ADD CONSTRAINT "bookings_renewed_from_id_bookings_id_fk" FOREIGN KEY ("renewed_from_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;$mp_31_52$;

    EXECUTE $mp_31_53$ALTER TABLE "bookings" ADD CONSTRAINT "bookings_group_same_space_fk" FOREIGN KEY ("space_id","group_id") REFERENCES "public"."space_unit_groups"("space_id","id") ON DELETE no action ON UPDATE no action;$mp_31_53$;

    EXECUTE $mp_31_54$ALTER TABLE "bookings" ADD CONSTRAINT "bookings_unit_same_group_fk" FOREIGN KEY ("group_id","unit_id") REFERENCES "public"."space_units"("group_id","id") ON DELETE no action ON UPDATE no action;$mp_31_54$;

    EXECUTE $mp_31_55$CREATE INDEX "bookings_unit_status_idx" ON "bookings" USING btree ("unit_id","status");$mp_31_55$;

    EXECUTE $mp_31_56$CREATE INDEX "bookings_group_idx" ON "bookings" USING btree ("group_id");$mp_31_56$;

    EXECUTE $mp_31_57$CREATE INDEX "bookings_hold_expires_idx" ON "bookings" USING btree ("hold_expires_at") WHERE status = 'awaiting_payment';$mp_31_57$;

    EXECUTE $mp_31_58$CREATE INDEX "bookings_payment_deadline_idx" ON "bookings" USING btree ("payment_issue_deadline_at") WHERE status = 'past_due';$mp_31_58$;

    EXECUTE $mp_31_59$CREATE INDEX "bookings_temporary_ending_idx" ON "bookings" USING btree ("occupied_until") WHERE kind = 'temporary' AND status = 'active';$mp_31_59$;

    EXECUTE $mp_31_60$CREATE UNIQUE INDEX "bookings_renter_idempotency_key" ON "bookings" USING btree ("renter_id","idempotency_key") WHERE idempotency_key IS NOT NULL;$mp_31_60$;

    EXECUTE $mp_31_61$CREATE UNIQUE INDEX "bookings_one_live_renewal" ON "bookings" USING btree ("renewed_from_id") WHERE renewed_from_id IS NOT NULL AND status IN ('approved','awaiting_payment','active','past_due');$mp_31_61$;

    EXECUTE $mp_31_62$CREATE INDEX "payments_outbox_idx" ON "payments" USING btree ("updated_at") WHERE (refund_requested_at IS NOT NULL AND status NOT IN ('refunded','partially_refunded')) OR (delete_requested_at IS NOT NULL AND provider_deleted_at IS NULL);$mp_31_62$;

    EXECUTE $mp_31_63$CREATE INDEX "subscriptions_cancel_pending_idx" ON "subscriptions" USING btree ("cancelled_at") WHERE status = 'cancelled' AND provider_cancelled_at IS NULL;$mp_31_63$;

    EXECUTE $mp_31_64$ALTER TABLE "spaces" ADD CONSTRAINT "spaces_temp_summary_complete" CHECK (("spaces"."temp_from_cents" IS NULL AND "spaces"."temp_from_units" IS NULL AND "spaces"."temp_from_unit" IS NULL)
          OR ("spaces"."temp_from_cents" > 0 AND "spaces"."temp_from_units" > 0 AND "spaces"."temp_from_unit" IS NOT NULL));$mp_31_64$;

    EXECUTE $mp_31_65$ALTER TABLE "spaces" ADD CONSTRAINT "spaces_price_positive" CHECK ("spaces"."price_monthly_cents" IS NULL OR "spaces"."price_monthly_cents" > 0);$mp_31_65$;

    EXECUTE $mp_31_66$ALTER TABLE "spaces" ADD CONSTRAINT "spaces_price_sane" CHECK ("spaces"."price_monthly_cents" IS NULL OR "spaces"."price_monthly_cents" <= 100000000);$mp_31_66$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('ab85c1164bc709fa9ee0b55f66962496fadbe454274df5c3e3f858d5848ea062', 1790849029369);

    RAISE NOTICE 'Migracao 31 (0031_third_fenris) aplicada.';
  END IF;
END
$mp_bloco_31$;


-- ----------------------------------------------------------------------------
-- Migracao 32: 0032_aluguel_unidades  (51 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_32$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '507e172cc33e2c7833a47303de86d3382100df068bcd217ebb27861b385a03e2'
  ) THEN
    RAISE NOTICE 'Migracao 32 (0032_aluguel_unidades) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_32_0$-- ===========================================================================
-- Parte 12 — unidades, aluguel temporário e contínuo, prazos e pagamentos.
--
-- As tabelas e colunas vêm da 0031 (gerada pelo Drizzle). Aqui fica o que o
-- Drizzle não descreve, na ordem em que precisa acontecer:
--   1. extensão btree_gist (restrição de exclusão por unidade);
--   2. regras dos grupos: pacotes válidos, resumo de preço do anúncio;
--   3. ocupação do anúncio por unidade (substitui "um aluguel por espaço");
--   4. travas de publicação, desativação e exclusão de unidade;
--   5. preço, horário e forma da reserva conferidos pelo banco;
--   6. a função que encerra o que venceu (reserva não paga, temporário que
--      acabou, pagamento pendente sem pagamento);
--   7. preenchimento dos dados que já existiam;
--   8. só então, as restrições que dependem desse preenchimento;
--   9. RLS e configurações.
--
-- Nota: valores novos de enum EXISTENTE (space_type, notification_type) não
-- são usados como literal aqui — o migrador roda tudo numa transação só e o
-- Postgres não deixa usar um valor acrescentado na mesma transação. Os tipos
-- NOVOS (rental_kind, booking_end_reason...) podem: foram criados inteiros.
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;$mp_32_0$;

    EXECUTE $mp_32_1$-- ---------------------------------------------------------------------------
-- 2a. Pacotes de preço: em ordem, sem duração repetida, sem pacote mais
-- longo mais barato que um mais curto. Nunca duas regras para a mesma
-- duração, e nenhuma ambiguidade sobre qual pacote vale.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_unit_group_config()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  item jsonb;
  u numeric;
  p numeric;
  anterior_u numeric := 0;
  anterior_p numeric := 0;
  i integer := 0;
BEGIN
  NEW.name := trim(NEW.name);
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;

  IF NEW.allows_temporary AND NEW.temp_pricing_mode = 'packages' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(NEW.temp_packages) LOOP
      i := i + 1;
      IF jsonb_typeof(item) <> 'object'
         OR jsonb_typeof(item -> 'units') IS DISTINCT FROM 'number'
         OR jsonb_typeof(item -> 'priceCents') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'Pacote % sem duracao ou preco', i
          USING ERRCODE = 'check_violation', CONSTRAINT = 'space_unit_groups_packages_valid';
      END IF;
      u := (item ->> 'units')::numeric;
      p := (item ->> 'priceCents')::numeric;
      IF u <> trunc(u) OR p <> trunc(p) OR u < 1 OR u > 1000 OR p < 1 OR p > 100000000 THEN
        RAISE EXCEPTION 'Pacote % com duracao ou preco invalido', i
          USING ERRCODE = 'check_violation', CONSTRAINT = 'space_unit_groups_packages_valid';
      END IF;
      IF u <= anterior_u THEN
        RAISE EXCEPTION 'Pacotes fora de ordem ou com a mesma duracao'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'space_unit_groups_packages_ordered';
      END IF;
      IF p < anterior_p THEN
        RAISE EXCEPTION 'Pacote mais longo nao pode custar menos que um mais curto'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'space_unit_groups_packages_ordered';
      END IF;
      anterior_u := u;
      anterior_p := p;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;$mp_32_1$;

    EXECUTE $mp_32_2$CREATE TRIGGER space_unit_groups_guard
  BEFORE INSERT OR UPDATE ON public.space_unit_groups
  FOR EACH ROW EXECUTE FUNCTION public.guard_unit_group_config();$mp_32_2$;

    EXECUTE $mp_32_3$-- ---------------------------------------------------------------------------
-- 2b. Resumo de preço do anúncio, sempre derivado dos grupos com unidade
-- ativa: o menor preço mensal (contínuo) e a entrada mais barata do
-- temporário na menor unidade de tempo. Busca, cartões, mapa, histórico de
-- preço e avisos de favorito continuam lendo colunas do próprio anúncio.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.space_rental_summary(
  p_space uuid,
  OUT monthly_cents integer,
  OUT temp_cents integer,
  OUT temp_units integer,
  OUT temp_unit public.rental_time_unit
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    (SELECT min(g.monthly_price_cents)
       FROM public.space_unit_groups g
      WHERE g.space_id = p_space AND g.active AND g.allows_continuous
        AND EXISTS (SELECT 1 FROM public.space_units u WHERE u.group_id = g.id AND u.active)),
    t.cents, t.units, t.unit
  FROM (SELECT 1) AS um
  LEFT JOIN LATERAL (
    SELECT x.cents, x.units, x.unit
      FROM (
        SELECT CASE WHEN g.temp_pricing_mode = 'per_period' THEN g.temp_price_cents
                    ELSE (g.temp_packages -> 0 ->> 'priceCents')::integer END AS cents,
               CASE WHEN g.temp_pricing_mode = 'per_period' THEN 1
                    ELSE (g.temp_packages -> 0 ->> 'units')::integer END AS units,
               g.temp_unit AS unit
          FROM public.space_unit_groups g
         WHERE g.space_id = p_space AND g.active AND g.allows_temporary
           AND EXISTS (SELECT 1 FROM public.space_units u WHERE u.group_id = g.id AND u.active)
      ) AS x
     ORDER BY CASE x.unit WHEN 'hour' THEN 1 WHEN 'day' THEN 2 ELSE 3 END, x.cents, x.units
     LIMIT 1
  ) AS t ON true
$$;$mp_32_3$;

    EXECUTE $mp_32_4$CREATE OR REPLACE FUNCTION public.sync_space_rental_summary()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  alvo uuid := COALESCE(NEW.space_id, OLD.space_id);
  r record;
BEGIN
  SELECT * INTO r FROM public.space_rental_summary(alvo);

  UPDATE public.spaces
     SET price_monthly_cents = r.monthly_cents,
         temp_from_cents = r.temp_cents,
         temp_from_units = r.temp_units,
         temp_from_unit = r.temp_unit,
         updated_at = now()
   WHERE id = alvo
     AND (price_monthly_cents IS DISTINCT FROM r.monthly_cents
          OR temp_from_cents IS DISTINCT FROM r.temp_cents
          OR temp_from_units IS DISTINCT FROM r.temp_units
          OR temp_from_unit IS DISTINCT FROM r.temp_unit);

  RETURN NULL;
END;
$$;$mp_32_4$;

    EXECUTE $mp_32_5$CREATE TRIGGER space_unit_groups_sync_summary
  AFTER INSERT OR UPDATE OR DELETE ON public.space_unit_groups
  FOR EACH ROW EXECUTE FUNCTION public.sync_space_rental_summary();$mp_32_5$;

    EXECUTE $mp_32_6$CREATE TRIGGER space_units_sync_summary
  AFTER INSERT OR UPDATE OF active, group_id OR DELETE ON public.space_units
  FOR EACH ROW EXECUTE FUNCTION public.sync_space_rental_summary();$mp_32_6$;

    EXECUTE $mp_32_7$-- Quem tem grupos não grava preço direto no anúncio: o preço que aparece
-- é sempre o que vale na hora de reservar. Gravar outro valor é um bug, e
-- o banco recusa em vez de deixar a vitrine mentir.
CREATE OR REPLACE FUNCTION public.guard_space_rental_summary()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.space_unit_groups g WHERE g.space_id = NEW.id) THEN
    RETURN NEW;
  END IF;
  SELECT * INTO r FROM public.space_rental_summary(NEW.id);
  IF NEW.price_monthly_cents IS DISTINCT FROM r.monthly_cents
     OR NEW.temp_from_cents IS DISTINCT FROM r.temp_cents
     OR NEW.temp_from_units IS DISTINCT FROM r.temp_units
     OR NEW.temp_from_unit IS DISTINCT FROM r.temp_unit THEN
    RAISE EXCEPTION 'O preco do anuncio vem dos grupos de unidades'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'spaces_price_from_units';
  END IF;
  RETURN NEW;
END;
$$;$mp_32_7$;

    EXECUTE $mp_32_8$CREATE TRIGGER spaces_price_from_units
  BEFORE UPDATE OF price_monthly_cents, temp_from_cents, temp_from_units, temp_from_unit ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.guard_space_rental_summary();$mp_32_8$;

    EXECUTE $mp_32_9$-- Histórico de preço (Fase 23) só entre dois preços mensais reais: anúncio
-- que passou a alugar só por hora (preço mensal NULL) não vira "R$ 0".
CREATE OR REPLACE FUNCTION public.record_space_price_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ator uuid;
BEGIN
  IF OLD.published_at IS NULL THEN
    RETURN NULL;
  END IF;
  IF OLD.price_monthly_cents IS NULL OR NEW.price_monthly_cents IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    ator := NULLIF(current_setting('myplace.actor_id', true), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    ator := NULL;
  END;

  INSERT INTO public.space_price_history
    (space_id, old_price_cents, new_price_cents, changed_by, space_status)
  VALUES
    (NEW.id, OLD.price_monthly_cents, NEW.price_monthly_cents, ator, NEW.status);

  RETURN NULL;
END;
$$;$mp_32_9$;

    EXECUTE $mp_32_10$-- ---------------------------------------------------------------------------
-- 3. Ocupação do anúncio por UNIDADE.
--
-- O anúncio só vira `rented` quando TODAS as unidades ativas estão com
-- aluguel CONTÍNUO vigente — um estacionamento com 3 de 10 vagas mensalistas
-- continua no ar. Aluguel temporário nunca tira o anúncio do ar: dura horas,
-- e a disponibilidade de cada horário é calculada por unidade.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.space_fully_rented(p_space uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.space_units u
            JOIN public.space_unit_groups g ON g.id = u.group_id
           WHERE u.space_id = p_space AND u.active AND g.active
         )
     AND NOT EXISTS (
           SELECT 1 FROM public.space_units u
            JOIN public.space_unit_groups g ON g.id = u.group_id
           WHERE u.space_id = p_space AND u.active AND g.active
             AND NOT EXISTS (
               SELECT 1 FROM public.bookings b
                WHERE b.unit_id = u.id
                  AND b.kind = 'continuous'
                  AND public.booking_occupies(b.status)
             )
         )
$$;$mp_32_10$;

    EXECUTE $mp_32_11$CREATE OR REPLACE FUNCTION public.apply_space_occupancy(p_space uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.space_fully_rented(p_space) THEN
    UPDATE public.spaces SET status = 'rented'
     WHERE id = p_space AND status = 'published';
  ELSE
    BEGIN
      UPDATE public.spaces SET status = 'published'
       WHERE id = p_space AND status = 'rented';
    EXCEPTION WHEN check_violation THEN
      -- Não dá para voltar ao ar como está (ex.: ficou abaixo do mínimo de
      -- fotos): o aluguel encerra do mesmo jeito e o anúncio fica pausado
      -- até o proprietário corrigir (mesma regra da Fase 23).
      UPDATE public.spaces SET status = 'paused'
       WHERE id = p_space AND status = 'rented';
    END;
  END IF;
END;
$$;$mp_32_11$;

    EXECUTE $mp_32_12$CREATE OR REPLACE FUNCTION public.sync_space_occupancy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.kind <> 'continuous' THEN
    RETURN NULL;
  END IF;
  PERFORM public.apply_space_occupancy(NEW.space_id);
  RETURN NULL;
END;
$$;$mp_32_12$;

    EXECUTE $mp_32_13$DROP TRIGGER IF EXISTS bookings_sync_space_occupancy ON public.bookings;$mp_32_13$;

    EXECUTE $mp_32_14$CREATE TRIGGER bookings_sync_space_occupancy
  AFTER INSERT OR UPDATE OF status, unit_id ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_space_occupancy();$mp_32_14$;

    EXECUTE $mp_32_15$CREATE OR REPLACE FUNCTION public.guard_published_not_occupied()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'published' AND public.space_fully_rented(NEW.id) THEN
    NEW.status := 'rented';
  END IF;
  RETURN NEW;
END;
$$;$mp_32_15$;

    EXECUTE $mp_32_16$CREATE OR REPLACE FUNCTION public.sync_occupancy_from_units()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.apply_space_occupancy(COALESCE(NEW.space_id, OLD.space_id));
  RETURN NULL;
END;
$$;$mp_32_16$;

    EXECUTE $mp_32_17$CREATE TRIGGER space_units_sync_occupancy
  AFTER INSERT OR UPDATE OF active OR DELETE ON public.space_units
  FOR EACH ROW EXECUTE FUNCTION public.sync_occupancy_from_units();$mp_32_17$;

    EXECUTE $mp_32_18$CREATE TRIGGER space_unit_groups_sync_occupancy
  AFTER UPDATE OF active ON public.space_unit_groups
  FOR EACH ROW EXECUTE FUNCTION public.sync_occupancy_from_units();$mp_32_18$;

    EXECUTE $mp_32_19$-- ---------------------------------------------------------------------------
-- 4. Travas: anúncio no ar precisa de unidade para alugar, e unidade (ou
-- grupo) com aluguel em andamento ou futuro não pode ser desativada.
-- Unidade com histórico de reserva nem pode ser apagada (a chave
-- estrangeira da reserva impede) — só desativada.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.space_has_rentable_unit(p_space uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.space_units u
      JOIN public.space_unit_groups g ON g.id = u.group_id
     WHERE u.space_id = p_space AND u.active AND g.active
  )
$$;$mp_32_19$;

    EXECUTE $mp_32_20$CREATE OR REPLACE FUNCTION public.guard_publish_requires_units()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('published', 'rented')
     AND (TG_OP = 'INSERT' OR OLD.status NOT IN ('published', 'rented'))
     AND NOT public.space_has_rentable_unit(NEW.id) THEN
    RAISE EXCEPTION 'Anuncio sem unidade para alugar'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'spaces_published_requires_units';
  END IF;
  RETURN NEW;
END;
$$;$mp_32_20$;

    EXECUTE $mp_32_21$CREATE TRIGGER spaces_publish_requires_units
  BEFORE INSERT OR UPDATE OF status ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.guard_publish_requires_units();$mp_32_21$;

    EXECUTE $mp_32_22$CREATE OR REPLACE FUNCTION public.unit_has_live_rental(p_unit uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.unit_id = p_unit
       AND public.booking_occupies(b.status)
       AND (b.occupied_until IS NULL OR b.occupied_until > now())
       AND NOT (b.status = 'awaiting_payment' AND b.hold_expires_at IS NOT NULL AND b.hold_expires_at <= now())
  )
$$;$mp_32_22$;

    EXECUTE $mp_32_23$-- Sobra pelo menos uma unidade ativa (num grupo ativo) no anúncio no ar,
-- desconsiderando a unidade ou o grupo que está saindo.
CREATE OR REPLACE FUNCTION public.space_keeps_a_unit(p_space uuid, p_without_unit uuid, p_without_group uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.spaces s WHERE s.id = p_space AND s.status IN ('published', 'rented'))
      OR EXISTS (
           SELECT 1 FROM public.space_units u
             JOIN public.space_unit_groups g ON g.id = u.group_id
            WHERE u.space_id = p_space AND u.active AND g.active
              AND u.id IS DISTINCT FROM p_without_unit
              AND g.id IS DISTINCT FROM p_without_group
         )
$$;$mp_32_23$;

    EXECUTE $mp_32_24$CREATE OR REPLACE FUNCTION public.guard_unit_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.active AND NOT public.space_keeps_a_unit(OLD.space_id, OLD.id, NULL) THEN
      RAISE EXCEPTION 'Anuncio no ar precisa de pelo menos uma unidade'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'spaces_published_requires_units';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.active AND NOT NEW.active THEN
    IF public.unit_has_live_rental(NEW.id) THEN
      RAISE EXCEPTION 'Unidade com aluguel em andamento ou futuro'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'space_units_keep_live_rental';
    END IF;
    IF NOT public.space_keeps_a_unit(NEW.space_id, NEW.id, NULL) THEN
      RAISE EXCEPTION 'Anuncio no ar precisa de pelo menos uma unidade'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'spaces_published_requires_units';
    END IF;
  END IF;
  IF NEW.group_id <> OLD.group_id AND public.unit_has_live_rental(NEW.id) THEN
    RAISE EXCEPTION 'Unidade com aluguel em andamento ou futuro'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'space_units_keep_live_rental';
  END IF;
  RETURN NEW;
END;
$$;$mp_32_24$;

    EXECUTE $mp_32_25$CREATE TRIGGER space_units_guard_change
  BEFORE UPDATE OF active, group_id OR DELETE ON public.space_units
  FOR EACH ROW EXECUTE FUNCTION public.guard_unit_change();$mp_32_25$;

    EXECUTE $mp_32_26$CREATE OR REPLACE FUNCTION public.guard_group_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.active AND NOT public.space_keeps_a_unit(OLD.space_id, NULL, OLD.id) THEN
      RAISE EXCEPTION 'Anuncio no ar precisa de pelo menos uma unidade'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'spaces_published_requires_units';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.active AND NOT NEW.active THEN
    IF EXISTS (
      SELECT 1 FROM public.space_units u
       WHERE u.group_id = NEW.id AND u.active AND public.unit_has_live_rental(u.id)
    ) THEN
      RAISE EXCEPTION 'Grupo com aluguel em andamento ou futuro'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'space_units_keep_live_rental';
    END IF;
    IF NOT public.space_keeps_a_unit(NEW.space_id, NULL, NEW.id) THEN
      RAISE EXCEPTION 'Anuncio no ar precisa de pelo menos uma unidade'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'spaces_published_requires_units';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;$mp_32_26$;

    EXECUTE $mp_32_27$CREATE TRIGGER space_unit_groups_guard_change
  BEFORE UPDATE OF active OR DELETE ON public.space_unit_groups
  FOR EACH ROW EXECUTE FUNCTION public.guard_group_change();$mp_32_27$;

    EXECUTE $mp_32_28$-- ---------------------------------------------------------------------------
-- 5. Preço, horário e forma da reserva conferidos pelo banco.
--
-- O servidor calcula (src/lib/rentals/pricing.ts) e o banco confere com a
-- MESMA regra: se um bug gravar um valor diferente do que as regras do
-- grupo mandam, o INSERT falha. Arredondamento do proporcional: uma vez,
-- meio para cima, sobre o total.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.temporary_rent_cents(p_group uuid, p_units integer, p_unit public.rental_time_unit)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  g public.space_unit_groups%ROWTYPE;
  preco bigint;
  divisor integer;
BEGIN
  SELECT * INTO g FROM public.space_unit_groups WHERE id = p_group;
  IF NOT FOUND OR NOT g.allows_temporary OR p_units IS NULL OR p_units < 1 OR p_unit IS NULL THEN
    RETURN NULL;
  END IF;

  IF g.temp_pricing_mode = 'packages' THEN
    IF p_unit <> g.temp_unit THEN
      RETURN NULL;
    END IF;
    SELECT (value ->> 'priceCents')::bigint INTO preco
      FROM jsonb_array_elements(g.temp_packages)
     WHERE (value ->> 'units')::integer = p_units
     LIMIT 1;
  ELSIF p_unit = g.temp_unit THEN
    IF p_units > g.temp_max_units THEN
      RETURN NULL;
    END IF;
    preco := g.temp_price_cents::bigint * p_units;
  ELSE
    IF g.temp_allow_fraction AND g.temp_unit = 'day' AND p_unit = 'hour' THEN
      divisor := 24;
    ELSIF g.temp_allow_fraction AND g.temp_unit = 'week' AND p_unit = 'day' THEN
      divisor := 7;
    ELSE
      RETURN NULL;
    END IF;
    IF p_units > g.temp_max_units * divisor THEN
      RETURN NULL;
    END IF;
    preco := (g.temp_price_cents::bigint * p_units * 2 + divisor) / (2 * divisor);
  END IF;

  IF preco IS NULL OR preco < 1 OR preco > 100000000 THEN
    RETURN NULL;
  END IF;
  RETURN preco::integer;
END;
$$;$mp_32_28$;

    EXECUTE $mp_32_29$CREATE OR REPLACE FUNCTION public.rental_unit_interval(p_unit public.rental_time_unit)
RETURNS interval
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_unit WHEN 'hour' THEN interval '1 hour' WHEN 'day' THEN interval '24 hours' ELSE interval '168 hours' END
$$;$mp_32_29$;

    EXECUTE $mp_32_30$CREATE OR REPLACE FUNCTION public.platform_setting_int(p_key text, p_default integer)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (value #>> '{}')::integer FROM public.platform_settings WHERE key = p_key),
    p_default
  )
$$;$mp_32_30$;

    EXECUTE $mp_32_31$CREATE OR REPLACE FUNCTION public.guard_booking_rental_shape()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  g public.space_unit_groups%ROWTYPE;
  anterior public.bookings%ROWTYPE;
  esperado integer;
  ini timestamp;
  fim timestamp;
BEGIN
  -- Contínuo: o horário exato de início é sempre a meia-noite (Brasília)
  -- do dia de início — derivado aqui, nunca informado à parte.
  IF NEW.kind = 'continuous' THEN
    NEW.starts_at := (NEW.start_date::timestamp AT TIME ZONE 'America/Sao_Paulo');

    -- Valor de UMA mensalidade = preço mensal do grupo, conferido quando a
    -- solicitação nasce e quando é aceita (o aceite congela o valor vigente).
    IF NEW.group_id IS NOT NULL
       AND (TG_OP = 'INSERT' OR (OLD.status = 'requested' AND NEW.status = 'approved')) THEN
      SELECT * INTO g FROM public.space_unit_groups WHERE id = NEW.group_id;
      IF NOT g.allows_continuous OR g.monthly_price_cents IS DISTINCT FROM NEW.monthly_rent_cents THEN
        RAISE EXCEPTION 'Valor mensal diferente do preco do grupo'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_rent_matches_group';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- ---- Temporário ----
  IF TG_OP = 'UPDATE' THEN
    -- Depois de criada, a reserva temporária não muda de unidade, horário,
    -- duração nem valor. Só a proteção pós-fim pode encolher (renovação).
    IF NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.group_id IS DISTINCT FROM OLD.group_id
       OR NEW.unit_id IS DISTINCT FROM OLD.unit_id
       OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
       OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
       OR NEW.duration_units IS DISTINCT FROM OLD.duration_units
       OR NEW.duration_unit IS DISTINCT FROM OLD.duration_unit
       OR NEW.monthly_rent_cents IS DISTINCT FROM OLD.monthly_rent_cents
       OR NEW.total_charged_cents IS DISTINCT FROM OLD.total_charged_cents
       OR NEW.start_date IS DISTINCT FROM OLD.start_date
       OR NEW.end_date IS DISTINCT FROM OLD.end_date
       OR NEW.occupied_until > OLD.occupied_until THEN
      RAISE EXCEPTION 'Reserva temporaria nao muda depois de criada'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_temporary_frozen';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO g FROM public.space_unit_groups WHERE id = NEW.group_id;
  IF NOT FOUND OR NOT g.active OR NOT g.allows_temporary THEN
    RAISE EXCEPTION 'Grupo nao aceita aluguel temporario'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_temporary_rules';
  END IF;

  esperado := public.temporary_rent_cents(NEW.group_id, NEW.duration_units, NEW.duration_unit);
  IF esperado IS NULL THEN
    RAISE EXCEPTION 'Duracao fora das regras do grupo'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_temporary_rules';
  END IF;
  IF esperado <> NEW.monthly_rent_cents THEN
    RAISE EXCEPTION 'Valor diferente do que as regras do grupo calculam'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_rent_matches_group';
  END IF;
  IF NEW.monthly_rent_cents < public.platform_setting_int('booking.min_rent_cents', 3500) THEN
    RAISE EXCEPTION 'Valor abaixo do minimo por cobranca'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_temporary_minimum';
  END IF;

  IF NEW.starts_at IS NULL
     OR NEW.ends_at IS DISTINCT FROM NEW.starts_at + NEW.duration_units * public.rental_unit_interval(NEW.duration_unit) THEN
    RAISE EXCEPTION 'Fim da reserva diferente de inicio + duracao'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_temporary_rules';
  END IF;

  IF NEW.status = 'awaiting_payment'
     AND (NEW.hold_expires_at IS NULL
          OR NEW.hold_expires_at > now() + make_interval(mins => public.platform_setting_int('rental.hold_minutes', 15) + 1)) THEN
    RAISE EXCEPTION 'Prazo para pagar fora do permitido'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_temporary_hold';
  END IF;

  IF NEW.renewed_from_id IS NOT NULL THEN
    -- Renovação: mesma pessoa, mesma unidade, começando exatamente onde a
    -- anterior termina, pedida até 7 minutos depois do fim.
    SELECT * INTO anterior FROM public.bookings WHERE id = NEW.renewed_from_id;
    IF NOT FOUND
       OR anterior.kind <> 'temporary' OR anterior.status <> 'active' OR NOT anterior.renewal_allowed
       OR anterior.renter_id <> NEW.renter_id
       OR anterior.unit_id IS DISTINCT FROM NEW.unit_id
       OR anterior.ends_at <> NEW.starts_at
       OR now() > anterior.ends_at + interval '7 minutes' THEN
      RAISE EXCEPTION 'Renovacao fora das regras'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_renewal_rules';
    END IF;
  ELSIF NEW.starts_at < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'Inicio no passado'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_temporary_window';
  END IF;
  IF NEW.starts_at > now() + make_interval(days => public.platform_setting_int('rental.max_advance_days', 30)) THEN
    RAISE EXCEPTION 'Inicio longe demais'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_temporary_window';
  END IF;

  -- Horário de funcionamento, no relógio de Brasília. Em minutos desde a
  -- meia-noite do dia do início — fechar às 24:00 também funciona.
  IF g.hours_mode = 'daily' THEN
    ini := NEW.starts_at AT TIME ZONE 'America/Sao_Paulo';
    fim := NEW.ends_at AT TIME ZONE 'America/Sao_Paulo';
    IF extract(epoch FROM (ini - ini::date::timestamp)) < extract(epoch FROM g.opens_at) THEN
      RAISE EXCEPTION 'O espaco abre as %', to_char(g.opens_at, 'HH24:MI')
        USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_operating_hours';
    END IF;
    IF extract(epoch FROM (fim - ini::date::timestamp)) > extract(epoch FROM g.closes_at) THEN
      RAISE EXCEPTION 'O espaco fecha as %', to_char(g.closes_at, 'HH24:MI')
        USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_operating_hours';
    END IF;
  END IF;

  -- Dias que a reserva toca (fim exclusivo), no relógio de Brasília — é o
  -- que o calendário de bloqueios compara (trigger bookings_guard_blocked_period).
  NEW.start_date := (NEW.starts_at AT TIME ZONE 'America/Sao_Paulo')::date;
  NEW.end_date := CASE
    WHEN (NEW.ends_at AT TIME ZONE 'America/Sao_Paulo')::time = '00:00'
      THEN (NEW.ends_at AT TIME ZONE 'America/Sao_Paulo')::date
    ELSE (NEW.ends_at AT TIME ZONE 'America/Sao_Paulo')::date + 1
  END;
  -- Proteção depois do fim: 7 minutos para renovar, se o grupo aceita.
  NEW.renewal_allowed := g.renewal_allowed;
  NEW.occupied_until := NEW.ends_at + CASE WHEN g.renewal_allowed THEN interval '7 minutes' ELSE interval '0' END;

  RETURN NEW;
END;
$$;$mp_32_31$;

    EXECUTE $mp_32_32$-- O nome começa com "derive" de propósito: triggers BEFORE rodam em ordem
-- alfabética, e esta precisa preencher as datas antes de
-- `bookings_guard_blocked_period` conferir o calendário.
CREATE TRIGGER bookings_derive_rental_shape
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_rental_shape();$mp_32_32$;

    EXECUTE $mp_32_33$-- ---------------------------------------------------------------------------
-- 6. Encerrar o que venceu — sempre pelo relógio do banco.
--
-- Chamada (a) pela transação que vai alugar uma unidade, antes de procurar
-- unidade livre, e (b) pelo agendador por minuto. Só mexe em estado; os
-- efeitos fora do banco (avisos, cancelar a recorrência no Asaas, excluir a
-- cobrança que não deve mais ser paga) ficam marcados aqui e são executados
-- pela aplicação, que repete até o gateway confirmar.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_expired_rentals(p_space uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  n_reservas integer := 0;
  n_temporarios integer := 0;
  n_pendentes integer := 0;
BEGIN
  -- Reserva temporária não paga no prazo: unidade liberada; a cobrança em
  -- aberto é marcada para exclusão no gateway (não pode mais ser paga).
  WITH vencidas AS (
    UPDATE public.bookings
       SET status = 'expired', end_reason = 'hold_expired', updated_at = now()
     WHERE kind = 'temporary' AND status = 'awaiting_payment'
       AND hold_expires_at <= now()
       AND (p_space IS NULL OR space_id = p_space)
    RETURNING id
  ), cobrancas AS (
    UPDATE public.payments p
       SET delete_requested_at = now(), updated_at = now()
      FROM vencidas v
     WHERE p.booking_id = v.id AND p.status IN ('pending', 'overdue') AND p.delete_requested_at IS NULL
    RETURNING p.id
  )
  SELECT count(*) INTO n_reservas FROM vencidas;

  -- Temporário que terminou e cuja janela de renovação já passou.
  UPDATE public.bookings
     SET status = 'ended', end_reason = 'completed', ended_at = ends_at, updated_at = now()
   WHERE kind = 'temporary' AND status = 'active'
     AND occupied_until <= now()
     AND (p_space IS NULL OR space_id = p_space);
  GET DIAGNOSTICS n_temporarios = ROW_COUNT;

  -- Pagamento pendente que passou do prazo total (40 min + 1 h): aluguel
  -- encerrado, recorrência marcada como cancelada (o cancelamento no Asaas
  -- é feito pela aplicação e repetido até confirmar).
  WITH encerradas AS (
    UPDATE public.bookings
       SET status = 'ended', end_reason = 'payment_not_received', ended_at = now(), updated_at = now()
     WHERE status = 'past_due'
       AND payment_issue_deadline_at <= now()
       AND (p_space IS NULL OR space_id = p_space)
    RETURNING id
  ), assinaturas AS (
    UPDATE public.subscriptions s
       SET status = 'cancelled', cancelled_at = now(), updated_at = now()
      FROM encerradas e
     WHERE s.booking_id = e.id
       AND s.status IN ('pending_authorization', 'active', 'past_due', 'paused')
    RETURNING s.id
  )
  SELECT count(*) INTO n_pendentes FROM encerradas;

  RETURN n_reservas + n_temporarios + n_pendentes;
END;
$$;$mp_32_33$;

    EXECUTE $mp_32_34$-- ---------------------------------------------------------------------------
-- 7. Dados que já existiam: cada anúncio que já tinha passado da etapa de
-- preço ganha um grupo e uma unidade, com o mesmo preço mensal; cada reserva
-- aponta para essa unidade. Nada muda para quem já alugava.
-- ---------------------------------------------------------------------------
INSERT INTO public.space_unit_groups (space_id, name, position, allows_continuous, allows_temporary, monthly_price_cents)
SELECT s.id, 'Padrão', 0, true, false, s.price_monthly_cents
  FROM public.spaces s
 WHERE s.price_monthly_cents IS NOT NULL
   AND (s.status <> 'draft' OR s.draft_step >= 7)
   AND NOT EXISTS (SELECT 1 FROM public.space_unit_groups g WHERE g.space_id = s.id);$mp_32_34$;

    EXECUTE $mp_32_35$INSERT INTO public.space_units (space_id, group_id, label, position)
SELECT g.space_id, g.id, 'Unidade 1', 1
  FROM public.space_unit_groups g
 WHERE NOT EXISTS (SELECT 1 FROM public.space_units u WHERE u.group_id = g.id);$mp_32_35$;

    EXECUTE $mp_32_36$-- Rascunho que ainda não chegou no preço tinha 1 centavo provisório (o CHECK
-- exigia > 0 desde o INSERT). Agora o campo aceita NULL: sai o provisório.
UPDATE public.spaces s
   SET price_monthly_cents = NULL
 WHERE s.status = 'draft'
   AND NOT EXISTS (SELECT 1 FROM public.space_unit_groups g WHERE g.space_id = s.id);$mp_32_36$;

    EXECUTE $mp_32_37$-- Reservas antigas apontam para a unidade criada acima. O início exato
-- (meia-noite de Brasília do dia de início) vem da trigger da seção 5.
UPDATE public.bookings b
   SET kind = 'continuous',
       group_id = g.id,
       unit_id = u.id
  FROM public.space_unit_groups g
  JOIN public.space_units u ON u.group_id = g.id
 WHERE g.space_id = b.space_id
   AND b.group_id IS NULL;$mp_32_37$;

    EXECUTE $mp_32_38$-- Atraso que já existia ganha o prazo novo a partir de agora (antes não
-- havia prazo nenhum: a unidade podia ficar ocupada para sempre).
UPDATE public.bookings
   SET payment_issue_started_at = now(),
       payment_issue_deadline_at = now() + interval '100 minutes'
 WHERE status = 'past_due' AND payment_issue_started_at IS NULL;$mp_32_38$;

    EXECUTE $mp_32_39$-- Cancelamentos anteriores já passavam pelo Asaas antes do banco.
UPDATE public.subscriptions
   SET provider_cancelled_at = cancelled_at
 WHERE status = 'cancelled' AND provider_cancelled_at IS NULL;$mp_32_39$;

    EXECUTE $mp_32_40$-- ---------------------------------------------------------------------------
-- 8. Restrições que dependem do preenchimento acima.
-- ---------------------------------------------------------------------------

-- Ninguém ocupa a mesma unidade ao mesmo tempo. Contínuo tem intervalo sem
-- fim (occupied_until NULL), então também bloqueia temporário por cima dele.
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_unit_no_overlap
  EXCLUDE USING gist (unit_id WITH =, tstzrange(starts_at, occupied_until, '[)') WITH &&)
  WHERE (unit_id IS NOT NULL AND status IN ('approved', 'awaiting_payment', 'active', 'past_due'));$mp_32_40$;

    EXECUTE $mp_32_41$ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_occupying_has_unit
  CHECK (status NOT IN ('approved', 'awaiting_payment', 'active', 'past_due')
         OR (unit_id IS NOT NULL AND group_id IS NOT NULL AND starts_at IS NOT NULL));$mp_32_41$;

    EXECUTE $mp_32_42$ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_temporary_shape
  CHECK (kind <> 'temporary' OR (
    group_id IS NOT NULL AND unit_id IS NOT NULL
    AND starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at
    AND occupied_until IS NOT NULL
    AND occupied_until >= ends_at
    AND occupied_until <= ends_at + interval '7 minutes'
    AND duration_units IS NOT NULL AND duration_units > 0 AND duration_unit IS NOT NULL
    AND status NOT IN ('requested', 'approved', 'rejected', 'past_due')
  ));$mp_32_42$;

    EXECUTE $mp_32_43$ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_continuous_open_ended
  CHECK (kind <> 'continuous' OR (
    ends_at IS NULL AND occupied_until IS NULL AND hold_expires_at IS NULL
    AND duration_units IS NULL AND duration_unit IS NULL AND renewed_from_id IS NULL
  ));$mp_32_43$;

    EXECUTE $mp_32_44$ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_temporary_hold
  CHECK (kind <> 'temporary' OR status <> 'awaiting_payment' OR hold_expires_at IS NOT NULL);$mp_32_44$;

    EXECUTE $mp_32_45$-- Pagamento pendente: só no contínuo, sempre com o prazo fixo de 40 min +
-- 1 h a partir do início da falha. Fora dele, os campos ficam vazios — só o
-- aluguel encerrado guarda a última janela, como histórico.
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_payment_window
  CHECK (
    (status = 'past_due'
      AND kind = 'continuous'
      AND payment_issue_started_at IS NOT NULL
      AND payment_issue_deadline_at = payment_issue_started_at + interval '100 minutes')
    OR (status <> 'past_due' AND payment_issue_started_at IS NULL AND payment_issue_deadline_at IS NULL)
    OR (status = 'ended' AND payment_issue_deadline_at = payment_issue_started_at + interval '100 minutes')
  );$mp_32_45$;

    EXECUTE $mp_32_46$-- `status::text`: 'expired' entrou no enum por ALTER TYPE ... ADD VALUE
-- (0010), e num banco novo todas as migrações rodam numa transação só — o
-- Postgres não deixa usar esse valor como literal na mesma transação.
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_end_reason_matches
  CHECK (end_reason IS NULL OR status::text IN ('ended', 'expired', 'cancelled'));$mp_32_46$;

    EXECUTE $mp_32_47$-- ---------------------------------------------------------------------------
-- 9. RLS (nenhum acesso direto do navegador) e configurações.
-- ---------------------------------------------------------------------------
ALTER TABLE public.space_unit_groups ENABLE ROW LEVEL SECURITY;$mp_32_47$;

    EXECUTE $mp_32_48$ALTER TABLE public.space_units ENABLE ROW LEVEL SECURITY;$mp_32_48$;

    EXECUTE $mp_32_49$DO $$
DECLARE
  t text;
  f text;
BEGIN
  FOREACH t IN ARRAY ARRAY['space_unit_groups', 'space_units'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    END IF;
  END LOOP;

  -- Funções que mudam estado não são chamáveis pela API do navegador (RPC).
  FOREACH f IN ARRAY ARRAY['public.release_expired_rentals(uuid)', 'public.apply_space_occupancy(uuid)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', f);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', f);
    END IF;
  END LOOP;
END;
$$;$mp_32_49$;

    EXECUTE $mp_32_50$INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('rental.hold_minutes', '15'::jsonb,
   'Minutos que uma reserva temporária fica segura enquanto a pessoa paga.', true),
  ('rental.max_advance_days', '30'::jsonb,
   'Com quantos dias de antecedência dá para reservar um aluguel temporário.', true)
ON CONFLICT (key) DO NOTHING;$mp_32_50$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('507e172cc33e2c7833a47303de86d3382100df068bcd217ebb27861b385a03e2', 1790849030748);

    RAISE NOTICE 'Migracao 32 (0032_aluguel_unidades) aplicada.';
  END IF;
END
$mp_bloco_32$;


-- ----------------------------------------------------------------------------
-- Migracao 33: 0033_modelo_mensal_quantidade  (126 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_33$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '602a6622fa40d80b91893ce7a2a449b714fa7c5a80e3cfa02ef8e2f57cea6d2f'
  ) THEN
    RAISE NOTICE 'Migracao 33 (0033_modelo_mensal_quantidade) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_33_0$-- ===========================================================================
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
   AND p.delete_requested_at IS NULL;$mp_33_0$;

    EXECUTE $mp_33_1$-- (`cancelled`, não `expired`: num banco novo todas as migrações rodam numa
-- transação só e o Postgres não deixa usar na mesma transação o valor
-- `expired`, acrescentado ao enum pela 0010.)
UPDATE public.bookings
   SET status = 'cancelled',
       cancelled_at = now(),
       cancellation_reason = 'Aluguel por hora, dia ou semana descontinuado.',
       updated_at = now()
 WHERE kind = 'temporary' AND status IN ('requested', 'approved', 'awaiting_payment');$mp_33_1$;

    EXECUTE $mp_33_2$UPDATE public.bookings
   SET status = 'ended',
       ended_at = COALESCE(LEAST(ends_at, now()), now()),
       updated_at = now()
 WHERE kind = 'temporary' AND status IN ('active', 'past_due');$mp_33_2$;

    EXECUTE $mp_33_3$-- Anúncio no ar sem preço mensal (só alugava por hora) não pode continuar no
-- ar: preço mensal passa a ser obrigatório para publicar. Fica pausado até o
-- proprietário informar o preço.
UPDATE public.spaces
   SET status = 'paused', updated_at = now()
 WHERE price_monthly_cents IS NULL AND status IN ('published', 'rented');$mp_33_3$;

    EXECUTE $mp_33_4$-- ---------------------------------------------------------------------------
-- 2. Quantidade nos anúncios e prazos/instruções nas reservas
-- ---------------------------------------------------------------------------

ALTER TABLE public.spaces ADD COLUMN quantity_offered integer DEFAULT 1 NOT NULL;$mp_33_4$;

    EXECUTE $mp_33_5$ALTER TABLE public.spaces ADD COLUMN quantity_total integer;$mp_33_5$;

    EXECUTE $mp_33_6$ALTER TABLE public.spaces ADD COLUMN quantity_available integer DEFAULT 1 NOT NULL;$mp_33_6$;

    EXECUTE $mp_33_7$-- Quem tinha N unidades ativas passa a oferecer N (no mínimo 1, e nunca menos
-- do que já está ocupado). O disponível sai da contagem de reservas.
UPDATE public.spaces s
   SET quantity_offered = GREATEST(
         1,
         (SELECT count(*) FROM public.space_units u WHERE u.space_id = s.id AND u.active)::integer,
         (SELECT count(*) FROM public.bookings b WHERE b.space_id = s.id AND public.booking_occupies(b.status))::integer
       );$mp_33_7$;

    EXECUTE $mp_33_8$UPDATE public.spaces s
   SET quantity_available = s.quantity_offered
         - (SELECT count(*) FROM public.bookings b WHERE b.space_id = s.id AND public.booking_occupies(b.status))::integer;$mp_33_8$;

    EXECUTE $mp_33_9$ALTER TABLE public.bookings ADD COLUMN response_deadline_at timestamp with time zone;$mp_33_9$;

    EXECUTE $mp_33_10$ALTER TABLE public.bookings ADD COLUMN first_payment_deadline_at timestamp with time zone;$mp_33_10$;

    EXECUTE $mp_33_11$ALTER TABLE public.bookings ADD COLUMN access_instructions text;$mp_33_11$;

    EXECUTE $mp_33_12$ALTER TABLE public.bookings ADD COLUMN access_audio_path text;$mp_33_12$;

    EXECUTE $mp_33_13$ALTER TABLE public.bookings ADD COLUMN access_audio_duration_ms integer;$mp_33_13$;

    EXECUTE $mp_33_14$ALTER TABLE public.bookings ADD COLUMN access_audio_mime text;$mp_33_14$;

    EXECUTE $mp_33_15$ALTER TABLE public.bookings ADD COLUMN access_instructions_at timestamp with time zone;$mp_33_15$;

    EXECUTE $mp_33_16$-- Quem já estava esperando começa um prazo novo a partir de agora (o prazo
-- antigo era de 7 dias e não existia para pagar): ninguém expira de surpresa
-- por causa desta migração.
UPDATE public.bookings SET response_deadline_at = now() + interval '24 hours' WHERE status = 'requested';$mp_33_16$;

    EXECUTE $mp_33_17$UPDATE public.bookings SET first_payment_deadline_at = now() + interval '24 hours'
 WHERE status IN ('approved', 'awaiting_payment');$mp_33_17$;

    EXECUTE $mp_33_18$-- Dois pedidos PENDENTES da mesma pessoa para o mesmo anúncio: fica o mais
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
   );$mp_33_18$;

    EXECUTE $mp_33_19$-- ---------------------------------------------------------------------------
-- 3. Remoção do modelo antigo (unidades, grupos, locação por hora)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS bookings_derive_rental_shape ON public.bookings;$mp_33_19$;

    EXECUTE $mp_33_20$DROP TRIGGER IF EXISTS bookings_sync_space_occupancy ON public.bookings;$mp_33_20$;

    EXECUTE $mp_33_21$DROP TRIGGER IF EXISTS bookings_guard_blocked_period ON public.bookings;$mp_33_21$;

    EXECUTE $mp_33_22$DROP TRIGGER IF EXISTS spaces_price_from_units ON public.spaces;$mp_33_22$;

    EXECUTE $mp_33_23$DROP TRIGGER IF EXISTS spaces_publish_requires_units ON public.spaces;$mp_33_23$;

    EXECUTE $mp_33_24$-- As colunas levam junto o que depende delas: a restrição de exclusão por
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
  DROP COLUMN hold_expires_at;$mp_33_24$;

    EXECUTE $mp_33_25$ALTER TABLE public.spaces
  DROP COLUMN temp_from_cents,
  DROP COLUMN temp_from_units,
  DROP COLUMN temp_from_unit;$mp_33_25$;

    EXECUTE $mp_33_26$DROP TABLE public.space_units;$mp_33_26$;

    EXECUTE $mp_33_27$DROP TABLE public.space_unit_groups;$mp_33_27$;

    EXECUTE $mp_33_28$DROP FUNCTION IF EXISTS public.guard_unit_group_config();$mp_33_28$;

    EXECUTE $mp_33_29$DROP FUNCTION IF EXISTS public.space_rental_summary(uuid);$mp_33_29$;

    EXECUTE $mp_33_30$DROP FUNCTION IF EXISTS public.sync_space_rental_summary();$mp_33_30$;

    EXECUTE $mp_33_31$DROP FUNCTION IF EXISTS public.guard_space_rental_summary();$mp_33_31$;

    EXECUTE $mp_33_32$DROP FUNCTION IF EXISTS public.space_fully_rented(uuid);$mp_33_32$;

    EXECUTE $mp_33_33$DROP FUNCTION IF EXISTS public.apply_space_occupancy(uuid);$mp_33_33$;

    EXECUTE $mp_33_34$DROP FUNCTION IF EXISTS public.sync_space_occupancy();$mp_33_34$;

    EXECUTE $mp_33_35$DROP FUNCTION IF EXISTS public.sync_occupancy_from_units();$mp_33_35$;

    EXECUTE $mp_33_36$DROP FUNCTION IF EXISTS public.space_has_rentable_unit(uuid);$mp_33_36$;

    EXECUTE $mp_33_37$DROP FUNCTION IF EXISTS public.guard_publish_requires_units();$mp_33_37$;

    EXECUTE $mp_33_38$DROP FUNCTION IF EXISTS public.unit_has_live_rental(uuid);$mp_33_38$;

    EXECUTE $mp_33_39$DROP FUNCTION IF EXISTS public.space_keeps_a_unit(uuid, uuid, uuid);$mp_33_39$;

    EXECUTE $mp_33_40$DROP FUNCTION IF EXISTS public.guard_unit_change();$mp_33_40$;

    EXECUTE $mp_33_41$DROP FUNCTION IF EXISTS public.guard_group_change();$mp_33_41$;

    EXECUTE $mp_33_42$DROP FUNCTION IF EXISTS public.temporary_rent_cents(uuid, integer, public.rental_time_unit);$mp_33_42$;

    EXECUTE $mp_33_43$DROP FUNCTION IF EXISTS public.rental_unit_interval(public.rental_time_unit);$mp_33_43$;

    EXECUTE $mp_33_44$DROP FUNCTION IF EXISTS public.guard_booking_rental_shape();$mp_33_44$;

    EXECUTE $mp_33_45$DROP TYPE public.rental_kind;$mp_33_45$;

    EXECUTE $mp_33_46$DROP TYPE public.rental_time_unit;$mp_33_46$;

    EXECUTE $mp_33_47$DROP TYPE public.temporary_pricing_mode;$mp_33_47$;

    EXECUTE $mp_33_48$DROP TYPE public.operating_hours_mode;$mp_33_48$;

    EXECUTE $mp_33_49$-- Motivos de encerramento: o tipo muda de valores (saem `completed` e
-- `hold_expired`, entram `request_not_answered` e `owner_end_request`).
-- Valor de enum não se apaga, então o tipo é recriado, preservando o que já
-- estava gravado (`hold_expired` vira `payment_not_received`; `completed`,
-- que era o fim natural do aluguel por hora, fica sem motivo).
CREATE TYPE public.booking_end_reason_novo AS ENUM (
  'cancelled_by_renter', 'cancelled_by_owner', 'request_not_answered', 'payment_not_received', 'owner_end_request'
);$mp_33_49$;

    EXECUTE $mp_33_50$ALTER TABLE public.bookings ADD COLUMN end_reason_novo public.booking_end_reason_novo;$mp_33_50$;

    EXECUTE $mp_33_51$UPDATE public.bookings
   SET end_reason_novo = (CASE end_reason::text
         WHEN 'cancelled_by_renter' THEN 'cancelled_by_renter'
         WHEN 'cancelled_by_owner' THEN 'cancelled_by_owner'
         WHEN 'payment_not_received' THEN 'payment_not_received'
         WHEN 'hold_expired' THEN 'payment_not_received'
         ELSE NULL
       END)::public.booking_end_reason_novo
 WHERE end_reason IS NOT NULL;$mp_33_51$;

    EXECUTE $mp_33_52$ALTER TABLE public.bookings DROP COLUMN end_reason;$mp_33_52$;

    EXECUTE $mp_33_53$DROP TYPE public.booking_end_reason;$mp_33_53$;

    EXECUTE $mp_33_54$ALTER TYPE public.booking_end_reason_novo RENAME TO booking_end_reason;$mp_33_54$;

    EXECUTE $mp_33_55$ALTER TABLE public.bookings RENAME COLUMN end_reason_novo TO end_reason;$mp_33_55$;

    EXECUTE $mp_33_56$-- Configurações do modelo antigo (nada mais as lê).
DELETE FROM public.platform_settings
 WHERE key IN ('rental.hold_minutes', 'rental.max_advance_days', 'booking.request_expiry_days');$mp_33_56$;

    EXECUTE $mp_33_57$-- ---------------------------------------------------------------------------
-- 4. Estruturas novas
-- ---------------------------------------------------------------------------

CREATE TYPE public.booking_end_request_status AS ENUM ('pending', 'withdrawn', 'completed');$mp_33_57$;

    EXECUTE $mp_33_58$CREATE TYPE public.message_kind AS ENUM ('text', 'audio');$mp_33_58$;

    EXECUTE $mp_33_59$ALTER TYPE public.notification_type ADD VALUE 'booking_request_expiring';$mp_33_59$;

    EXECUTE $mp_33_60$ALTER TYPE public.notification_type ADD VALUE 'booking_expired';$mp_33_60$;

    EXECUTE $mp_33_61$ALTER TYPE public.notification_type ADD VALUE 'rental_started';$mp_33_61$;

    EXECUTE $mp_33_62$ALTER TYPE public.notification_type ADD VALUE 'rental_end_requested';$mp_33_62$;

    EXECUTE $mp_33_63$CREATE TABLE public.booking_end_requests (
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
);$mp_33_63$;

    EXECUTE $mp_33_64$ALTER TABLE public.booking_end_requests ADD CONSTRAINT "booking_end_requests_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;$mp_33_64$;

    EXECUTE $mp_33_65$ALTER TABLE public.booking_end_requests ADD CONSTRAINT "booking_end_requests_requested_by_profiles_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;$mp_33_65$;

    EXECUTE $mp_33_66$CREATE INDEX "booking_end_requests_booking_idx" ON public.booking_end_requests USING btree ("booking_id","created_at");$mp_33_66$;

    EXECUTE $mp_33_67$CREATE UNIQUE INDEX "booking_end_requests_one_pending" ON public.booking_end_requests USING btree ("booking_id") WHERE status = 'pending';$mp_33_67$;

    EXECUTE $mp_33_68$CREATE INDEX "booking_end_requests_due_idx" ON public.booking_end_requests USING btree ("requested_end_date") WHERE status = 'pending';$mp_33_68$;

    EXECUTE $mp_33_69$-- Mensagens: texto ou áudio (imagem não existe).
ALTER TABLE public.messages ADD COLUMN kind public.message_kind DEFAULT 'text' NOT NULL;$mp_33_69$;

    EXECUTE $mp_33_70$ALTER TABLE public.messages ADD COLUMN audio_path text;$mp_33_70$;

    EXECUTE $mp_33_71$ALTER TABLE public.messages ADD COLUMN audio_duration_ms integer;$mp_33_71$;

    EXECUTE $mp_33_72$ALTER TABLE public.messages ADD COLUMN audio_mime text;$mp_33_72$;

    EXECUTE $mp_33_73$ALTER TABLE public.messages ALTER COLUMN body SET DEFAULT '';$mp_33_73$;

    EXECUTE $mp_33_74$ALTER TABLE public.messages DROP CONSTRAINT messages_body_not_empty;$mp_33_74$;

    EXECUTE $mp_33_75$ALTER TABLE public.messages ADD CONSTRAINT messages_body_not_empty
  CHECK (kind::text = 'audio' OR length(trim(body)) > 0);$mp_33_75$;

    EXECUTE $mp_33_76$ALTER TABLE public.messages ADD CONSTRAINT messages_audio_shape
  CHECK ((kind::text = 'text' AND audio_path IS NULL AND audio_duration_ms IS NULL AND audio_mime IS NULL)
      OR (kind::text = 'audio' AND audio_path IS NOT NULL AND audio_duration_ms BETWEEN 1000 AND 180000
          AND audio_mime IS NOT NULL AND body = ''));$mp_33_76$;

    EXECUTE $mp_33_77$-- O arquivo de áudio mora na pasta da própria conversa: ninguém aponta uma
-- mensagem para o áudio de outra conversa.
ALTER TABLE public.messages ADD CONSTRAINT messages_audio_path_in_conversation
  CHECK (audio_path IS NULL OR audio_path LIKE (conversation_id::text || '/%'));$mp_33_77$;

    EXECUTE $mp_33_78$-- Anúncios: quantidade e preço obrigatório para ir ao ar.
ALTER TABLE public.spaces ADD CONSTRAINT spaces_quantity_offered_range
  CHECK (quantity_offered BETWEEN 1 AND 10000);$mp_33_78$;

    EXECUTE $mp_33_79$ALTER TABLE public.spaces ADD CONSTRAINT spaces_quantity_total_covers_offered
  CHECK (quantity_total IS NULL OR quantity_total >= quantity_offered);$mp_33_79$;

    EXECUTE $mp_33_80$ALTER TABLE public.spaces ADD CONSTRAINT spaces_quantity_available_range
  CHECK (quantity_available BETWEEN 0 AND quantity_offered);$mp_33_80$;

    EXECUTE $mp_33_81$ALTER TABLE public.spaces ADD CONSTRAINT spaces_published_requires_price
  CHECK (status NOT IN ('published', 'rented') OR price_monthly_cents IS NOT NULL);$mp_33_81$;

    EXECUTE $mp_33_82$-- Reservas: índices de varredura, um pedido pendente por pessoa e anúncio, e
-- as regras de formato.
CREATE INDEX "bookings_space_occupying_idx" ON public.bookings USING btree ("space_id")
  WHERE status IN ('approved','awaiting_payment','active','past_due');$mp_33_82$;

    EXECUTE $mp_33_83$CREATE INDEX "bookings_response_deadline_idx" ON public.bookings USING btree ("response_deadline_at")
  WHERE status = 'requested';$mp_33_83$;

    EXECUTE $mp_33_84$CREATE INDEX "bookings_first_payment_deadline_idx" ON public.bookings USING btree ("first_payment_deadline_at")
  WHERE status IN ('approved','awaiting_payment');$mp_33_84$;

    EXECUTE $mp_33_85$CREATE UNIQUE INDEX "bookings_one_pending_per_renter_space" ON public.bookings USING btree ("space_id","renter_id")
  WHERE status = 'requested';$mp_33_85$;

    EXECUTE $mp_33_86$ALTER TABLE public.bookings ADD CONSTRAINT bookings_access_instructions_length
  CHECK (access_instructions IS NULL OR char_length(btrim(access_instructions)) BETWEEN 10 AND 1000);$mp_33_86$;

    EXECUTE $mp_33_87$-- O áudio das instruções anda junto com a duração e o tipo (mesmos limites do
-- áudio do chat: de 1 s a 3 min).
ALTER TABLE public.bookings ADD CONSTRAINT bookings_access_audio_shape
  CHECK ((access_audio_path IS NULL AND access_audio_duration_ms IS NULL AND access_audio_mime IS NULL)
      OR (access_audio_path IS NOT NULL AND access_audio_duration_ms BETWEEN 1000 AND 180000
          AND access_audio_mime IS NOT NULL));$mp_33_87$;

    EXECUTE $mp_33_88$-- A janela do pagamento pendente passa a ser TOTAL de 2 h (era 40 min + 1 h =
-- 100 min). Quem está dentro dela agora recebe os 120 minutos completos; a
-- janela guardada nas locações já encerradas é histórico e fica como estava.
UPDATE public.bookings
   SET payment_issue_deadline_at = payment_issue_started_at + interval '120 minutes'
 WHERE status = 'past_due' AND payment_issue_started_at IS NOT NULL;$mp_33_88$;

    EXECUTE $mp_33_89$ALTER TABLE public.bookings ADD CONSTRAINT bookings_payment_window
  CHECK ((status = 'past_due'
            AND payment_issue_started_at IS NOT NULL
            AND payment_issue_deadline_at = payment_issue_started_at + interval '120 minutes')
          OR (status <> 'past_due' AND payment_issue_started_at IS NULL AND payment_issue_deadline_at IS NULL)
          OR (status = 'ended' AND payment_issue_started_at IS NOT NULL AND payment_issue_deadline_at > payment_issue_started_at));$mp_33_89$;

    EXECUTE $mp_33_90$-- `status::text`: 'expired' entrou no enum por ALTER TYPE ... ADD VALUE (0010),
-- e num banco novo todas as migrações rodam numa transação só — o Postgres não
-- deixa usar esse valor como literal na mesma transação.
ALTER TABLE public.bookings ADD CONSTRAINT bookings_end_reason_matches
  CHECK (end_reason IS NULL OR status::text IN ('ended', 'expired', 'cancelled'));$mp_33_90$;

    EXECUTE $mp_33_91$-- ---------------------------------------------------------------------------
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
$$;$mp_33_91$;

    EXECUTE $mp_33_92$-- Disponibilidade acompanha qualquer mudança de reserva.
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
$$;$mp_33_92$;

    EXECUTE $mp_33_93$CREATE TRIGGER bookings_sync_availability
  AFTER INSERT OR UPDATE OF status, space_id OR DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_space_availability();$mp_33_93$;

    EXECUTE $mp_33_94$-- A ÚLTIMA VAGA. Quando uma reserva passa a ocupar (aceite, ou inserção
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
$$;$mp_33_94$;

    EXECUTE $mp_33_95$CREATE TRIGGER bookings_guard_capacity
  BEFORE INSERT OR UPDATE OF status, space_id ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_capacity();$mp_33_95$;

    EXECUTE $mp_33_96$-- O valor mensal da reserva é sempre o preço do anúncio: conferido quando o
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
$$;$mp_33_96$;

    EXECUTE $mp_33_97$CREATE TRIGGER bookings_guard_price
  BEFORE INSERT OR UPDATE OF status, monthly_rent_cents ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_price();$mp_33_97$;

    EXECUTE $mp_33_98$-- Uma pessoa não tem duas locações vivas do MESMO anúncio: ao nascer um pedido
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
$$;$mp_33_98$;

    EXECUTE $mp_33_99$CREATE TRIGGER bookings_guard_single_live
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_single_live();$mp_33_99$;

    EXECUTE $mp_33_100$-- Pedido novo: o prazo de resposta (24 h) começa a contar no relógio do banco.
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
$$;$mp_33_100$;

    EXECUTE $mp_33_101$CREATE TRIGGER bookings_set_deadlines
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_booking_deadlines();$mp_33_101$;

    EXECUTE $mp_33_102$-- O ACEITE: só dentro do prazo de resposta, só com instruções de acesso
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
$$;$mp_33_102$;

    EXECUTE $mp_33_103$CREATE TRIGGER bookings_guard_approval
  BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_approval();$mp_33_103$;

    EXECUTE $mp_33_104$-- Quantidade do anúncio: nunca abaixo do que já está ocupado; o disponível é
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
$$;$mp_33_104$;

    EXECUTE $mp_33_105$CREATE TRIGGER spaces_guard_quantity
  BEFORE INSERT OR UPDATE OF quantity_offered ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.guard_space_quantity();$mp_33_105$;

    EXECUTE $mp_33_106$-- Mudou a quantidade oferecida: o status acompanha (alugado <-> no ar).
CREATE OR REPLACE FUNCTION public.sync_space_after_quantity_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_space_availability(NEW.id);
  RETURN NULL;
END;
$$;$mp_33_106$;

    EXECUTE $mp_33_107$CREATE TRIGGER spaces_sync_after_quantity_change
  AFTER UPDATE OF quantity_offered ON public.spaces
  FOR EACH ROW
  WHEN (NEW.quantity_offered IS DISTINCT FROM OLD.quantity_offered)
  EXECUTE FUNCTION public.sync_space_after_quantity_change();$mp_33_107$;

    EXECUTE $mp_33_108$-- Nenhum anúncio fica `published` sem vaga: retomar um anúncio pausado ou
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
$$;$mp_33_108$;

    EXECUTE $mp_33_109$-- Pedido de encerramento do proprietário: só ele pede, só de locação em
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
$$;$mp_33_109$;

    EXECUTE $mp_33_110$CREATE TRIGGER booking_end_requests_guard
  BEFORE INSERT ON public.booking_end_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_end_request();$mp_33_110$;

    EXECUTE $mp_33_111$-- Encerrar o que venceu — sempre pelo relógio do banco. Chamada (a) pela
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
$$;$mp_33_111$;

    EXECUTE $mp_33_112$-- ---------------------------------------------------------------------------
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
$$;$mp_33_112$;

    EXECUTE $mp_33_113$CREATE OR REPLACE FUNCTION public.guard_booking_against_blocks()
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
$$;$mp_33_113$;

    EXECUTE $mp_33_114$CREATE TRIGGER bookings_guard_blocked_period
  BEFORE INSERT OR UPDATE OF status, start_date ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_against_blocks();$mp_33_114$;

    EXECUTE $mp_33_115$-- ---------------------------------------------------------------------------
-- 7. RLS, Storage do áudio e configurações
-- ---------------------------------------------------------------------------

ALTER TABLE public.booking_end_requests ENABLE ROW LEVEL SECURITY;$mp_33_115$;

    EXECUTE $mp_33_116$DO $$
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
$$;$mp_33_116$;

    EXECUTE $mp_33_117$INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
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
ON CONFLICT (key) DO NOTHING;$mp_33_117$;

    EXECUTE $mp_33_118$-- Privacidade da localização por TIPO de espaço. O mapa público só lê
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
$$;$mp_33_118$;

    EXECUTE $mp_33_119$DROP TRIGGER IF EXISTS spaces_sync_approx_location ON public.spaces;$mp_33_119$;

    EXECUTE $mp_33_120$CREATE TRIGGER spaces_sync_approx_location
  BEFORE INSERT OR UPDATE OF location, type ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.sync_approx_location();$mp_33_120$;

    EXECUTE $mp_33_121$-- Mudou a lista de tipos (ou o raio): os anúncios existentes são recalculados
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
$$;$mp_33_121$;

    EXECUTE $mp_33_122$CREATE TRIGGER platform_settings_privacy_resync
  AFTER INSERT OR UPDATE OF value ON public.platform_settings
  FOR EACH ROW
  WHEN (NEW.key IN ('privacy.exact_location_types', 'privacy.approx_location_meters'))
  EXECUTE FUNCTION public.resync_approx_after_privacy_setting();$mp_33_122$;

    EXECUTE $mp_33_123$-- Aplica a regra aos anúncios que já existem.
UPDATE public.spaces SET approx_location = NULL, location = location WHERE location IS NOT NULL;$mp_33_123$;

    EXECUTE $mp_33_124$DO $mp_audio_bucket$
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
END $mp_audio_bucket$;$mp_33_124$;

    EXECUTE $mp_33_125$DO $mp_audio_pol$
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
END $mp_audio_pol$;$mp_33_125$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('602a6622fa40d80b91893ce7a2a449b714fa7c5a80e3cfa02ef8e2f57cea6d2f', 1791100000000);

    RAISE NOTICE 'Migracao 33 (0033_modelo_mensal_quantidade) aplicada.';
  END IF;
END
$mp_bloco_33$;


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
