# Produto V2 — MyPlace como Neighbor Brasil

**Data:** 3 de outubro de 2026  
**Status:** Especificação para refatoração  
**Âncora técnica:** Commit b9bb4db (congelamento pré-Neighbor)

---

## 1. O que mudou

V1 (zero-to-one) foi invenção pura: sistema completo com IA, Premium, alertas, caução, lista de espera, compatibilidade.

V2 (Neighbor Brasil) corta escopo radical e foca no núcleo funcional validado nos EUA, adaptado para Brasil:
- **Um fluxo principal:** anúncio → busca → reserva → aceite do proprietário → cobrança → entrega
- **Horários flexíveis:** mensal contínuo, ou hora/dia/semana temporário (Parte 12 já existe)
- **Sem complexidade especulativa:** nada de alertas agendados, caução, compatibilidade, Premium, listas

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

### 2.3 Sem a V1

**Removido:**
- Premium (Fase 13) — nunca vai existir; Destaques/Turbo/Pro viram "anúncio destacado" simples
- IA (Fases 5, 8, 16, 17) — remoção ou alternativa sem IA
- Alertas agendados (Fase 18, parcial) — nenhum cron
- Caução (Fase 19) — removida
- Lista de espera (Fase 23, parcial) — removida
- Compatibilidade (Fase 23, parcial) — removida
- Avaliações de compatibilidade — removidas
- Histórico de preço para públicos — removido (usa-se só histórico de transação da própria reserva)
- Painel de desempenho (Fase 23) — removido ou simplificado
- Relatório mensal (Fase 23) — removido
- Compartilhamento de anúncio (Fase 23) — removido

---

## 3. Features que ficam

### 3.1 Funcionalidade de marketplace

| Feature | Fase original | Status V2 | Nota |
|---------|---|---|---|
| Autenticação | 1 | ✅ Mantém (mesma) | Supabase Auth, confirmação de e-mail |
| Anúncio + publicação | 2 | ✅ Mantém (simplificado) | 8 etapas, mas sem campo de compatibilidade |
| Fotos | 2 | ✅ Mantém (mesma) | Upload, remoção de EXIF, miniatura |
| Busca | 3 | ✅ Mantém (core) | Por localização, mapa com pins, sem alertas agendados |
| Reserva mensal | 4 | ✅ Mantém (core) | Fluxo completo: criar → aceitar → pagar |
| Chat | 6 | ✅ Mantém (simplificado) | Mensagens entre usuários, sem denúncia de assédio por IA |
| Avaliações (5 estrelas 1 via) | 9 | ✅ Mantém (core) | Após reserva encerrar, ambos os lados |
| Confiança (perfil, verificações) | Fases 19-21 | 🟡 Parcial | Só documento (KYC Asaas), sem SMS Twilio, sem push — verificação pública só "documento verificado" |
| Segurança interna | Segurança | ✅ Mantém (mesma) | Denúncias, detector de contato, RLS, bloqueios |
| Unidades | Parte 12 | ✅ Mantém (mesma) | Grupos de unidades, label, posição |
| Aluguel por hora/dia/semana | Parte 12 | ✅ Mantém (mesma) | Com regras de horário de funcionamento |
| Pagamento pendente + renovação | Parte 12 | ✅ Mantém (mesma) | 40 min + 1 h de janela, Pix único |
| Meus aluguéis (locatário) | Parte 12 | ✅ Mantém (mesma) | Listar, renovar, cancelar |
| Meus anúncios (proprietário) | N/A (novo) | ✅ Novo | Painel simples: criar, listar, reservas pendentes, aceitar/negar, encerrar |

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

## 4. Removals por fase

### Fases inteiras (remove código + banco)
- **Fase 5:** KYC Twilio Verify e IA de documento — **remover lógica de SMS, manter só schema de documento verificado** (preenche Asaas via KYC quando Asaas fizer)
- **Fase 7:** Pré-aprovação bancária — **removida completamente** (schema de `person_bank_data`, formulário de dados bancários)
- **Fase 8:** Dépósito bancário e SMS — **removida completamente** (tabelas, rotas, scripts)
- **Fase 13:** Premium, Destaques, Turbo — **remover assinatura, manter só "simples" e "destacado avulso"** (remover tiers mensais; manter 1 tabela: `listing_boost` com data_inicio, duracao_dias, status; sem recorrência)
- **Fase 16:** Classificação de padrão por IA — **remover completamente** (schema, rotas, modelo de classificação)
- **Fase 17:** Sugestão de valor por IA ou histórico — **remover sugestão por IA; manter só "comparáveis" sem IA** ou remover completamente
- **Fase 18:** Alertas agendados (cron) — **remover tabela `saved_search_alerts`, remover endpoint de cron** (manter só a UI "salvar busca" sem alertas)
- **Fase 19:** Caução — **remover completamente** (tabelas, lógica de depósito, devolução, trigger)
- **Fase 21:** Push no celular — **remover completamente** (Service Worker, tabelas de tokens)
- **Fase 23:** Busca por compatibilidade, lista de espera, painel de desempenho, relatório mensal, compartilhar, espaços semelhantes, histórico de preço público — **remover as tabelas correspondentes**

### Fases parciais (remover features, manter core)
- **Fase 23 (parcial):** Manter renovação automática (Parte 12), remover resto

### Fases que viram "simples"
- **Fase 2:** Remover campo "compatibilidade" do formulário de anúncio
- **Fase 13 (Destaques):** Remover tiers Premium/Turbo; manter "simples" + opção de "destacar agora" por X dias (avulso, sem recorrência)

---

## 5. Tabelas a remover

```sql
-- Fase 5: Verificação e KYC
DROP TABLE IF EXISTS phone_verifications CASCADE;
-- (manter: user_document_verified from person_documents)

-- Fase 7: Banco
DROP TABLE IF EXISTS person_bank_data CASCADE;

-- Fase 8: Depósito bancário
DROP TABLE IF EXISTS bank_transfers CASCADE;

-- Fase 13: Premium
DROP TABLE IF EXISTS user_subscriptions CASCADE;
-- (manter: listing_featured simples, sem recorrência)

-- Fase 16: IA de padrão
DROP TABLE IF EXISTS listing_space_class CASCADE;
DROP TABLE IF EXISTS space_class_suggestions CASCADE;

-- Fase 17: Sugestão de valor
DROP TABLE IF EXISTS comparable_spaces CASCADE;
-- (ou DROP completamente se quer sem sugestão alguma)

-- Fase 18: Alertas
DROP TABLE IF EXISTS saved_searches CASCADE;
DROP TABLE IF EXISTS search_alerts CASCADE;

-- Fase 19: Caução
DROP TABLE IF EXISTS security_deposits CASCADE;
DROP TABLE IF EXISTS deposit_refunds CASCADE;

-- Fase 21: Push
DROP TABLE IF EXISTS push_subscriptions CASCADE;
DROP TABLE IF EXISTS push_messages CASCADE;

-- Fase 23: Compatibilidade, lista, histórico
DROP TABLE IF EXISTS compatibility_scores CASCADE;
DROP TABLE IF EXISTS rental_waitlist CASCADE;
DROP TABLE IF EXISTS listing_price_history CASCADE;
DROP TABLE IF EXISTS rental_suggestions CASCADE;

-- Remove views de desempenho, relatórios, etc.
```

---

## 6. Schema mínimo para V2

**Mantém:**
- `users` (autenticação, perfil básico, documento)
- `spaces` (anúncios)
- `space_unit_groups` (grupos de unidades com regras de tempo/preço)
- `space_units` (unidades individuais)
- `space_photos` (fotos dos anúncios)
- `space_features` (amenidades)
- `listings_featured` (muito simples: listing_id, tipo "simple" ou "featured", data_inicio, dias, status — sem recorrência)
- `rentals` (Parte 12: reservas com unidade, período, modo contínuo/temporário, preço total, estado)
- `conversations` (chat)
- `messages` (mensagens do chat)
- `ratings` (5 estrelas)
- `reports` (denúncias)
- `blocks` (bloqueios entre usuários)
- `transactions` (livro-razão)
- `webhooks` (Asaas)

**Remove:**
- Tudo mencionado em §5

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
