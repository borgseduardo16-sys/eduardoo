# Status honesto do projeto

> **Atualizado em:** 17/09/2026 · **Fase concluída:** 1 de 12 + segurança interna

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
| Verificação automatizada do banco | ✅ | 29 checagens — `pnpm tsx scripts/verify-schema.ts` |
| **Rate limiting** | ⚠️ | Em memória. **Não funciona em serverless.** Ver §Riscos |
| Projeto Supabase criado | ✅ | pelo usuário, com PostGIS ativo |
| SQL de instalação do schema | ✅ | `supabase/setup.sql` — testado num banco limpo que simula o Supabase |
| Schema aplicado no Supabase | 🔑 | colar `supabase/setup.sql` no SQL Editor — [SETUP.md §1.6](./SETUP.md#16-criar-o-schema--cole-um-sql-não-mande-senha-para-ninguém) |
| Credenciais para deploy | 🔑 | vão direto para a Vercel, não passam por aqui |

---

## Segurança interna ✅ *(fora da numeração de fases)*

Adicionada a pedido, fora da ordem original. Detalhada em
[SEGURANCA.md](./SEGURANCA.md).

| Item | Estado | Observação |
|------|--------|------------|
| Denúncia de anúncio | ✅ | 18 motivos, agrupados por alvo |
| Denúncia de usuário | ✅ | |
| Denúncia de mensagem específica | ✅ | sem isso, denúncia de assédio chega sem o que julgar |
| Severidade automática | ✅ | calculada no servidor a partir do motivo, nunca enviada pelo formulário |
| Evidência congelada | ✅ | trigger copia o conteúdo denunciado; sobrevive a edição — testado |
| Limites anti-abuso na denúncia | ✅ | 10/dia, 3/minuto, uma em aberto por alvo |
| Confidencialidade da denúncia | ✅ | ninguém vê denúncia feita contra si (RLS) |
| Bloqueio entre usuários | ✅ | mútuo, imediato, garantido por trigger |
| Bloqueio impede conversa, mensagem e reserva | ✅ | as três testadas |
| Bloqueio encerra conversa existente | ✅ | |
| Centro de segurança da conta | ✅ | `/minha-conta/seguranca` |
| Componente de denúncia | ✅ | `<dialog>` nativo, acessível — aparece nas telas das Fases 2 e 6 |
| Detector de dados de contato | ✅ | telefone, e-mail (inclusive ofuscado), CPF/CNPJ, chave Pix, redes, pedido de pagamento por fora |
| Validação de CPF/CNPJ | ✅ | dígito verificador oficial |
| Contagem de reincidência | ✅ | trigger mantém `upheld_report_count` |
| Verificação automatizada | ✅ | 72 checagens — `pnpm tsx scripts/verify-safety.ts` |
| Incentivo visual a fechar no app | ✅ | home, `/protecao`, rodapé |
| Página pública de proteção | ✅ | `/protecao` |
| Checklist de visita | ✅ | 4 grupos, muda por tipo de espaço, salvo no navegador |
| Aviso escalonado de pagamento por fora | ✅ | componente pronto; liga no chat (Fase 6) |
| Níveis de confiança do perfil | ✅ | denúncia procedente domina histórico longo |
| Contagem de locações concluídas | ✅ | trigger; conta os dois lados |
| Verificação de documento no perfil | ✅ banco | preenchido pelo KYC na Fase 8 |
| Aplicação automática de suspensão | ⬜ | limites já configurados; a ação entra na Fase 11 |
| Fila de moderação | ⬜ | índice pronto; painel é Fase 11 |
| Detector ligado ao chat | ⬜ | depende do chat (Fase 6) |

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

## Nota sobre o ambiente desta sessão

A política de rede deste container **bloqueia conexões com `*.supabase.co`**.
Consequência prática, e ela é boa:

- O desenvolvimento roda contra um **Postgres local com PostGIS**, que tem
  exatamente o mesmo schema (conferido com `pg_dump` nos dois bancos — a única
  diferença é o schema onde o PostGIS mora).
- O schema chega ao Supabase por um **SQL que você cola no painel**, então
  nenhuma senha ou chave secreta precisa ser transmitida.
- As 101 checagens rodam **nos dois layouts de PostGIS** (`public` e
  `extensions`), o que já pegou um bug real: os scripts de verificação abriam
  conexão sem o `search_path` correto e quebravam como quebrariam em produção.

---

## O que NÃO existe (e não vai aparecer por engano)

- ❌ Nenhum botão de "pagar"
- ❌ Nenhum pagamento simulado ou tela de sucesso sem cobrança
- ❌ Nenhum anúncio de exemplo no banco
- ❌ Nenhuma localização inventada
- ❌ Nenhum chat falso
- ❌ Nenhuma avaliação fabricada
- ❌ Nenhuma denúncia ou bloqueio de exemplo

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

### ⚠️ 2. A margem é fina, mesmo a 3%+3%

**Resolvido em parte.** A taxa subiu de 2%+2% para **3%+3%**, e o mínimo caiu de
R$ 50 para **R$ 35**. Em um aluguel de R$ 180 a margem no cartão foi de 0,68%
para **2,65%**, e no Pix de 2,89% para **4,89%**.

O que continua valendo:

- No mínimo de R$ 35, sobram **R$ 0,11 no Pix**. Positivo, mas simbólico — não
  paga um e-mail de suporte. É piso de produto, não de receita.
- 6% no total ainda é baixo para um marketplace com custódia e mediação. Há
  espaço para revisar quando houver volume.
- Quanto maior a taxa, maior o incentivo para as duas partes saírem da
  plataforma. A 6% sobre R$ 180 são R$ 129/ano que os dois economizam indo por
  fora. As defesas estão em [SEGURANCA.md](./SEGURANCA.md).

Contas completas em [PAGAMENTOS.md §3](./PAGAMENTOS.md#3-a-economia-real-do-modelo-3--3).

### ⚠️ 3. Não existe mediação de conflito

O produto **incentiva** fechar pela plataforma, e com razão: dentro dela há
registro, denúncia e bloqueio. Mas quando duas pessoas discordarem sobre um
dano, um atraso ou uma devolução, **hoje não há processo para resolver**.

Não existe prazo de contestação, critério de decisão, quem decide, nem regra
sobre o que acontece com o dinheiro durante a disputa.

Por isso a palavra "mediação" **não aparece em lugar nenhum da interface** — o
filtro é estrutural, em `src/lib/safety/protection.ts`, e está testado.

**O que falta:** uma decisão sua sobre a política de disputa (prazos, quem
decide, o que a plataforma banca), depois revisão jurídica, e só então o texto
pode prometer isso. Antes disso, prometer seria publicidade enganosa.

**O mesmo vale para cobertura de danos**, que exigiria seguro ou fundo de
garantia — decisão de negócio, não de engenharia.

### ⚠️ 4. Split + Pix Automático não confirmado

Os dois recursos são documentados pelo Asaas separadamente; não achei
confirmação de que funcionam **juntos**. É a primeira pergunta para o gerente.

### ⚠️ 5. Sem monitoramento de erro

Sentry não integrado. Em produção você descobriria falhas pelo cliente.

### ⚠️ 6. Sem testes de interface

Há 101 checagens reais de banco, mas nenhum teste de UI (Playwright/Vitest).
Fase 12.

### ⚠️ 7. Sem documentos jurídicos

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
pnpm tsx scripts/verify-schema.ts    # 29 checagens — invariantes centrais
pnpm tsx scripts/verify-safety.ts    # 72 checagens — segurança entre usuários
pnpm check                           # typecheck + lint + build
pnpm dev                             # http://localhost:3000
```

Os scripts não testam "se o código roda" — eles **tentam gravar dado inválido e
confirmam que o banco recusa**. É a diferença entre dizer que a regra existe e
mostrar que ela funciona.

O `verify-safety.ts` também cobre os **falsos positivos** do detector de
contato: "R$ 1.500,00", "CEP 29700-000" e "posso pagar por Pix aqui pelo
aplicativo?" não podem ser sinalizados.
