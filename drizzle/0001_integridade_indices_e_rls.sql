-- ============================================================================
-- MyPlace — integridade, indices geoespaciais, triggers e RLS
--
-- O que este arquivo faz, em ordem:
--   1. Liga o perfil da aplicacao a identidade do Supabase Auth
--   2. Indices GIST para busca por distancia e trigram para busca textual
--   3. Triggers que protegem invariantes que a aplicacao nao pode garantir
--   4. RLS: por padrao o navegador NAO le nada; libera-se caso a caso
--   5. Dados iniciais (taxas da plataforma e catalogo de caracteristicas)
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Identidade
-- ---------------------------------------------------------------------------

-- No Supabase o schema `auth` ja existe e e gerenciado por eles.
-- Em desenvolvimento local criamos um stub minimo para que ESTA MESMA
-- migracao rode nos dois ambientes sem ramificacao.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    CREATE SCHEMA auth;

    CREATE TABLE auth.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text UNIQUE,
      raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    -- No Supabase, auth.uid() le o `sub` do JWT da requisicao.
    EXECUTE $f$
      CREATE FUNCTION auth.uid() RETURNS uuid
      LANGUAGE sql STABLE AS $body$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
      $body$;
    $f$;
  END IF;
END $$;
--> statement-breakpoint

-- O perfil e uma extensao 1:1 da identidade. Apagar o usuario apaga o perfil.
ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_id_auth_users_fk"
  FOREIGN KEY ("id") REFERENCES auth.users("id") ON DELETE CASCADE;
--> statement-breakpoint

-- Cria o perfil automaticamente quando alguem se cadastra.
-- Sem isto haveria uma janela em que o usuario existe mas nao tem perfil.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')), '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
--> statement-breakpoint
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
--> statement-breakpoint

-- Quem e o usuario da requisicao atual (NULL para visitante).
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE sql STABLE
SET search_path = public, auth
AS $$ SELECT auth.uid() $$;
--> statement-breakpoint

-- SECURITY DEFINER para consultar profiles sem recursao de RLS.
-- search_path fixo impede sequestro da funcao por schema malicioso.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.status = 'active'
      AND p.deleted_at IS NULL
  );
$$;
--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 2. Indices
-- ---------------------------------------------------------------------------

-- Busca por raio ("ate 2 km de mim") usa ST_DWithin(coluna::geography, ...).
-- O indice precisa ser sobre EXATAMENTE essa expressao, senao o planner ignora.
CREATE INDEX "spaces_location_gix"
  ON "spaces" USING GIST ((("location")::geography));
--> statement-breakpoint
CREATE INDEX "spaces_approx_location_gix"
  ON "spaces" USING GIST ((("approx_location")::geography));
--> statement-breakpoint

-- Busca textual tolerante a acento/erro de digitacao em titulo, cidade e bairro.
CREATE INDEX "spaces_title_trgm_idx" ON "spaces" USING GIN ("title" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "spaces_city_trgm_idx" ON "spaces" USING GIN ("city" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "spaces_district_trgm_idx" ON "spaces" USING GIN ("district" gin_trgm_ops);
--> statement-breakpoint

-- O caminho quente da busca: anuncios publicados, filtrados por tipo e preco.
CREATE INDEX "spaces_published_browse_idx"
  ON "spaces" ("type", "price_monthly_cents")
  WHERE "status" = 'published' AND "deleted_at" IS NULL;
--> statement-breakpoint


-- ---------------------------------------------------------------------------
-- 3. Triggers de integridade
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','owner_payout_accounts','renter_billing_profiles','spaces',
    'bookings','subscriptions','payments','payouts','reviews'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t || '_set_updated_at', t
    );
  END LOOP;
END $$;
--> statement-breakpoint

-- Impede avaliacao falsa. A aplicacao ja checa, mas isto e o que vale mesmo:
-- so avalia quem participou da locacao, e so depois dela terminar.
CREATE OR REPLACE FUNCTION public.validate_review()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE b record;
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
  ELSE
    IF NEW.author_id <> b.owner_id THEN
      RAISE EXCEPTION 'Apenas o proprietario da reserva pode avaliar o locatario';
    END IF;
    IF NEW.target_user_id <> b.renter_id THEN
      RAISE EXCEPTION 'A avaliacao aponta para um usuario que nao e o locatario da reserva';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER reviews_validate
  BEFORE INSERT OR UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.validate_review();
--> statement-breakpoint

-- Mantem a nota media do anuncio coerente com as avaliacoes visiveis.
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
    SELECT ROUND(AVG(rating)::numeric, 2) AS avg_rating, COUNT(*)::int AS cnt
    FROM public.reviews
    WHERE space_id = target AND hidden_at IS NULL
  ) sub
  WHERE s.id = target;

  RETURN COALESCE(NEW, OLD);
END;
$$;
--> statement-breakpoint

CREATE TRIGGER reviews_refresh_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.refresh_space_rating();
--> statement-breakpoint

-- O livro-razao e append-only: correcao se faz com lancamento novo, nunca
-- reescrevendo o passado. Isto vale inclusive para quem tem acesso direto ao banco.
CREATE OR REPLACE FUNCTION public.forbid_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'Tabela % e append-only: use um novo lancamento para corrigir (tentativa de %)',
    TG_TABLE_NAME, TG_OP;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.forbid_mutation();
--> statement-breakpoint

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.forbid_mutation();
--> statement-breakpoint

-- Ninguem vira admin sozinho. Mudanca de papel/status so por admin ou pelo
-- servidor com conexao privilegiada (que roda como owner e nao dispara isto).
CREATE OR REPLACE FUNCTION public.guard_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;  -- servidor confiavel (sem JWT): a autorizacao ja foi feita na aplicacao
  END IF;

  IF (NEW.role IS DISTINCT FROM OLD.role
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.cpf_cnpj IS DISTINCT FROM OLD.cpf_cnpj)
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Alteracao de papel, status ou CPF/CNPJ nao permitida por esta via';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER profiles_guard_privileges
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileges();
--> statement-breakpoint

-- Mantem a conversa ordenada por atividade sem custo de subquery na listagem.
CREATE OR REPLACE FUNCTION public.touch_conversation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER messages_touch_conversation
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_conversation();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4. RLS — Row Level Security
--
-- Postura: NEGAR POR PADRAO.
--
-- O servidor Next.js fala com o banco por uma conexao privilegiada (dona das
-- tabelas), que por definicao ignora RLS — toda a autorizacao desse caminho
-- vive na Data Access Layer, em src/lib/auth/dal.ts.
--
-- O RLS abaixo protege o OUTRO caminho: o navegador falando direto com o
-- Supabase (necessario para o chat em tempo real). Ali o RLS e a unica
-- barreira, entao ele so libera o que o cliente realmente precisa ler.
-- ---------------------------------------------------------------------------

-- Papeis do Supabase. Em desenvolvimento local eles nao existem.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint

-- Liga RLS em tudo. Tabela com RLS ligada e sem policy = ninguem le nada,
-- que e exatamente o padrao que queremos.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '__drizzle_migrations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Ponto de partida: o navegador nao alcanca nada.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO anon, authenticated;
--> statement-breakpoint


-- ===== profiles =====
-- Leitura do proprio perfil. Dados de outras pessoas saem pela view publica
-- mais abaixo, que nao inclui telefone nem CPF.
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());
--> statement-breakpoint

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() AND status = 'active')
  WITH CHECK (id = auth.uid());
--> statement-breakpoint

GRANT SELECT ON public.profiles TO authenticated;
--> statement-breakpoint
-- Privilegio por COLUNA: mesmo com a policy acima, o usuario so consegue
-- escrever nestes tres campos. Papel, status e CPF ficam fora do alcance.
GRANT UPDATE (full_name, phone, avatar_path, accepted_terms_at, accepted_terms_version)
  ON public.profiles TO authenticated;
--> statement-breakpoint

-- Identificacao publica e minima de um usuario (quem anuncia, quem avaliou).
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = true) AS
  SELECT id, full_name, avatar_path, created_at
  FROM public.profiles
  WHERE status = 'active' AND deleted_at IS NULL;
--> statement-breakpoint

CREATE POLICY "profiles_select_public_subset" ON public.profiles
  FOR SELECT TO anon, authenticated
  USING (status = 'active' AND deleted_at IS NULL);
--> statement-breakpoint

GRANT SELECT ON public.public_profiles TO anon, authenticated;
--> statement-breakpoint


-- ===== favorites =====
CREATE POLICY "favorites_all_own" ON public.favorites
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;
--> statement-breakpoint


-- ===== conversations / messages =====
-- O chat e o unico fluxo em que o navegador conversa direto com o banco
-- (Supabase Realtime). Por isso estas policies sao a barreira de verdade.
CREATE POLICY "conversations_select_participant" ON public.conversations
  FOR SELECT TO authenticated
  USING (renter_id = auth.uid() OR owner_id = auth.uid());
--> statement-breakpoint
GRANT SELECT ON public.conversations TO authenticated;
--> statement-breakpoint

CREATE POLICY "messages_select_participant" ON public.messages
  FOR SELECT TO authenticated
  USING (
    hidden_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.renter_id = auth.uid() OR c.owner_id = auth.uid())
    )
  );
--> statement-breakpoint

-- Enviar mensagem exige: ser participante, ser o proprio remetente, a conversa
-- estar aberta, e a mensagem nao ser marcada como do sistema.
CREATE POLICY "messages_insert_participant" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND is_system = false
    AND hidden_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.closed_at IS NULL
        AND (c.renter_id = auth.uid() OR c.owner_id = auth.uid())
    )
  );
--> statement-breakpoint
GRANT SELECT, INSERT ON public.messages TO authenticated;
--> statement-breakpoint


-- ===== notifications =====
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
--> statement-breakpoint
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
--> statement-breakpoint
GRANT SELECT ON public.notifications TO authenticated;
--> statement-breakpoint
GRANT UPDATE (read_at) ON public.notifications TO authenticated;
--> statement-breakpoint


-- ===== features =====
-- Catalogo publico, sem dado sensivel.
CREATE POLICY "features_select_active" ON public.features
  FOR SELECT TO anon, authenticated
  USING (active = true);
--> statement-breakpoint
GRANT SELECT ON public.features TO anon, authenticated;
--> statement-breakpoint


-- NOTA DELIBERADA: spaces, bookings, payments, payouts, ledger_entries,
-- subscriptions, reports, reviews, audit_logs, webhook_events e as tabelas de
-- dados de recebimento NAO recebem grant algum para anon/authenticated.
-- Elas so sao alcancaveis pelo servidor. Endereco exato, valores e dados
-- financeiros nunca trafegam por consulta feita no navegador.


-- ---------------------------------------------------------------------------
-- 5. Dados iniciais
-- ---------------------------------------------------------------------------

-- Taxas em basis points (1 bps = 0,01%). 200 bps = 2%.
-- Ficam no banco, e nao no codigo, para que mudar taxa nao exija deploy e para
-- que cada mudanca fique registrada em audit_logs.
INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('fees.renter_fee_bps', '200'::jsonb,
   'Taxa cobrada de quem aluga, sobre o valor do aluguel. 200 = 2%.', true),
  ('fees.owner_fee_bps', '200'::jsonb,
   'Taxa retida de quem recebe, sobre o valor do aluguel. 200 = 2%.', true),
  ('booking.min_rent_cents', '5000'::jsonb,
   'Aluguel minimo aceito (R$ 50,00). Abaixo disso a tarifa do gateway supera a receita.', true),
  ('booking.billing_day_default', '5'::jsonb,
   'Dia padrao de vencimento mensal.', false),
  ('booking.max_failed_cycles', '2'::jsonb,
   'Ciclos seguidos com falha antes de suspender a locacao.', false),
  ('privacy.approx_location_meters', '300'::jsonb,
   'Raio do deslocamento aplicado ao ponto publico no mapa.', false)
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint

INSERT INTO public.features (key, label, category, icon, applies_to, sort_order) VALUES
  ('coberto',          'Coberto',                'estrutura', 'Umbrella',      '{garagem,vaga_carro,vaga_moto,deposito,galpao,terreno}', 10),
  ('fechado',          'Fechado / trancado',     'seguranca', 'Lock',          '{garagem,deposito,galpao,sala,escritorio,loja,quarto}', 20),
  ('portao',           'Portao',                 'acesso',    'DoorClosed',    '{garagem,vaga_carro,vaga_moto,deposito,galpao,terreno}', 30),
  ('acesso_24h',       'Acesso 24 horas',        'acesso',    'Clock',         '{}', 40),
  ('camera',           'Camera de seguranca',    'seguranca', 'Cctv',          '{}', 50),
  ('alarme',           'Alarme',                 'seguranca', 'BellRing',      '{}', 60),
  ('portaria',         'Portaria / vigilancia',  'seguranca', 'ShieldCheck',   '{}', 70),
  ('iluminacao',       'Iluminacao',             'estrutura', 'Lightbulb',     '{}', 80),
  ('energia',          'Tomada / energia',       'estrutura', 'Zap',           '{garagem,deposito,galpao,sala,escritorio,loja,quarto}', 90),
  ('agua',             'Agua',                   'estrutura', 'Droplets',      '{galpao,sala,escritorio,loja,terreno}', 100),
  ('banheiro',         'Banheiro',               'estrutura', 'Bath',          '{galpao,sala,escritorio,loja,deposito}', 110),
  ('seco_ventilado',   'Seco e ventilado',       'estrutura', 'Wind',          '{deposito,galpao,quarto,sala}', 120),
  ('piso_concreto',    'Piso de concreto',       'estrutura', 'Grid3x3',       '{garagem,deposito,galpao,terreno}', 130),
  ('acesso_carro',     'Acesso para carro',      'veiculo',   'Car',           '{garagem,vaga_carro,deposito,galpao,terreno}', 140),
  ('acesso_moto',      'Acesso para moto',       'veiculo',   'Bike',          '{garagem,vaga_carro,vaga_moto,deposito}', 150),
  ('acesso_caminhao',  'Acesso para caminhao',   'veiculo',   'Truck',         '{galpao,terreno,deposito}', 160),
  ('carga_descarga',   'Area de carga e descarga','veiculo',  'PackageOpen',   '{galpao,loja,deposito,terreno}', 170),
  ('elevador',         'Elevador',               'acesso',    'MoveVertical',  '{sala,escritorio,loja,deposito,quarto}', 180),
  ('terreo',           'Terreo',                 'acesso',    'ArrowDownToLine','{sala,escritorio,loja,deposito,galpao}', 190),
  ('mobiliado',        'Mobiliado',              'estrutura', 'Armchair',      '{sala,escritorio,loja,quarto}', 200)
ON CONFLICT (key) DO NOTHING;
