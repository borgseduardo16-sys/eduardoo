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
-- Este arquivo tem SO as migracoes 10 em diante. Ele supoe que as
-- anteriores ja foram aplicadas — se este for um projeto novo, use
-- supabase/setup.sql, que traz o schema completo.
--
-- Ao terminar, a saida mostra quantas migracoes foram aplicadas agora e
-- quantas ja estavam no banco.
--
-- Gerado por scripts/build-supabase-setup.ts a partir de 1 migracoes
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
-- Migracao 10: 0010_status_expirado_reserva  (2 comandos)
-- ----------------------------------------------------------------------------
DO $mp_bloco_10$
BEGIN
  IF EXISTS (
    SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = 'ca69412b4b6e0d2da1074f7ba1af89ae9b2c735c936069f62245b1092a5cead9'
  ) THEN
    RAISE NOTICE 'Migracao 10 (0010_status_expirado_reserva) ja aplicada — pulando.';
  ELSE
    EXECUTE $mp_10_0$ALTER TYPE "public"."booking_status" ADD VALUE 'expired' BEFORE 'awaiting_payment';$mp_10_0$;

    EXECUTE $mp_10_1$-- Prazo para o proprietario responder uma solicitacao antes dela expirar
-- sozinha. Nao existia settings key para isso ate a Parte 4 (fluxo real de
-- solicitacao/reserva) precisar de um estado "expirada" de verdade no banco.
INSERT INTO public.platform_settings (key, value, description, is_public) VALUES
  ('booking.request_expiry_days', '7'::jsonb,
   'Dias que uma solicitacao fica pendente antes de expirar sozinha, sem resposta do proprietario.', true)
ON CONFLICT (key) DO NOTHING;$mp_10_1$;

    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    VALUES ('ca69412b4b6e0d2da1074f7ba1af89ae9b2c735c936069f62245b1092a5cead9', 1789723772646);

    RAISE NOTICE 'Migracao 10 (0010_status_expirado_reserva) aplicada.';
  END IF;
END
$mp_bloco_10$;


-- ============================================================================
-- Resumo
-- ============================================================================
DO $mp_resumo$
DECLARE aplicadas integer;
BEGIN
  SELECT count(*) INTO aplicadas FROM drizzle.__drizzle_migrations;
  RAISE NOTICE '---';
  RAISE NOTICE 'Pronto: % de 11 migracoes registradas no banco.', aplicadas;
END
$mp_resumo$;

-- Confira o resultado com:
--
--   SELECT count(*) FROM pg_tables WHERE schemaname = 'public';   -- 22
--   SELECT key, value FROM platform_settings ORDER BY key;        -- taxas 3%+3%
--   SELECT PostGIS_Version();                                     -- extensao ativa
