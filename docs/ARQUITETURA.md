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
| Erros | **Sentry** | Integrado (`instrumentation.ts`/`instrumentation-client.ts`, Fase 12) — sem `NEXT_PUBLIC_SENTRY_DSN` o SDK só não envia nada, não quebra o build. |

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

### Serviço externo nunca é chamado do navegador

Vale para tudo que tenha custo, cota ou regra de negócio:

| Serviço | Onde a chamada acontece | Por quê |
|---------|------------------------|---------|
| Supabase Storage | servidor (`src/lib/storage/actions.ts`) | a foto passa por validação de bytes e remoção de EXIF antes de existir no bucket |
| Busca de CEP | servidor (`src/app/api/cep/[cep]/route.ts`) | o servidor precisa **reconferir** o endereço ao salvar, e o cache reduz o uso de serviço gratuito |
| Tiles de mapa | navegador | é a única exceção legítima — é o navegador que desenha o mapa, e a chave de tiles é pública por natureza (protegida por restrição de origem) |

A consequência prática da segunda linha: ao salvar a etapa de localização, o
servidor consulta o CEP de novo e **sobrepõe** cidade e estado com o que a
fonte oficial respondeu. O que o navegador mandou nesses dois campos é
descartado. Bairro e rua continuam sendo o que a pessoa digitou, porque a base
dos Correios erra em loteamento novo e o dono conhece o endereço dele.

### Os dois caminhos até o banco

```
Navegador ──JWT──► Supabase ──► Postgres     ← RLS é a barreira
Servidor  ──conexão privilegiada──► Postgres ← a DAL é a barreira
```

O servidor usa conexão privilegiada e, por definição, ignora RLS. É por isso que
a autorização **não pode** viver só no RLS.

**Correção feita na auditoria de segurança de 24/09/2026:** esta seção — e o
comentário equivalente na migração `drizzle/0001_integridade_indices_e_rls.sql`
— afirmavam que o chat usa Supabase Realtime do navegador, e que por isso RLS
seria "a barreira de verdade" para `conversations`/`messages`. Não é o caso
hoje: o chat (Fase 6) é servido inteiro por Server Actions, com a página
recarregando os dados a cada envio — nenhum canal de Realtime é aberto em
lugar nenhum do código (`grep -r ".channel(" src/` não acha nada), e o
cliente Supabase do navegador (`src/lib/supabase/client.ts`) não é importado
por ninguém. Quem autoriza de verdade hoje é a DAL, igual ao resto do app.
As policies de RLS em `conversations`/`messages` continuam corretas e
testadas — ficam como camada extra, prontas para o dia em que o chat
realmente passar a falar Realtime direto com o navegador. O comentário
dentro do arquivo de migração não foi corrigido: mudar o conteúdo do arquivo
muda o hash que `supabase/setup.sql` usa para saber se aquela migração já
foi aplicada a um projeto real, e um projeto que já rodou a versão antiga
tentaria recriar as policies e falharia. Detalhe completo na
[seção 9](#9-auditoria-de-segurança-adversarial-24092026), abaixo.

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

**Distância na busca segue a mesma regra.** Quando a busca mostra "≈ 1,2 km"
num cartão de resultado, essa distância é sempre calculada a partir de
`approx_location`, nunca de `location` (`src/lib/spaces/queries.ts`,
`distanceExpr`). Isso não é um detalhe de implementação: mostrar a distância
até o ponto exato permitiria, com buscas repetidas a partir de pontos de
referência diferentes, triangular o endereço real por trilateração — o mesmo
ataque que o deslocamento determinístico do mapa já existe para impedir.
Calcular a partir do ponto aproximado não vaza nada de novo: é a mesma
informação que o marcador no mapa público já mostra.

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
│   ├── spaces/                queries.ts, resolve-location.ts, keywords.ts, format.ts
│   ├── maps/                  config.ts (tiles), geocoding.ts (texto → coordenada)
│   ├── favorites/             queries.ts, actions.ts
│   ├── env.ts  money.ts  rate-limit.ts  utils.ts
└── proxy.ts

drizzle/                      migrações SQL versionadas
scripts/verify-schema.ts      invariantes centrais contra Postgres real
scripts/verify-safety.ts      subsistema de segurança contra Postgres real
scripts/verify-busca.ts       busca, distância, filtros e favoritos contra Postgres real
scripts/verify-integracoes.ts fotos, mapa, CEP, busca e favoritos em Chromium real
docs/                         esta documentação
```

`src/lib/spaces/resolve-location.ts` é o orquestrador do campo "Onde?" da
busca: tenta GPS → CEP → cidade/bairro já conhecido no banco → geocodificação
(`lib/maps/geocoding.ts`, ver [SETUP.md §3.4](./SETUP.md#34-geocodificação-de-endereço-busca-por-texto-livre)),
nessa ordem, da opção mais barata (sem rede) para a mais cara. Nunca inventa
coordenada: quando nada resolve, devolve `source: 'unresolved'` e quem chama
cai para busca por texto simples em vez de tela vazia.

---

## 7. Segurança entre usuários

Denúncia (anúncio, usuário e mensagem), bloqueio mútuo garantido por trigger,
detector de troca de contato no chat e contagem de reincidência.
Documentado em [SEGURANCA.md](./SEGURANCA.md).

## 8. O que ainda não está resolvido

Honestidade sobre os buracos conhecidos:

1. **Rate limiting: código pronto para os dois casos (Fase 12).**
   `src/lib/rate-limit.ts` usa Upstash Redis (contador REST compartilhado
   entre instâncias) quando `UPSTASH_REDIS_REST_URL`/`_TOKEN` estão
   configurados, e cai para um `Map` em memória quando não estão — o que
   falta é só você criar a conta Upstash (ver SETUP.md §6); sem isso, em
   serverless com mais de uma instância a proteção não é confiável.
2. **Monitoramento de erro: código pronto (Fase 12).** Sentry integrado via
   `instrumentation.ts`/`instrumentation-client.ts` — falta só o DSN de um
   projeto Sentry real (SETUP.md §7).
3. **Cobertura de teste.** 472 checagens contra Postgres real (`pnpm verify`)
   e 184 num Chromium de verdade via Playwright (`pnpm verify:integracoes`) —
   656 no total (`pnpm verify:tudo`). Ainda falta teste de unidade de
   componente (Vitest) e cobertura de UI de cadastro/login/"Meus espaços".
4. **Split junto com Pix Automático não confirmado** com o Asaas.
5. **Sem documentos jurídicos.** Termos de Uso e Política de Privacidade
   precisam de advogado, não de mim.
6. **Endereço completo após reserva ativa: prometido na interface, não
   implementado.** Achado da auditoria de segurança abaixo — não é falha de
   segurança (o dado não vaza; simplesmente não aparece nunca), mas é uma
   promessa que a interface faz e o código não cumpre. Ver seção 9.

---

## 9. Auditoria de segurança adversarial (24/09/2026)

Pedido explícito: simular uma chave de recebimento de verdade e tentar, de
propósito, burlar o sistema de pagamento, cometer fraude, e ver dado de outro
usuário por ataque comum ou avançado. Abaixo, o que foi feito e o que foi
encontrado — sem suavizar.

### Método

Não foi só ler código. Para cada suspeita, o teste era: **dá pra provar que
funciona, ou só parece que funciona?**

- Releitura adversarial de todo caminho que toca dinheiro ou decide quem pode
  o quê: `src/lib/payments/`, `src/lib/bookings/actions.ts`,
  `src/lib/messaging/`, `src/lib/storage/actions.ts`, `src/lib/spaces/`,
  `src/lib/auth/dal.ts`, `src/proxy.ts`.
- A suíte adversarial que já existia (656 checagens, muitas já escritas como
  tentativa de ataque — "token forjado", "reentrega do mesmo evento",
  "B tentando abrir o anúncio de A") foi **rodada de novo, do zero**, contra
  Postgres e Chromium reais, antes e depois de cada mudança.
- O `supabase/setup.sql` regenerado foi aplicado de verdade contra um
  Postgres limpo (`myplace_setupsql_check`) e também simulando uma
  atualização em cima de uma versão antiga já aplicada — não só lido.
- O CSP novo (abaixo) foi validado rodando os 184 testes de navegador real
  até zerar os erros no console — a primeira versão travou o mapa, e só a
  execução real (não a leitura do código) pegou isso.

### O que foi corrigido

| Achado | Risco real | Correção |
|--------|-----------|----------|
| Token do webhook do Asaas comparado com `!==` | Timing attack: um atacante medindo a latência da resposta poderia, byte a byte, descobrir o token e forjar notificações de pagamento | `crypto.timingSafeEqual`, em `src/app/api/webhooks/asaas/route.ts` |
| Nenhum cabeçalho de segurança HTTP | Sem `frame-ancestors`/`X-Frame-Options`, o site pode ser carregado num `<iframe>` invisível de outro domínio — base de clickjacking contra a tela de confirmar pagamento | CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS — `next.config.ts` |
| `/api/cep/[cep]` com limitador próprio, em memória, isolado por instância | Em produção com mais de uma instância, o limite real vira (limite × nº de instâncias) — a mesma lacuna que a Fase 12 já tinha corrigido no resto do app, esquecida aqui | Passou a usar `src/lib/rate-limit.ts` (Upstash quando configurado) |
| `supabase/setup.sql` desatualizado — faltavam as migrações 10 e 11 | Quem seguisse o guia para montar um Supabase do zero (ou atualizar um já existente) ficaria **sem a suspensão automática de conta** (Fase 11) e sem a migração 10, do jeito mais silencioso possível — sem erro nenhum | Regenerado com `pnpm db:supabase-sql`; validado num Postgres limpo e também simulando a atualização de um banco já provisionado com a versão antiga |

Commits: `Auditoria de segurança: cabeçalhos HTTP, token do webhook em tempo
constante, limitador de CEP compartilhado` e `Auditoria de segurança:
supabase/setup.sql estava desatualizado`.

### O que foi tentado e não passou

Confirmado por execução real, não só leitura — a suíte já cobria a maior
parte disso, e foi rodada de novo para confirmar:

- **Preço adulterado pelo navegador.** O checkout (`startCheckoutAction`)
  ignora qualquer valor vindo do formulário e recalcula a partir de
  `booking.totalChargedCents`, gravado no aceite da reserva. Não existe
  campo de valor no formulário de checkout para adulterar.
- **Webhook forjado.** Token errado ou ausente → 401, nenhum evento gravado
  (testado pela rota HTTP de verdade, não só pela função interna).
- **Reentrega do mesmo evento de pagamento.** Reconhecida como duplicata,
  não reprocessa, não duplica notificação nem lançamento no razão —
  idempotência por `(provider, providerEventId)` único, dentro da mesma
  transação que aplica o efeito.
- **Valor informado pelo gateway no `RECEIVED` não afeta quanto o
  proprietário recebe.** O valor bruto/líquido que o Asaas reporta no
  webhook só alimenta a contabilidade interna da tarifa do gateway
  (`gatewayFeeCents`, `platformNetCents`); o valor do repasse
  (`payouts.amountCents`) vem de `booking.ownerPayoutCents`, travado desde o
  aceite da reserva — o webhook não tem como inflar nem meu.
- **Ver/mexer em foto, reserva, mensagem ou conta de recebimento de outra
  pessoa.** Testado com dois usuários reais (A e B) tentando enviar, apagar
  e reordenar foto do anúncio um do outro; abrir reserva alheia; ler
  conversa da qual não participa. Tudo recusado no servidor, com o recurso
  do dono intacto depois da tentativa. Página de edição de anúncio alheio
  devolve 404, não 403 — para nem confirmar que o anúncio existe.
- **Ação de administrador por usuário comum ou suspenso.** 404 ao abrir
  `/admin`; a própria Server Action recusa de novo, mesmo chamada direto.
- **Upload malicioso.** Arquivo que não é imagem de verdade (extensão `.jpg`
  mentindo sobre o conteúdo) e arquivo acima do limite de tamanho — ambos
  recusados antes de tocar o Storage.
- **Injeção SQL.** Toda consulta com entrada do usuário passa pelo
  `sql\`...${valor}...\`` do Drizzle (parametrizado de verdade, mesmo quando
  o valor é concatenado em JS antes, como em buscas `ILIKE`). Única
  ocorrência de `sql.raw()` no projeto inteiro usa um literal fixo, não
  entrada de usuário.
- **XSS.** Zero ocorrências de `dangerouslySetInnerHTML` no código.

### Achado sem correção de código — promessa não cumprida

`safety.reveal_address_on_status` existe em `platform_settings` e a
interface promete, em mais de um lugar, que rua/número/complemento do
espaço aparecem para o locatário depois que a reserva fica ativa. **Isso
nunca foi implementado.** Busquei em todo `src/` por quem lê essa chave —
ninguém lê. O único lugar que seleciona `street`/`number`/`complement` é
`getOwnedSpace`, usado só pelo próprio dono editando o anúncio.

Não é uma falha de segurança — o efeito é o oposto de vazar dado: o
locatário nunca vê o endereço completo, nem depois de a reserva ficar
ativa, mesmo tendo pagado. É uma lacuna de produto: a interface promete algo
que o código não entrega. Decisão de como resolver (implementar o reveal de
verdade, ou ajustar o texto para não prometer) fica para você — está fora do
escopo de "consertar o que é inseguro".

### Achado sem correção de arquivo — risco de operação, não de segurança

A seção 3 acima (e o comentário em `drizzle/0001_integridade_indices_e_rls.sql`)
afirmavam que o chat usa Supabase Realtime do navegador. Não usa — é servido
inteiro pelo servidor. Corrigido no texto desta doc; **não corrigido dentro
do arquivo de migração**, porque isso mudaria o hash que controla se aquela
migração já foi aplicada a um Supabase real, arriscando uma reaplicação que
tentaria recriar policies já existentes. Ficou como nota nesta doc.

### Veredito

Nenhuma fraude de pagamento, adulteração de preço, ou acesso a dado de outro
usuário foi possível nos caminhos testados — a arquitetura já descrita nas
seções 3 e 5 (preço sempre calculado no servidor, autorização sempre
re-verificada na DAL a partir da sessão, nunca confiando em id que o
navegador manda) se provou sólida sob tentativa ativa, não só na leitura.
As quatro correções acima eram lacunas reais, agora fechadas. A rota de
esforço mínimo que sobra para um atacante de verdade continua sendo fora do
app: phishing, engenharia social, ou um golpe combinado por fora da
plataforma — exatamente o que a seção 7 (Segurança entre usuários) já existe
para mitigar, e é por isso que ela é tratada como parte da segurança, não só
como recurso de produto.

Rode `pnpm check:producao` para um relatório automático do que falta
configurar antes do primeiro usuário real — cobre o que dá para checar por
código; documento jurídico e plano pago continuam exigindo decisão sua.
