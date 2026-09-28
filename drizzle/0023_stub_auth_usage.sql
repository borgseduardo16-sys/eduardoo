-- ============================================================================
-- MyPlace — fidelidade do stub local de `auth` (Fase 21)
--
-- No Supabase, os papeis da API (anon, authenticated) tem USAGE no schema
-- `auth` — e isso que deixa `auth.uid()` funcionar dentro de funcoes
-- plpgsql que rodam com os privilegios de quem chamou, como as triggers
-- `guard_profile_privileges` e `guard_profile_verification`.
--
-- O stub local criado na 0001 nao concedia esse USAGE. Resultado: uma
-- requisicao do navegador que alterasse o proprio perfil (ex.: trocar o
-- telefone) falhava localmente com "permission denied for schema auth",
-- enquanto no Supabase funciona. A diferenca apareceu no teste da Fase 21
-- (scripts/verify-schema.ts, secao 14), que exercita esse caminho.
--
-- No Supabase o privilegio ja existe e este bloco nao faz nada.
-- ============================================================================

DO $$
BEGIN
  IF NOT has_schema_privilege('authenticated', 'auth', 'USAGE') THEN
    GRANT USAGE ON SCHEMA auth TO authenticated;
  END IF;
  IF NOT has_schema_privilege('anon', 'auth', 'USAGE') THEN
    GRANT USAGE ON SCHEMA auth TO anon;
  END IF;
END $$;
