-- ============================================================================
-- MyPlace — idempotencia de notificacao (Fase 21)
--
-- O mesmo evento processado duas vezes (webhook reenviado com outro id,
-- cron rodando de novo, clique duplo) gera a mesma `dedupe_key`; o indice
-- unico parcial faz o segundo INSERT virar nada via ON CONFLICT DO NOTHING.
-- Notificacoes antigas ficam com a chave NULL e nao participam do indice.
-- ============================================================================

ALTER TABLE "notifications" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_dedupe_key" ON "notifications" USING btree ("user_id","dedupe_key") WHERE dedupe_key IS NOT NULL;