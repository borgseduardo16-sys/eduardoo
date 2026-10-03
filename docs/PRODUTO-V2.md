# Produto V2 — MyPlace com estrutura Neighbor Brasil

**Data:** 3 de outubro de 2026  
**Status:** Especificação para refatoração  
**Âncora técnica:** Commit b9bb4db (congelamento pré-Neighbor)

---

## 1. O que mudou

V1 (zero-to-one) foi invenção pura: sistema completo com IA, alertas, caução, lista de espera, compatibilidade — algumas coisas criaram complexidade que parou de funcionar direito.

V2 (Neighbor Brasil) **mantém o que funciona** (Premium, Turbo, Destaques, avaliações, confiança) e **se inspira em Neighbor para o padrão de pagamento e regras de concorrência**, removendo só o que virou problema:

- **Um fluxo principal:** anúncio → busca → reserva → aceite do proprietário → cobrança → entrega (igual Neighbor, validado)
- **Horários flexíveis:** mensal contínuo, ou hora/dia/semana temporário (Parte 12 já existe)
- **Features simples que ficam:** Turbo, Premium, Destaques, chat, avaliações, confiança básica, segurança
- **Sem complexidade que quebrou:** nada de alertas agendados, caução, compatibilidade, lista de espera

---

## 2. Modelo de negócio

### 2.1 Core rental

**Proprietário:**
1. Cria anúncio (tipo, fotos, endereço, unidades, regras de tempo/preço)
2. Vê reservas recebidas
3. Aceita ou nega dentro de janela (padrão: 24h)
4. Recebe dinheiro uma vez (cobrança aceita = transferência)

**Locatário:**
1. Busca por endereço/mapa
2. Vê fotos, preço, unidades disponíveis
3. Escolhe unidade, datas, monta o reserva
4. Paga (Pix, débito, crédito)
5. Espera o aceite do proprietário
6. Acessa o endereço (se aceito)
7. Renova a reserva ou deixa encerrar

### 2.2 Cobrança

- **Mensal:** Pix/débito/crédito único na criação da reserva
- **Hora/dia/semana:** Pix/débito/crédito único na criação
- **Renovação automática:** apenas para mensal contínuo, com janela de 40 min + 1 h (já pronta em Parte 12)
- **Sem recorrência:** sem assinatura mensal do Premium; Premium não existe

### 2.3 Mantém + Remove

**MANTÉM (funciona, não quebra nada):**
- Premium (Fase 13) — sistema de tiers, assinatura mensal, benefícios
- Destaques/Turbo (Fase 14) — compra avulsa ou destaque recorrente, é simples
- Avaliações (Fase 15) — 5 estrelas, ambos os lados
- Confiança básica (Fases 19-21) — documento verificado, perfil público, bloqueios
- Segurança (todas as fases) — denúncias, detector de contato, RLS

**REMOVE (criou complexidade que parou):**
- IA de classificação de padrão (Fase 16) — removida
- IA de sugestão de valor por histórico (Fase 17) — removida
- Alertas agendados (Fase 18) — removidos (nenhum cron)
- Caução (Fase 19) — removida
- Push no celular (Fase 21) — removida
- Compatibilidade e match % (Fase 23) — removidas
- Lista de espera (Fase 23) — removida
- Painel de desempenho complexo (Fase 23) — removido
- Relatório mensal (Fase 23) — removido
- Compartilhamento de anúncio (Fase 23) — removido
- Busca por necessidade + IA (Fase 23) — removida

---

## 3. Features que ficam

### 3.1 Funcionalidade de marketplace

| Feature | Fase original | Status V2 | Nota |
|---------|---|---|---|
| Autenticação | 1 | ✅ Mantém (mesma) | Supabase Auth, confirmação de e-mail |
| Anúncio + publicação | 2 | ✅ Mantém (core) | 8 etapas, remover só campo de compatibilidade |
| Fotos | 2 | ✅ Mantém (mesma) | Upload, remoção de EXIF, miniatura |
| Busca | 3 | ✅ Mantém (core) | Por localização, mapa com pins, sem alertas agendados |
| Reserva mensal | 4 | ✅ Mantém (core) | Fluxo completo: criar → aceitar → pagar (padrão Neighbor) |
| Chat | 6 | ✅ Mantém (core) | Mensagens entre usuários |
| Avaliações (5 estrelas) | 9 | ✅ Mantém (core) | Após reserva encerrar, ambos os lados |
| **Premium + tiers** | 13 | ✅ **MANTÉM** | Sistema de assinatura mensal, benefícios, integração com Asaas |
| **Destaques/Turbo** | 14 | ✅ **MANTÉM** | Compra avulsa ou recorrente, mostra antes na busca, simples |
| Confiança (perfil, verificações) | Fases 19-21 | ✅ Mantém (simples) | Documento verificado (KYC Asaas), perfil público — sem SMS, sem push |
| Segurança interna | Segurança | ✅ Mantém (mesma) | Denúncias, detector de contato, RLS, bloqueios |
| Unidades | Parte 12 | ✅ Mantém (mesma) | Grupos de unidades, label, posição |
| Aluguel por hora/dia/semana | Parte 12 | ✅ Mantém (mesma) | Com regras de horário de funcionamento |
| Pagamento pendente + renovação | Parte 12 | ✅ Mantém (mesma) | 40 min + 1 h de janela, Pix único, padrão Neighbor |
| Meus aluguéis (locatário) | Parte 12 | ✅ Mantém (mesma) | Listar, renovar, cancelar |
| Meus anúncios (proprietário) | N/A (novo) | ✅ Novo | Painel: criar, listar, reservas pendentes, aceitar/negar, encerrar |

### 3.2 Integrações

| Sistema | V1 | V2 | Nota |
|---------|---|---|---|
| Asaas | Fases 5-8, 13-14, Parte 12 | ✅ Mantém (core) | Pagamento + cobrança recorrente (renovação) |
| Supabase | Fase 1 | ✅ Mantém (mesma) | Auth + Postgres + RLS |
| Anthropic API | Fase 16 (IA) | ❌ Remove | Sem classificação de padrão, sem sugestão de valor |
| Twilio | Fase 19 | ❌ Remove | Sem SMS de verificação |
| Web.dev Push API | Fase 19 | ❌ Remove | Sem push no celular |
| Sentry | Fase 1 | ✅ Mantém (opcional) | Logs de erro em produção |

---

## 4. O que remove (apenas o que virou problema)

**Remover completamente:**
- **Fase 5:** Lógica de SMS Twilio Verify — **manter só schema de documento verificado** (KYC do Asaas preenche)
- **Fase 7:** Banco de dados do proprietário (`person_bank_data`) — Neighbor não tem isso
- **Fase 8:** Depósito bancário prévio — Neighbor cobra na hora
- **Fase 16:** IA de classificação de padrão do espaço
- **Fase 17:** IA de sugestão de valor por histórico
- **Fase 18:** Alertas agendados (tabelas, cron do Vercel) — ninguém usa
- **Fase 19:** Caução (tabelas, lógica, triggers)
- **Fase 21:** Push no celular (VAPID, Service Worker, tabelas)
- **Fase 23 (maioria):** Compatibilidade, match %, lista de espera, busca por necessidade com IA, painel de desempenho, relatório mensal, compartilhamento, espaços semelhantes, histórico público

**Manter (não mexe):**
- **Fase 2:** Remover só o campo "compatibilidade" do formulário (Etapa 5)
- **Fase 13:** Premium, Destaques, Turbo, tiers, assinatura mensal — **tudo permanece**
- **Fase 14:** Compra avulsa de destaque — **permanece**
- **Fase 23:** Renovação automática de reserva mensal (Parte 12) — **permanece**

---

## 5. Tabelas a remover vs. manter

### Remove (IA, alertas, caução, push)

```sql
-- Fase 5: SMS Twilio Verify
DROP TABLE IF EXISTS phone_verifications CASCADE;

-- Fase 7: Banco do proprietário
DROP TABLE IF EXISTS person_bank_data CASCADE;

-- Fase 8: Depósito bancário
DROP TABLE IF EXISTS bank_transfers CASCADE;

-- Fase 16: IA de padrão
DROP TABLE IF EXISTS listing_space_class CASCADE;
DROP TABLE IF EXISTS space_class_suggestions CASCADE;

-- Fase 17: IA de sugestão de valor
DROP TABLE IF EXISTS comparable_spaces CASCADE;

-- Fase 18: Alertas agendados
DROP TABLE IF EXISTS saved_searches CASCADE;
DROP TABLE IF EXISTS search_alerts CASCADE;

-- Fase 19: Caução
DROP TABLE IF EXISTS security_deposits CASCADE;
DROP TABLE IF EXISTS deposit_refunds CASCADE;

-- Fase 21: Push no celular
DROP TABLE IF EXISTS push_subscriptions CASCADE;
DROP TABLE IF EXISTS push_messages CASCADE;

-- Fase 23: Compatibilidade e features complexas
DROP TABLE IF EXISTS compatibility_scores CASCADE;
DROP TABLE IF EXISTS rental_waitlist CASCADE;
DROP TABLE IF EXISTS listing_price_history CASCADE;
DROP TABLE IF EXISTS rental_suggestions CASCADE;
```

### **MANTÉM** (Premium, Destaques, core)

```
✅ user_subscriptions (Premium — tiers, assinatura mensal)
✅ premium_features (benefícios do Premium)
✅ pricing_tiers (tiers: basic, pro, etc.)
✅ listing_featured (Destaques/Turbo — avulso ou recorrente)
✅ listings_featured_history (histórico de ativações)
✅ user_documents (documento verificado do KYC Asaas)
✅ rentals (reservas — Parte 12 com unidades)
✅ space_unit_groups + space_units (grupos + unidades)
✅ ratings (avaliações)
✅ conversations + messages (chat)
✅ reports + blocks (segurança)
✅ transactions (livro-razão)
```

---

## 6. Schema para V2

**MANTÉM (core + Premium + Destaques):**
- `users` (autenticação, perfil, documento KYC)
- `spaces` (anúncios)
- `space_unit_groups` (grupos com regras de tempo/preço)
- `space_units` (unidades individuais)
- `space_photos` (fotos)
- `space_features` (amenidades)
- `user_subscriptions` ✅ (Premium — tiers, assinatura mensal)
- `premium_features` ✅ (benefícios: selo, destaque, etc.)
- `pricing_tiers` ✅ (tiers de preço)
- `listings_featured` ✅ (Destaques — avulso ou recorrente)
- `rentals` (Parte 12: reservas, unidade, período, preço, estado)
- `conversations` (chat)
- `messages` (mensagens)
- `ratings` (5 estrelas)
- `reports` (denúncias)
- `blocks` (bloqueios)
- `transactions` (livro-razão)
- `user_documents` (documento verificado)
- `webhooks_asaas` (logs de webhook)

**REMOVE (IA, alertas, caução, push, banco):**
- Tudo em §5

---

## 7. Fluxo principal (V2)

### 7.1 Criar anúncio

1. `/anunciar` → 8 etapas (mesmas, mas sem campo de compatibilidade)
2. Dados vão para `spaces` + `space_unit_groups` + `space_units` + `space_photos`
3. Geolocalização automática e obfuscação já existem
4. Fotos com remoção de EXIF, miniatura, compressão já existem

### 7.2 Buscar e reservar

1. `/espacos` → mapa + lista com filtro por localização
2. Clique em um anúncio → `/espaco/[id]` → fotos, detalhes, unidades disponíveis
3. Escolher unidade, data início/fim, cálculo do preço → botão "Reservar"
4. Página de checkout: resumo, termos, pagar (Asaas)
5. POST `/api/rental/create` → registra `rentals` (estado: `pending_landlord`)
6. Webhook do Asaas confirma pagamento → estado: `payment_confirmed`

### 7.3 Proprietário aceita/nega

1. `/meus-espacos` → "Reservas pendentes"
2. Clique em reserva → modal com detalhes + botões "Aceitar" / "Negar"
3. Aceitar → estado: `accepted`; locatário recebe endereço exato
4. Negar → estado: `denied`; locatário recebe reembolso (Asaas reversa)

### 7.4 Renovação (mensal contínuo)

1. Locatário vê em `/meus-alugueis` contagem regressiva: "Renova em 40 min"
2. Clique "Renovar" → cria novo `rental` com estado `payment_pending` (Parte 12)
3. Webhook do Asaas confirma → estado: `payment_confirmed`
4. Proprietário aprova (mesma lógica)

### 7.5 Encerrar reserva

1. Locatário ou proprietário clica "Encerrar aluguel"
2. Estado muda para `completed`
3. Ambos podem avaliarem-se (5 estrelas)

---

## 8. Risco de legado involuntário

**Vetores principais:**

1. **Código fantásma:** funções que só IA chamava (padrão → "simple", sugestão de valor → remove)
2. **Campos fantasma:** usuario.subscription_status, rental.compatibility_score, space.class_id
3. **Endpoints fantasma:** GET /api/suggests/value, POST /api/alerts/create
4. **Migrações antigas:** 0025+ trazem Fase 23 inteira (compatibilidade, alertas, etc.)

**Como evitar:**

- **Tag + congelamento:** este commit (b9bb4db) fica marcado como `pre-neighbor`
- **Remoção explícita:** cada DROP/DELETE numa migração nova tem comentário "Removido por Neighbor-BR"
- **Verificação:** `scripts/verify-*` atualizado para recusar tabelas/campos/tipos não permitidos

---

## 9. Próximas etapas

1. ✅ **Esta especificação** (PRODUTO-V2.md) — fonte única de verdade
2. **Inventário por camada** → quais tabelas/módulos/páginas mudam
3. **Nova branch** (`claude/neighbor-v2-refactor` ou similar)
4. **Nova conversa** com prompt que carrega PRODUTO-V2.md
5. **Refatoração em fatias** (por exemplo: remover Fase 13 inteira, depois 16, etc.)
6. **Testes** — cada fase removida tem seu próprio teste que deve passar
7. **Migração SQL** — aplicar no banco
8. **Deploy** — em staging com este banco novo

---

## 10. Decisões pendentes do usuário

1. **Asaas e dados reais:** O Supabase tem dados reais de usuários e anúncios, ou só teste?
2. **Escopo mínimo:** Unidades e hora/dia/semana entram já na V2, ou depois que o miolo mensal (reserva → aceite → cobrança) está limpo e testado?
3. **Destaques/Turbo/Premium:** Manter como "destacado avulso" (simples) ou remover completamente?

---

Congelar referência e começar refatoração em NOVA conversa.
