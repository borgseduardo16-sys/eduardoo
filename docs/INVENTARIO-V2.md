# Inventário de Mudanças — MyPlace V2

**Status:** Mapa concreto de remociones, adaptações e permanências  
**Referência:** PRODUTO-V2.md

---

## 1. Schema do banco (src/db/schema/)

### 1.1 Arquivos a manter (mesma estrutura)

| Arquivo | Tabelas | Ação | Nota |
|---------|---------|------|------|
| enums.ts | Tipos de aluguel, estado de reserva, etc. | ✅ Manter | Remover tipos como `compatibility_status`, alertas, etc. |
| spaces.ts | `spaces` | ✅ Manter | Remover campos: `compatibility_enabled`, `class_id`, `class_confidence` |
| users.ts | `users`, `profiles`, `user_features` | ✅ Manter | ⚠️ **MANTÉM `subscription_status`, `subscription_tier`** (Premium continua) |
| rentals.ts | `spaceUnitGroups`, `spaceUnits` | ✅ Manter (mesma) | Parte 12 já é V2 |
| features.ts | `features` | ✅ Manter | Manter amenidades (Premium as usa) |
| bookings.ts | `rentals` | ✅ Manter | Remover coluna `compatibility_score` |
| premium.ts | **`user_subscriptions`, `premium_features`, `pricing_tiers`** | ✅ **MANTER (mesma)** | **Premium continua com tudo** |
| featured.ts | **`listings_featured`** | ✅ **MANTER (mesma)** | **Destaques/Turbo continua** |
| images.ts | `space_photos` | ✅ Manter | Remover `alt_text_generated_by_ai` |
| conversations.ts | `conversations`, `messages` | ✅ Manter | Manter detector de contato (segurança) |
| ratings.ts | `ratings` | ✅ Manter | Remover campos de "compatibilidade" nas avaliações |
| payments.ts | `transactions`, `webhook_logs` | ✅ Manter | **MANTÉM recorrência mensal (Premium + renovação Parte 12)** |
| security.ts | `reports`, `blocks` | ✅ Manter (mesma) | Segurança não muda |

### 1.2 Arquivos a remover (completo)

| Arquivo | Tabelas | Ação |
|---------|---------|------|
| verification.ts | `phone_verifications`, `verification_codes` | ❌ Remover (SMS Twilio) |
| bank.ts | `person_bank_data`, `bank_transfers` | ❌ Remover (banco do proprietário) |
| ai_classification.ts | `listing_space_class`, `space_class_suggestions` | ❌ Remover (IA de padrão) |
| price_suggestions.ts | `comparable_spaces`, `price_history` | ❌ Remover (IA de sugestão) |
| alerts.ts | `saved_searches`, `search_alerts` | ❌ Remover (alertas agendados) |
| security_deposits.ts | `security_deposits`, `deposit_refunds` | ❌ Remover (caução) |
| push_notifications.ts | `push_subscriptions`, `push_messages` | ❌ Remover (push no celular) |
| compatibility.ts | `compatibility_scores`, `rental_suggestions`, `waitlists` | ❌ Remover (compatibilidade Fase 23) |

### 1.3 Criação de featured_listings simples

Criar novo arquivo `src/db/schema/featured.ts` (se não existir):

```typescript
export const listingsFeatured = pgTable('listings_featured', {
  id: uuid('id').primaryKey().defaultRandom(),
  spaceId: uuid('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
  type: text('type').notNull().default('simple'), // 'simple', 'featured'
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  durationDays: integer('duration_days').notNull(),
  status: text('status').notNull().default('active'), // 'active', 'expired'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

---

## 2. Banco de dados (migrações)

### 2.1 Nova migração: Remover Fase 13 (Premium e tiers)

**Arquivo:** `src/db/migrations/0033_remove_premium.sql`

```sql
-- Removido por Neighbor-BR V2
DROP TABLE IF EXISTS public.user_subscriptions CASCADE;
DROP TABLE IF EXISTS public.premium_features CASCADE;
DROP TABLE IF EXISTS public.pricing_tiers CASCADE;
ALTER TABLE public.users DROP COLUMN IF EXISTS subscription_status;
ALTER TABLE public.users DROP COLUMN IF EXISTS subscription_expires_at;
ALTER TABLE public.users DROP COLUMN IF EXISTS subscription_tier;
ALTER TABLE public.spaces DROP COLUMN IF EXISTS requires_premium_to_list;
```

### 2.2 Nova migração: Remover Fase 5, 7, 8 (KYC, Banco)

**Arquivo:** `src/db/migrations/0034_remove_kyc_bank.sql`

```sql
-- Removido por Neighbor-BR V2
DROP TABLE IF EXISTS public.phone_verifications CASCADE;
DROP TABLE IF EXISTS public.verification_codes CASCADE;
DROP TABLE IF EXISTS public.person_bank_data CASCADE;
DROP TABLE IF EXISTS public.bank_transfers CASCADE;
DROP TABLE IF EXISTS public.bank_transfer_webhooks CASCADE;
```

### 2.3 Nova migração: Remover Fase 16, 17 (IA)

**Arquivo:** `src/db/migrations/0035_remove_ai_features.sql`

```sql
-- Removido por Neighbor-BR V2
DROP TABLE IF EXISTS public.listing_space_class CASCADE;
DROP TABLE IF EXISTS public.space_class_suggestions CASCADE;
DROP TABLE IF EXISTS public.comparable_spaces CASCADE;
DROP TABLE IF EXISTS public.price_history CASCADE;
ALTER TABLE public.spaces DROP COLUMN IF EXISTS class_id;
ALTER TABLE public.spaces DROP COLUMN IF EXISTS class_confidence;
ALTER TABLE public.bookings DROP COLUMN IF EXISTS compatibility_score;
```

### 2.4 Nova migração: Remover Fase 18 (Alertas)

**Arquivo:** `src/db/migrations/0036_remove_alerts.sql`

```sql
-- Removido por Neighbor-BR V2
DROP TABLE IF EXISTS public.saved_searches CASCADE;
DROP TABLE IF EXISTS public.search_alerts CASCADE;
```

### 2.5 Nova migração: Remover Fase 19 (Caução) e Fase 21 (Push)

**Arquivo:** `src/db/migrations/0037_remove_deposits_push.sql`

```sql
-- Removido por Neighbor-BR V2
DROP TABLE IF EXISTS public.security_deposits CASCADE;
DROP TABLE IF EXISTS public.deposit_refunds CASCADE;
DROP TABLE IF EXISTS public.push_subscriptions CASCADE;
DROP TABLE IF EXISTS public.push_messages CASCADE;
ALTER TABLE public.users DROP COLUMN IF EXISTS push_enabled;
ALTER TABLE public.users DROP COLUMN IF EXISTS push_subscription_json;
```

### 2.6 Nova migração: Remover Fase 23 (Compatibilidade, lista, etc.)

**Arquivo:** `src/db/migrations/0038_remove_phase23_extra.sql`

```sql
-- Removido por Neighbor-BR V2
DROP TABLE IF EXISTS public.compatibility_scores CASCADE;
DROP TABLE IF EXISTS public.rental_suggestions CASCADE;
DROP TABLE IF EXISTS public.rental_waitlist CASCADE;
ALTER TABLE public.spaces DROP COLUMN IF EXISTS compatibility_enabled;
-- Remove views de relatório
DROP VIEW IF EXISTS public.landlord_performance_report CASCADE;
DROP VIEW IF EXISTS public.monthly_summary CASCADE;
```

---

## 3. Código TypeScript (src/)

### 3.1 Diretórios a remover (inteiros)

```
src/lib/ai/
  ├── classification.ts       (Fase 16 — IA de padrão)
  └── suggestions.ts          (Fase 17 — IA de sugestão de valor)

src/lib/alerts/
  ├── saved-search.ts
  ├── email-alerts.ts
  └── cron-handler.ts         (Fase 18 — alertas agendados)

src/lib/verification/
  ├── phone.ts                (Fase 5 — SMS Twilio)
  └── kyc.ts                  (remover lógica SMS, manter schema)

src/lib/bank/
  ├── transfers.ts            (Fase 7-8 — banco do proprietário)
  └── webhooks.ts

src/lib/deposits/
  ├── security.ts             (Fase 19 — caução)
  └── refunds.ts

src/lib/push/
  ├── subscriptions.ts        (Fase 21 — push no celular)
  ├── messages.ts
  └── service-worker.ts

src/lib/compatibility/
  ├── scoring.ts              (Fase 23 — compatibilidade)
  ├── suggestions.ts
  └── waitlist.ts

src/app/api/kyc/
src/app/api/bank/
src/app/api/alerts/
src/app/api/deposits/
src/app/api/push/
src/app/api/ai/suggest         (sugestão de valor)
src/app/api/compatibility/
src/app/api/waitlist/

✅ MANTÉM:
src/lib/premium/              (Premium continua)
src/app/api/premium/          (Premium continua)
src/lib/featured.ts           (Destaques/Turbo continua)
src/app/api/featured/         (Destaques/Turbo continua)
```

### 3.2 Arquivos a adaptar

| Arquivo | Mudança |
|---------|---------|
| `src/lib/auth/dal.ts` | Remover checks de subscription_status, verificação |
| `src/lib/rentals/pricing.ts` | ✅ Manter (já é V2) |
| `src/lib/money.ts` | ✅ Manter (mesma) |
| `src/lib/env.ts` | Remover credenciais de: Twilio, IA/Anthropic (opcional), push VAPID |
| `src/lib/db.ts` | Remover import de tabelas removidas |
| `src/proxy.ts` | Remover rotas de: `/api/premium/*`, `/api/kyc/*`, `/api/alerts/*` |
| `scripts/verify-schema.ts` | Atualizar checagens para não permitir tabelas removidas |
| `scripts/verify-*.ts` | Remover verificações específicas de features removidas |

### 3.3 Arquivos que mantêm (Premium, Destaques)

| Arquivo | Mudança |
|---------|---------|
| `src/lib/premium/subscriptions.ts` | ✅ **MANTÉM** — assinatura mensal, tiers, benefícios |
| `src/lib/featured.ts` | ✅ **MANTÉM** — Destaques/Turbo avulso ou recorrente |
| `src/lib/messaging/detector.ts` | ✅ Manter — detector de contato para segurança |

---

## 4. Páginas e rotas (src/app/)

### 4.1 Páginas a remover vs. manter

```
REMOVE:
src/app/(app)/
├── descoberta/                  ❌ (Fase 23 — busca por necessidade com IA)
├── alertas/                     ❌ (Fase 18 — alertas agendados)
├── (account)/
│   ├── verificacoes/            ❌ (Fase 5 — SMS Twilio)
│   └── banco/                   ❌ (Fase 7-8)
└── admin/
    └── caucao/                  ❌ (Fase 19)

MANTÉM:
✅ meus-alugueis/                (Parte 12)
✅ minha-conta/seguranca/        (segurança)
✅ minha-conta/premium/          (Premium continua)
✅ premium/                       (página de Premium)
✅ destaques/                     (Destaques/Turbo)
✅ admin/moderation/             (fila de moderação)
✅ admin/home                     (dashboard admin)
```

### 4.2 Componentes a adaptar

| Componente | Mudança |
|------------|---------|
| `/anunciar` | Remover campo "compatibilidade" da etapa 5 |
| `/espaco/[id]` | Remover seção de "compatibilidade com você" |
| `/meus-espacos` | Manter; remover aba de Premium |
| `/meus-alugueis` (Parte 12) | ✅ Manter (mesma) |
| `/checkout` | ✅ Manter; remover opção de Premium |

### 4.3 API routes a remover

```
/api/kyc/*                       ❌ (SMS Twilio)
/api/bank/*                      ❌ (banco do proprietário)
/api/alerts/*                    ❌ (alertas agendados)
/api/deposits/*                  ❌ (caução)
/api/push/*                      ❌ (push no celular)
/api/ai/classify                 ❌ (IA de padrão)
/api/ai/suggest-value            ❌ (IA de sugestão)
/api/compatibility/*             ❌ (compatibilidade)
/api/waitlist/*                  ❌ (lista de espera)
```

### 4.4 API routes a manter

```
✅ MANTÉM:
/api/auth/*                      (autenticação)
/api/spaces/                     (anúncios)
/api/rental/*                    (Parte 12 — reserva por tempo/mensal)
/api/bookings/*                  (reservas simples)
/api/conversations/              (chat)
/api/ratings/                    (avaliações)
/api/premium/*                   (Premium — assinatura mensal)
/api/featured/*                  (Destaques/Turbo — destaque avulso)
/api/webhooks/asaas              (webhooks de pagamento)
/api/reports/                    (denúncias)
/api/blocks/                     (bloqueios)
```

---

## 5. Dependências e integrações

### 5.1 Remover

```json
{
  "@anthropic-ai/sdk": "^0.128.0",  // Remover (sem IA de padrão / sugestão)
  "twilio": "^4.x",                 // Remover (sem SMS de verificação)
  "web-push": "^3.6.7"              // Remover (sem push no celular)
}
```

### 5.2 Manter

```json
{
  "@supabase/supabase-js": "^2.116.0",
  "drizzle-orm": "^0.45.2",
  "postgres": "^3.4.9",
  "next": "16.3.5",
  "react": "19.2.8",
  "zod": "^4.6.5"
}
```

**Nota:** Asaas SDK já está em uso e continua (pagamentos Premium + Parte 12)

---

## 6. Variáveis de ambiente (ENV)

### 6.1 Remover

```
NEXT_PUBLIC_ANTHROPIC_API_KEY   (se existir)
ANTHROPIC_API_KEY
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_SERVICE_SID
NEXT_PUBLIC_VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
NEXT_PUBLIC_CRON_SECRET
VERCEL_CRON_SECRET
```

### 6.2 Manter

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ASAAS_API_KEY
ASAAS_ENVIRONMENT (sandbox|production)
NEXT_PUBLIC_MAPLIBRE_TOKEN
```

---

## 7. Testes (scripts/verify-*.ts)

### 7.1 Remover verificações de:

- Fases 5, 7, 8 (KYC, banco)
- Fase 13 (Premium, tiers)
- Fase 16, 17 (IA)
- Fase 18 (alertas)
- Fase 19 (caução)
- Fase 21 (push)
- Fase 23 (compatibilidade, lista, etc.)

### 7.2 Guardar verificações de:

- Fase 1 (autenticação, banco)
- Fase 2 (anúncio, fotos)
- Fase 3 (busca, mapa)
- Fase 4 (reserva mensal)
- Fase 6 (chat)
- Fase 9 (avaliações)
- Fases 19-21 (confiança básica: documento)
- Segurança (denúncias, bloqueios)
- Parte 12 (unidades, aluguel flexível)

### 7.3 Nova verificação: `verify-neighbor.ts`

```typescript
// Checagem que nenhuma tabela/campo/rota da V1 sobreviveu
checks: [
  "Sem phone_verifications",
  "Sem subscription_status em users",
  "Sem premium.ts em lib/",
  "Sem /api/premium/*",
  "Sem /api/alerts/*",
  // ... etc
]
```

---

## 8. Procedimento de execução

### 8.1 Ordem de remoção (por camada)

1. **Enum + tipos:** remover `premium_tier`, `verification_status`, etc. de `src/db/schema/enums.ts`
2. **Schema:** aplicar migrações 0033-0038 em ordem
3. **Código:** remover diretórios inteiros de `src/lib/` (AI, alerts, premium, etc.)
4. **API:** remover rotas em `src/app/api/`
5. **Páginas:** remover componentes e roteadores
6. **Testes:** remover e atualizar scripts de verificação
7. **Dependências:** remover de `package.json`, rodar `pnpm install`
8. **Build e verificação:** `pnpm typecheck && pnpm lint && pnpm build`

### 8.2 Checklist de conclusão

```
[ ] Todas as migrações aplicadas (0033-0038)
[ ] Nenhuma tabela removida existe no banco
[ ] Nenhum import de módulo removido em src/
[ ] Nenhuma rota de API removida acessível
[ ] Nenhuma página removida renderizável
[ ] pnpm typecheck passa (zero erros)
[ ] pnpm lint passa
[ ] pnpm build passa
[ ] pnpm verify passa (zero checks falhando)
[ ] pnpm verify:neighbor passa (nova verificação)
```

---

## 9. Rollback

Se precisar voltar (alterar decisão):

```bash
git revert <commit-de-uma-migração>
# e rodar migration backwards (se tiver sido versionada)
```

---

Pronto para refatoração em nova conversa.
