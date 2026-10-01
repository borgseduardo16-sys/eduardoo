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
-- anteriores ja foram aplicadas — se este for um projeto novo, use
-- supabase/setup.sql, que traz o schema completo.
--
-- Ao terminar, a saida mostra quantas migracoes foram aplicadas agora e
-- quantas ja estavam no banco.
--
-- Gerado por scripts/build-supabase-setup.ts a partir de 6 migracoes
-- testadas contra um Postgres real. Nao edite a mao: altere src/db/schema/,
-- gere a migracao e rode este script de novo.
-- ============================================================================

-- O PostGIS do Supabase e instalado no schema "extensions", nao em "public".
-- Sem isto, o tipo geometry(Point,4326) e o cast ::geography nao sao
-- encontrados e a criacao das tabelas de espacos falha.
SET search_path = public, extensions;

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


-- ============================================================================
-- Resumo
-- ============================================================================
DO $mp_resumo$
DECLARE aplicadas integer;
BEGIN
  SELECT count(*) INTO aplicadas FROM drizzle.__drizzle_migrations;
  RAISE NOTICE '---';
  RAISE NOTICE 'Pronto: % de 31 migracoes registradas no banco.', aplicadas;
END
$mp_resumo$;

-- Confira o resultado com:
--
--   SELECT count(*) FROM drizzle.__drizzle_migrations;            -- 31
--   SELECT key, value FROM platform_settings ORDER BY key;        -- taxas 3%+3%
--   SELECT PostGIS_Version();                                     -- extensao ativa
