# Status honesto do projeto

> **Atualizado em:** 16/09/2026 · **Fase concluída:** 1 de 12

Estados usados:

| Estado | Significado |
|--------|-------------|
| ✅ **IMPLEMENTADO** | Funciona e foi testado |
| ⚙️ **CONFIGURADO** | Estrutura pronta, falta credencial real |
| 🔑 **PRECISA DA SUA AÇÃO** | Bloqueado esperando você criar conta ou chave |
| ⬜ **NÃO IMPLEMENTADO** | Ainda não existe |
| 🚧 **BLOQUEADO POR SERVIÇO EXTERNO** | Depende de terceiro |
| ⚠️ **NÃO SEGURO PARA PRODUÇÃO** | Existe, mas não pode ir ao ar assim |

---

## Fase 1 — Arquitetura, banco e autenticação ✅

| Item | Estado | Observação |
|------|--------|------------|
| Projeto Next.js 16 + TypeScript strict | ✅ | `pnpm build` passa limpo |
| Design system próprio | ✅ | Tokens OKLCH, claro/escuro, `globals.css` |
| Modelo de dados (21 tabelas) | ✅ | `src/db/schema/` |
| Migrações versionadas | ✅ | Aplicadas contra Postgres 16 + PostGIS 3.4 real |
| Índices geoespaciais | ✅ | GIST sobre `(location::geography)` — busca por raio testada |
| Invariantes financeiras no banco | ✅ | Total adulterado é recusado pelo Postgres |
| Livro-razão append-only | ✅ | Trigger bloqueia UPDATE e DELETE |
| Idempotência de webhook | ✅ | Chave única por evento |
| Regras anti-avaliação-falsa | ✅ | Três camadas, testadas |
| RLS em todas as tabelas | ✅ | Negar por padrão |
| Cálculo de valores no servidor | ✅ | `src/lib/money.ts` |
| Cadastro, login, recuperação de senha | ✅ | Supabase Auth |
| Confirmação de e-mail | ✅ | Rotas de callback prontas |
| Autorização por papel | ✅ | `src/lib/auth/dal.ts` |
| Proteção de rotas | ✅ | `src/proxy.ts` — testado com requisição real |
| Proteção contra open redirect | ✅ | Testado |
| Página inicial | ✅ | Busca e geolocalização reais |
| Geolocalização do navegador | ✅ | Trata recusa com mensagem clara e alternativa manual |
| Verificação automatizada do banco | ✅ | 28 checagens — `pnpm tsx scripts/verify-schema.ts` |
| **Rate limiting** | ⚠️ | Em memória. **Não funciona em serverless.** Ver §Riscos |
| Credenciais do Supabase | 🔑 | [SETUP.md §1](./SETUP.md#1-supabase--banco-autenticação-e-arquivos) |

---

## Fases 2 a 12 — ⬜ não implementadas

| Fase | Escopo | Depende de |
|------|--------|-----------|
| 2 | Criação de anúncios (9 etapas, upload de fotos) | Bucket do Supabase |
| 3 | Busca, filtros, mapa, geolocalização | MapTiler + Geocoding |
| 4 | Página do anúncio e favoritos | — |
| 5 | Reserva e aluguel | — |
| 6 | Chat e notificações | Resend |
| 7 | Pagamento real | **Conta Asaas** |
| 8 | Repasse real ao proprietário | **KYC aprovado no Asaas** |
| 9 | Painel do proprietário | Fase 7 |
| 10 | Painel do locatário | Fase 7 |
| 11 | Painel administrativo | — |
| 12 | Segurança, testes e preparação para produção | Upstash + Sentry |

As telas de `/buscar` e `/anunciar` existem e **dizem explicitamente que ainda
não funcionam**, listando o que falta. Não há dado de exemplo em lugar nenhum
que possa ser confundido com dado real.

---

## O que NÃO existe (e não vai aparecer por engano)

- ❌ Nenhum botão de "pagar"
- ❌ Nenhum pagamento simulado ou tela de sucesso sem cobrança
- ❌ Nenhum anúncio de exemplo no banco
- ❌ Nenhuma localização inventada
- ❌ Nenhum chat falso
- ❌ Nenhuma avaliação fabricada

O banco começa vazio, exceto pelas taxas da plataforma e pelo catálogo de 20
características — que são configuração, não conteúdo fictício.

---

## Riscos conhecidos

### ⚠️ 1. Rate limiting não serve para produção

`src/lib/rate-limit.ts` mantém contadores **em memória**. Em serverless cada
instância tem o próprio mapa, então o limite real vira (limite × instâncias).

**Impacto:** proteção contra força bruta no login é ilusória.
**Solução:** Upstash Redis ([SETUP.md §6](./SETUP.md#6-upstash--rate-limiting-antes-de-produção)).
**Mitigação atual:** o Supabase Auth aplica limites próprios do lado dele.

### ⚠️ 2. A margem do modelo 2%+2% não cobre cartão

Em aluguel de R$ 180/mês sobram **R$ 1,22** no cartão de crédito (0,68%).
Abaixo de ~R$ 50/mês a plataforma **perde dinheiro** em toda transação.

Está tudo calculado em [PAGAMENTOS.md §3](./PAGAMENTOS.md#3-a-economia-real-do-modelo-2--2).
Já existe mínimo de R$ 50 configurado. **É decisão de negócio, não bug** — mas
precisa ser decisão consciente.

### ⚠️ 3. Split + Pix Automático não confirmado

Os dois recursos são documentados pelo Asaas separadamente; não achei
confirmação de que funcionam **juntos**. É a primeira pergunta para o gerente.

### ⚠️ 4. Sem monitoramento de erro

Sentry não integrado. Em produção você descobriria falhas pelo cliente.

### ⚠️ 5. Sem testes de interface

Há 28 checagens reais de banco, mas nenhum teste de UI (Playwright/Vitest).
Fase 12.

### ⚠️ 6. Sem documentos jurídicos

Termos de Uso, Política de Privacidade, LGPD, regras de cancelamento,
reembolso e disputa **não existem** e **não devem ser escritos por mim**.

Você opera intermediação de pagamento entre terceiros e trata dado pessoal —
inclusive CPF e localização. Isso exige advogado com experiência em marketplace
e LGPD. Não é formalidade; é o que te protege se algo der errado entre duas
pessoas que se conheceram pela sua plataforma.

---

## Como verificar você mesmo

```bash
pnpm install
pnpm db:migrate                      # aplica o schema
pnpm tsx scripts/verify-schema.ts    # 28 checagens contra o banco real
pnpm typecheck                       # TypeScript strict
pnpm lint
pnpm build
pnpm dev                             # http://localhost:3000
```

O `verify-schema.ts` não testa "se o código roda" — ele **tenta gravar dado
inválido e confirma que o banco recusa**. É a diferença entre dizer que a regra
existe e mostrar que ela funciona.
