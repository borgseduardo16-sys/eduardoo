# Arquitetura

> **Produto:** MyPlace (nome provisório de desenvolvimento)
> **O que é:** marketplace que conecta quem tem espaço ocioso a quem precisa de espaço.

---

## 1. Princípio que guia as decisões

Uma regra explica quase todas as escolhas abaixo:

> **O navegador é hostil. O servidor decide.**

O front-end é conveniência — validação imediata, feedback, interface. Tudo que
tem consequência (preço, permissão, publicação, cobrança) é decidido no
servidor e, quando possível, **também garantido pelo banco de dados**. Se o
JavaScript inteiro fosse adulterado, nenhuma regra de negócio cairia.

A segunda regra é sobre honestidade técnica:

> **Funcionalidade sem credencial real não finge funcionar.** Ela falha com
> mensagem explícita dizendo o que falta configurar.

---

## 2. Stack

| Camada | Escolha | Por quê |
|--------|---------|---------|
| Front + back | **Next.js 16** (App Router) + TypeScript strict | Um único deploy. Server Components mantêm dado sensível no servidor por padrão. Server Actions eliminam a camada de API só para formulário. |
| Estilo | **Tailwind CSS v4** + design tokens próprios | Sem biblioteca de componentes pronta — é o que faz produto parecer template. Ver `src/app/globals.css`. |
| Banco | **PostgreSQL 16 + PostGIS** | "Espaços a menos de 2 km de mim" é consulta geoespacial. PostGIS resolve com índice; simular com fórmula em SQL não. |
| ORM | **Drizzle** | Migrações em SQL legível e versionado. Escapar para SQL puro quando preciso (PostGIS) não exige contorcionismo. |
| Auth | **Supabase Auth** | Senha, recuperação, confirmação de e-mail e limites de tentativa prontos e auditados. Escrever isso à mão é onde nascem as falhas de segurança. |
| Armazenamento | **Supabase Storage** | S3-compatível, com CDN e URL assinada. Fotos de anúncio não podem ser links públicos permanentes. |
| Tempo real | **Supabase Realtime** | Chat de verdade, com mensagem no banco, sem manter servidor WebSocket próprio. |
| Mapas | **MapLibre GL** + MapTiler | Biblioteca aberta, sem dependência de um fornecedor de mapa só. |
| Pagamentos | **Asaas** | Análise completa em [PAGAMENTOS.md](./PAGAMENTOS.md). |
| E-mail | **Resend** | E-mail transacional com boa entregabilidade. |
| Hospedagem | **Vercel** | Deploy nativo de Next.js. |
| Erros | **Sentry** | Sem rastreamento de erro em produção, você descobre problema pelo cliente reclamando. |

### Por que Supabase e não montar cada peça separada

Supabase entrega Postgres gerenciado, autenticação, armazenamento e tempo real
no mesmo lugar, com PostGIS disponível. A alternativa — Neon + Auth.js +
S3 + Pusher — dá o mesmo resultado com quatro contratos, quatro contas e quatro
pontos de falha.

**O risco real:** é dependência de fornecedor. Ele está contido porque o núcleo
é PostgreSQL padrão (migrações em SQL puro, sem extensão proprietária) e a
autenticação está isolada atrás de `src/lib/auth/`. Sair do Supabase seria um
trabalho de semanas, não uma reescrita.

### Por que não microsserviços

Não há problema aqui que justifique o custo. Um Next.js sobre um Postgres
aguenta esse produto por muito tempo. Quando um gargalo aparecer, ele vai
apontar o que extrair — em vez de dividirmos hoje no lugar errado.

---

## 3. Como a autorização funciona

Três camadas, e só a terceira é de verdade:

```
1. UI          → esconde o que não cabe          (conveniência)
2. proxy.ts    → redireciona cedo quem não tem sessão   (otimização)
3. DAL + banco → decide de fato quem pode o quê        (segurança)
```

**`src/proxy.ts`** (o que até o Next.js 15 se chamava *middleware*) renova o
token e redireciona. Ele só lê o cookie — não consulta o banco. Se este arquivo
sumisse, **nada vazaria**.

**`src/lib/auth/dal.ts`** é a Data Access Layer: `requireUser`, `requireOwner`,
`requireAdmin`. Fica colada ao acesso ao dado, é memoizada por render, e é o que
a própria documentação do Next.js recomenda.

**O banco** é a última linha. RLS ligado em todas as tabelas, e a postura é
**negar por padrão**: o navegador só alcança `favorites`, `conversations`,
`messages`, `notifications`, `features` e um subconjunto público de `profiles`.
Anúncios, reservas, pagamentos, repasses e livro-razão **não têm nenhuma
permissão** para o cliente — só o servidor os lê.

### Os dois caminhos até o banco

```
Navegador ──JWT──► Supabase ──► Postgres     ← RLS é a barreira
Servidor  ──conexão privilegiada──► Postgres ← a DAL é a barreira
```

O servidor usa conexão privilegiada e, por definição, ignora RLS. É por isso que
a autorização **não pode** viver só no RLS — e por isso o RLS existe mesmo assim,
para o caminho do navegador (necessário para o chat em tempo real).

---

## 4. Privacidade da localização

Requisito explícito do produto, resolvido no modelo de dados:

| Campo | Conteúdo | Quem vê |
|-------|----------|---------|
| `location` | ponto exato | ninguém, publicamente |
| `approx_location` | ponto deslocado ~300 m | mapa público |
| `street`, `number`, `complement` | endereço completo | só após reserva ativa |
| `district`, `city`, `state` | região | público |

O deslocamento é determinístico por espaço — não sorteado a cada carregamento.
Sorteio a cada requisição permitiria triangular o ponto real com poucas visitas.

---

## 5. Dinheiro

Detalhado em [PAGAMENTOS.md](./PAGAMENTOS.md). O essencial:

- **Inteiro em centavos, sempre.** Nenhum `float` toca valor monetário.
- **O navegador nunca envia preço.** Envia o id do espaço; o servidor calcula.
- **Valores congelados na reserva.** Mudar a taxa amanhã não afeta contrato vigente.
- **A aritmética é `CHECK` no banco.** Um total inconsistente é recusado pelo
  Postgres, não só pelo código.
- **Livro-razão append-only**, protegido por trigger. Correção se faz com
  lançamento novo.
- **Webhook idempotente** por chave única de evento — reentrega não cobra duas vezes.

Taxas vigentes: **3% de quem aluga + 3% de quem recebe**, com aluguel mínimo de
R$ 35,00. Ambos configuráveis em `platform_settings`, sem deploy.

---

## 6. Estrutura de pastas

```
src/
├── app/                      rotas (App Router)
│   ├── (auth)/               entrar, criar-conta, recuperar/redefinir senha
│   ├── auth/                 callbacks de e-mail (troca de código por sessão)
│   ├── buscar/  anunciar/  minha-conta/
│   ├── layout.tsx  page.tsx  globals.css
├── components/
│   ├── ui/                   primitivos (Button, Input, Field, Alert, Logo)
│   ├── auth/  search/  layout/
├── db/
│   ├── schema/               modelo por domínio
│   ├── client.ts  migrate.ts
├── lib/
│   ├── auth/                 dal.ts, actions.ts, schemas.ts, redirect.ts
│   ├── safety/               denúncias, bloqueio, detector de contato, CPF/CNPJ
│   ├── supabase/             server.ts, client.ts, admin.ts
│   ├── env.ts  money.ts  rate-limit.ts  utils.ts
└── proxy.ts

drizzle/                      migrações SQL versionadas
scripts/verify-schema.ts      invariantes centrais contra Postgres real
scripts/verify-safety.ts      subsistema de segurança contra Postgres real
docs/                         esta documentação
```

---

## 7. Segurança entre usuários

Denúncia (anúncio, usuário e mensagem), bloqueio mútuo garantido por trigger,
detector de troca de contato no chat e contagem de reincidência.
Documentado em [SEGURANCA.md](./SEGURANCA.md).

## 8. O que ainda não está resolvido

Honestidade sobre os buracos conhecidos:

1. **Rate limiting é em memória.** Funciona local e em servidor único; **não
   funciona em serverless**, onde cada instância tem o próprio contador.
   Produção exige Upstash Redis. Está declarado em `src/lib/rate-limit.ts`.
2. **Sem monitoramento de erro.** Sentry ainda não integrado.
3. **Sem testes automatizados de UI.** Há verificação real de banco
   (85 checagens em dois scripts), mas não há Playwright/Vitest.
4. **Split junto com Pix Automático não confirmado** com o Asaas.
5. **Sem documentos jurídicos.** Termos de Uso e Política de Privacidade
   precisam de advogado, não de mim.
