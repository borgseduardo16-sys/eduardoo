# Setup — contas e configurações que dependem de você

Este é o roteiro do que **eu não consigo fazer sozinho**: criar contas, aceitar
termos, verificar identidade e gerar chaves.

**Faça na ordem.** As seções 1 e 2 são o suficiente para o projeto rodar hoje.
As outras acompanham as fases seguintes — não crie nada antes da hora.

---

## Resumo de custos

| Serviço | Para começar | Quando crescer | Quando precisa |
|---------|--------------|----------------|----------------|
| Supabase | Grátis | US$ 25/mês (Pro) | **Agora** |
| Vercel | Grátis (Hobby) | US$ 20/mês (Pro — obrigatório para uso comercial) | Ao publicar |
| Domínio `.com.br` | ~R$ 40/ano | — | Ao publicar |
| MapTiler | Grátis até 100k carregamentos | ~US$ 25/mês | Opcional — upgrade do mapa (OSM grátis já funciona) |
| Google Geocoding | US$ 200/mês de crédito grátis | ~US$ 5 / 1.000 buscas | Opcional — upgrade da busca por texto (Nominatim grátis já funciona) |
| Asaas | Sem mensalidade | Tarifa por transação | Fase 7 |
| Resend | Grátis até 3.000 e-mails/mês | US$ 20/mês | Fase 6 |
| Upstash Redis | Grátis até 10k comandos/dia | ~US$ 10/mês | Antes de produção |
| Sentry | Grátis até 5k erros/mês | US$ 26/mês | Antes de produção |

**Para começar hoje: R$ 0,00.** Para ir ao ar com segurança: ~US$ 45/mês +
domínio.

---

## 1. Supabase — banco, autenticação e arquivos

**Necessário agora. Sem isso o projeto não sobe.**

### 1.1 Criar o projeto

1. Acesse [supabase.com](https://supabase.com) e crie conta (pode usar GitHub).
2. **New project**:
   - **Name:** `myplace`
   - **Database Password:** gere uma senha forte e **guarde num gerenciador de
     senhas**. Ela não é recuperável — só redefinível.
   - **Region:** `South America (São Paulo)` — importante. Região errada
     adiciona ~150 ms em toda consulta.
3. Espere uns 2 minutos até provisionar.

### 1.2 Ativar o PostGIS

1. Menu lateral → **Database** → **Extensions**
2. Procure `postgis` → **Enable**

> Sem isso a migração falha. O PostGIS é o que faz a busca por distância
> funcionar.

### 1.3 Pegar as chaves

**Project Settings → API:**

| No painel | Vai para |
|-----------|----------|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` `public` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` `secret` | `SUPABASE_SERVICE_ROLE_KEY` |

> ⚠️ A `service_role` **ignora todas as regras de segurança do banco**. Ela nunca
> vai para o navegador, nunca entra em variável com prefixo `NEXT_PUBLIC_`,
> nunca é colada em chat ou issue. Se vazar, qualquer pessoa lê e apaga tudo.
> Se isso acontecer: Project Settings → API → **Reset**.

**Project Settings → Database → Connection string → URI:**

Copie para `DATABASE_URL` e troque `[YOUR-PASSWORD]` pela senha do passo 1.1.
Use a porta **5432** (conexão direta), não a 6543.

### 1.4 Configurar as URLs de autenticação

**Authentication → URL Configuration:**
- **Site URL:** `http://localhost:3000` (troque pelo domínio quando publicar)
- **Redirect URLs**, adicione as duas:
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/auth/confirmar`

**Authentication → Providers → Email:** deixe **Confirm email** ligado.

### 1.5 Criar o bucket de fotos

**Storage → New bucket:**
- **Name:** `space-images`
- **Public bucket:** **desmarcado**. As fotos são servidas por URL assinada,
  com validade de 1 hora, gerada no servidor. Não existe link permanente.

**O resto da configuração é feita pelo SQL do passo 1.6** — você não precisa
mexer em política no painel. A migração `0009` deixa o bucket privado, com
limite de 8 MB e apenas `image/jpeg`, `image/png` e `image/webp`, e cria
quatro políticas em `storage.objects` amarrando cada usuário à **própria
pasta**: o caminho do arquivo é `<id-do-dono>/<id-do-anúncio>/<arquivo>`, e a
política compara a primeira pasta com `auth.uid()`.

Se você já criou políticas à mão nesse bucket antes, confira depois em
**Storage → Policies** se sobrou alguma coisa mais permissiva — o SQL cria as
dele com nome próprio (`space_images_dono_*`) e não apaga política de terceiro.

### 1.6 Criar o schema — cole um SQL, não mande senha para ninguém

Existem dois caminhos. **Prefira o primeiro.**

#### Caminho A — pelo painel (recomendado)

Nenhuma credencial sai das suas mãos.

1. No painel do Supabase: **SQL Editor → New query**
2. Abra `supabase/setup.sql` deste repositório
3. Cole o arquivo **inteiro** e clique em **Run**

**Já rodou o schema antes e só quer a parte nova?** Existe um arquivo menor
com apenas as migrações recentes — hoje `supabase/atualizacao-0009.sql`. Ele é
gerado do mesmo lugar e guardado pelo mesmo hash, então dá no mesmo:

```bash
pnpm tsx scripts/build-supabase-setup.ts --desde 9
```

*Verificado:* colar o `setup.sql` antigo e depois a atualização produz um
schema **byte a byte idêntico** ao de um banco novo com o `setup.sql`
completo, e idêntico ao que o `pnpm db:migrate` gera (comparado com `pg_dump`,
1300 linhas).

Pronto: 22 tabelas, índices geoespaciais, triggers, RLS, as políticas do
bucket de fotos e as taxas iniciais.

**É seguro rodar mais de uma vez.** Cada migração só é aplicada se ainda não
estiver registrada em `drizzle.__drizzle_migrations`. Projeto novo recebe tudo;
projeto que já tem parte do schema recebe apenas o que falta; rodar duas vezes
seguidas não faz nada na segunda.

Ao terminar, a saída mostra o que foi feito:

```
NOTICE:  Migracao 8 (0008_late_zeigeist) ja aplicada — pulando.
NOTICE:  Migracao 9 (0009_fotos_e_storage) aplicada.
NOTICE:  Bucket space-images configurado: privado, 8 MB, jpeg/png/webp.
NOTICE:  Politicas do bucket space-images aplicadas (4 politicas, por pasta do dono).
NOTICE:  Pronto: 10 de 10 migracoes registradas no banco.
```

> Quando houver migração nova, basta rodar o arquivo atualizado de novo.
> Ele aplica só a parte nova.

O arquivo também mantém a tabela de controle do Drizzle em dia, então um
`pnpm db:migrate` futuro aplica só o que for novo em vez de tentar recriar tudo.

Confira o resultado com:

```sql
SELECT count(*) FROM pg_tables WHERE schemaname = 'public';  -- 22
SELECT key, value FROM platform_settings ORDER BY key;        -- taxas 3%+3%
SELECT PostGIS_Version();                                     -- extensão ativa
```

> Quando o schema mudar, o arquivo é regerado com
> `pnpm tsx scripts/build-supabase-setup.ts` — nunca editado à mão.

#### Caminho B — pela linha de comando

Só se você estiver rodando no **seu próprio computador**, onde a `DATABASE_URL`
nunca sai da sua máquina:

```bash
cp .env.example .env.local     # preencha com os valores acima
pnpm install
pnpm db:migrate
pnpm tsx scripts/verify-schema.ts   # 29 passaram
pnpm tsx scripts/verify-safety.ts   # 72 passaram
pnpm dev
```

> ⚠️ A `DATABASE_URL` contém a senha do banco. Ela nunca deve ser colada em
> conversa, issue ou mensagem — nem para mim.

### 1.7 Detalhe do PostGIS no Supabase

O Supabase instala o PostGIS no schema `extensions`, não em `public`. Sem
tratar isso, `ST_DWithin` e o cast `::geography` somem: a busca por distância
funciona em desenvolvimento e quebra em produção.

Já está resolvido em `src/db/connection.ts`, que define
`search_path = 'public, extensions'` para toda conexão. Schema inexistente é
ignorado pelo Postgres, então a mesma configuração serve aos dois ambientes.

*Verificado: as checagens de banco passam tanto com o PostGIS em `public`
quanto em `extensions`.*

---

## 2. Domínio (quando for publicar)

- **`.com.br`** — [registro.br](https://registro.br), ~R$ 40/ano. Exige CPF ou CNPJ.
- **`.com`** — [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/),
  ~US$ 10/ano, vendido a preço de custo.

Escolha o nome definitivo antes. "MyPlace" é provisório e trocar depois dá
trabalho (e-mails, links, marca).

---

## 3. Mapas — o que está valendo e quando vira obrigação

A biblioteca é o **MapLibre GL** (código aberto, sem conta e sem chave). Ela
desenha o mapa; quem entrega as imagens é o **provedor de tiles**, e é ali que
existe custo e política de uso.

O código aceita três fontes, nesta ordem de prioridade
(`src/lib/maps/config.ts`):

| Prioridade | Variável | Quando usar |
|-----------|----------|-------------|
| 1 | `NEXT_PUBLIC_TILE_URL` | servidor de tiles próprio ou de terceiro, no formato `https://.../{z}/{x}/{y}.png` |
| 2 | `NEXT_PUBLIC_MAPTILER_KEY` | MapTiler (recomendado quando o produto abrir ao público) |
| 3 | nenhuma | tiles públicos do OpenStreetMap — **só desenvolvimento** |

### 3.1 Por que não ficar no OpenStreetMap público

O mapa funciona sem configurar nada, e é assim que está hoje. Mas a
[Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) da
OSM Foundation é explícita: a infraestrutura deles é doada, o uso é para
"tráfego modesto", e aplicação com volume deve usar provedor próprio. Não é
proibição técnica — é pedido de quem paga a conta. Com anúncio de verdade e
gente de verdade navegando, trocar é o certo.

### 3.2 MapTiler — o que você precisa fazer

**Serviço:** MapTiler Cloud (tiles vetoriais).
**Onde criar:** [cloud.maptiler.com](https://cloud.maptiler.com) → conta grátis.
**Tem plano grátis?** Sim: 100.000 carregamentos de mapa por mês, sem cartão.
**Limites:** acima disso o mapa para de carregar no plano gratuito (não gera
fatura surpresa). Um carregamento = uma inicialização do mapa, não um tile.
**Custo quando passar:** plano Flex, a partir de ~US$ 25/mês (≈ R$ 135) por
500.000 carregamentos. Preço atual em
[maptiler.com/cloud/pricing](https://www.maptiler.com/cloud/pricing/).
**Qual API ativar:** nenhuma — a chave já dá acesso aos estilos de mapa. Se
quiser geocodificação depois, é o mesmo painel.

**Onde colocar a chave:** em `.env.local` (desenvolvimento) e nas variáveis de
ambiente da Vercel (produção):

```
NEXT_PUBLIC_MAPTILER_KEY=sua_chave_aqui
```

**Atenção ao `NEXT_PUBLIC_`:** essa chave **vai para o navegador** — é assim
que funciona qualquer chave de tiles, porque é o navegador que pede a imagem.
Não é um segredo vazado; é uma chave pública. O que a protege é a **restrição
de origem** no painel do MapTiler:

1. MapTiler Cloud → **Keys** → sua chave
2. **Allowed origins** → adicione só o seu domínio (e `http://localhost:3000`
   para desenvolver)
3. Sem isso, qualquer site pode embutir sua chave e gastar sua cota.

> Nada disso é urgente. Sem a chave, o mapa continua funcionando com o
> OpenStreetMap — o que muda é de quem é a infraestrutura.

### 3.3 Busca de CEP — não precisa de chave

A consulta roda **no servidor** (`/api/cep/[cep]`), nunca direto do navegador,
e usa dois serviços gratuitos e sem cadastro:

1. **[BrasilAPI](https://brasilapi.com.br)** (`/api/cep/v2`) — principal.
   Agrega Correios, ViaCEP e Open CEP. Também é a única fonte gratuita que
   devolve coordenada aproximada do CEP, usada só para centralizar o mapa.
2. **[ViaCEP](https://viacep.com.br)** — reserva, se a primeira falhar.

**Você não precisa criar nada.** Se um dia quiser apontar para um proxy
interno ou um serviço pago, as bases são configuráveis:

```
CEP_BRASILAPI_BASE=https://brasilapi.com.br
CEP_VIACEP_BASE=https://viacep.com.br
```

Há cache de 24 h em memória e limite de 40 consultas por minuto por IP na
nossa rota, para não abusar de serviço doado.

### 3.4 Geocodificação de endereço (busca por texto livre)

Quando alguém digita um bairro, cidade ou endereço no campo "Onde?" da busca
— em vez de usar o GPS ou um CEP — o servidor precisa converter esse texto
numa coordenada para calcular distância. Isso é **geocodificação**, e é
diferente de consultar CEP (que é uma tabela fechada de endereços).

**Já funciona hoje, sem nenhuma ação sua.** `src/lib/maps/geocoding.ts` tenta,
em ordem, o que estiver configurado, e cai para o gratuito quando nada está:

1. **Google Geocoding API**, se `GEOCODING_PROVIDER=google` e
   `GOOGLE_GEOCODING_API_KEY` estiverem definidos.
2. **MapTiler Geocoding API**, se `GEOCODING_PROVIDER=maptiler` — reaproveita a
   MESMA `NEXT_PUBLIC_MAPTILER_KEY` que já existe para os tiles do mapa
   (§3.2); quem já configurou o MapTiler não precisa criar outra conta.
3. **Nominatim (OpenStreetMap)**, sem chave nenhuma — é o que está valendo
   agora, porque nenhum dos dois acima está configurado no seu ambiente.

O Nominatim não exige conta nem chave, então não há nada bloqueando você aqui
— mas ele **não é pensado para volume de produção**: a política de uso deles
(https://operations.osmfoundation.org/policies/nominatim/) pede tráfego leve,
um identificador descritivo (já enviado) e no máximo 1 requisição por
segundo, que é exatamente o limite que o código aplica. Para uma cidade ou
região pequena, tende a ser suficiente. Se a busca por texto crescer, migre
para uma das opções pagas:

**Upgrade opcional — Google Geocoding API** (melhor cobertura de endereço no
Brasil):

1. [console.cloud.google.com](https://console.cloud.google.com) → novo projeto
2. Ative **Geocoding API**
3. **Credentials** → **Create credentials** → **API key**
4. **Restrinja:** *Application restrictions* → **IP addresses** (é chamada de
   servidor, não do navegador); *API restrictions* → somente **Geocoding API**
5. **Defina um teto de gastos** em Billing → Budgets & alerts. Sem teto, um bug
   em laço vira fatura alta.
6. Copie para `GOOGLE_GEOCODING_API_KEY` e ponha `GEOCODING_PROVIDER=google`

**Upgrade opcional — MapTiler** (se você já usa MapTiler para os tiles do
mapa, é só ligar): ponha `GEOCODING_PROVIDER=maptiler`. Nenhuma chave nova —
usa a `NEXT_PUBLIC_MAPTILER_KEY` do §3.2.

O ponto do **anúncio** (onde o proprietário marca o espaço) nunca passa por
aqui — vem do GPS do navegador ou do pino que o proprietário arrasta no mapa,
que é mais confiável do que geocodificar um endereço digitado à mão. A
geocodificação desta seção serve só para a **busca**, do lado de quem procura
um espaço.

---

## 4. Asaas — pagamentos (Fase 7)

**PRECISA DA SUA AÇÃO — CONFIGURAÇÃO DO GATEWAY.** O cliente e o webhook já
existem e estão testados sem dinheiro real (`pnpm tsx scripts/verify-payments.ts`,
50 checagens — ver [STATUS.md](./STATUS.md)). O que falta agora só você
consegue fazer: criar a conta e me passar a credencial.

**Leia [PAGAMENTOS.md](./PAGAMENTOS.md) primeiro** — tem a conta completa de
quanto a plataforma realmente ganha com a taxa de 3%+3%, e a reconfirmação
mais recente da documentação do Asaas (feita por busca, não leitura direta —
a rede deste ambiente bloqueia `docs.asaas.com`; alguns nomes de campo ainda
merecem sua conferência, ou do gerente, antes de produção).

### 4.1 Sandbox primeiro — sem dinheiro real

1. Acesse **[sandbox.asaas.com](https://sandbox.asaas.com)** e crie uma
   conta de teste — gratuita, e o sandbox nem verifica CPF/CNPJ (pode ser
   fictício, desde que no formato certo).
2. **Configurações → Integrações → Chave de API** → copie a chave. Começa
   com `$aact_hmlg_...` (hmlg = homologação, ambiente de teste).
3. Essa chave é **inteiramente secreta** — o Asaas não tem uma chave
   "pública" separada (diferente de outros gateways que têm uma chave
   publicável e uma secreta; aqui existe só uma, e ela nunca deve aparecer
   no navegador nem em código versionado).
4. No `.env.local` (raiz do projeto — **nunca vai para o GitHub**), três
   linhas:
   ```
   ASAAS_API_KEY=$aact_hmlg_cole_a_sua_chave_aqui
   ASAAS_ENV=sandbox
   ASAAS_WEBHOOK_TOKEN=invente_aqui_uma_string_aleatoria_longa
   ```
   O `ASAAS_WEBHOOK_TOKEN` **você mesmo inventa** (não vem do painel do
   Asaas — gere algo aleatório, ex. `openssl rand -hex 32` no terminal). O
   MESMO valor vai depois no painel do Asaas, na configuração do webhook
   (§4.3) — é assim que o servidor confirma que o aviso de pagamento veio
   mesmo do Asaas, e não de alguém forjando a chamada.

### 4.2 Testar sem gastar nada — nem conta ainda

```bash
pnpm tsx scripts/verify-payments.ts
```

Isso já roda 50 checagens contra um Asaas "de mentira" que imita o contrato
real (mesma técnica usada para CEP e mapa neste projeto) — prova que o
cliente monta a chamada certa e que o webhook nunca duplica cobrança, reserva
ou repasse, sem precisar de conta nenhuma. Vale rodar antes de mexer em
qualquer credencial, só para ver funcionando.

### 4.3 Configurar o webhook — só depois de ter uma URL pública

O Asaas avisa sua aplicação por HTTP quando um pagamento muda de status —
isso exige uma URL alcançável pela internet, **não funciona com
`localhost`**. Duas situações:

- **Ainda em desenvolvimento, sem deploy:** pule esta seção por agora — o
  `verify-payments.ts` já testa o webhook de ponta a ponta sem precisar
  disso.
- **Depois de publicar na Vercel** (Fase 12), a URL é
  `https://SEU-DOMINIO/api/webhooks/asaas`. No painel do Asaas:
  1. **Configurações → Integrações → Webhooks** → **Novo Webhook**
  2. **URL:** `https://SEU-DOMINIO/api/webhooks/asaas`
  3. **Token de acesso:** cole o MESMO valor de `ASAAS_WEBHOOK_TOKEN` (§4.1)
  4. **Eventos:** marque ao menos `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`,
     `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`, `PAYMENT_DELETED` e
     `PAYMENT_REPROVED_BY_RISK_ANALYSIS` — são os que o código de hoje já
     sabe tratar (`src/lib/payments/webhook.ts`). Outros eventos chegam sem
     erro, mas ficam marcados como "não tratado ainda".

### 4.4 Conta de produção — só depois do sandbox validado de ponta a ponta

Migre para **[asaas.com](https://www.asaas.com)** (sem "sandbox.") só depois
de testar o fluxo inteiro no sandbox. Vai exigir:

- **CNPJ** (fortemente recomendado — pessoa física recebendo e repassando
  dinheiro de terceiros num marketplace é problema jurídico, não só técnico)
- Documento do sócio administrador e uma selfie de verificação
- Dados bancários da empresa (para onde vão as retiradas da plataforma)
- Declaração de faturamento e descrição da atividade

Prazo de análise costuma ser de alguns dias úteis. A chave de produção
começa com `$aact_prod_...`, numa conta **separada** do sandbox (dados,
cobranças e chave são independentes) — só troque `ASAAS_ENV=production` e
`ASAAS_API_KEY` depois da aprovação.

### 4.5 Perguntas para o time comercial do Asaas **antes** de ativar produção

A reconfirmação desta rodada ([PAGAMENTOS.md §4](./PAGAMENTOS.md#4-reconfirmação-em-18092026-e-o-que-ainda-falta))
já indica que split funciona junto com assinaturas e Pix Automático, mas foi
por busca, não leitura direta da documentação — vale confirmar com uma
pessoa antes de apostar dinheiro real:

1. **Split funciona junto com Pix Automático, na prática da sua conta?**
2. **Tokenização de cartão em produção** — a documentação diz que depende de
   liberação prévia do gerente.
3. **Exigências contratuais para subcontas** (cada proprietário vai ter uma).
4. **Tarifas reais da sua conta**, e quando a promoção inicial acaba.
5. **O que acontece quando o valor do split é maior que o líquido da
   cobrança** (aluguel muito baixo, ou tarifa subindo) — o que encontrei diz
   que a API recusa a cobrança, mas vale confirmar.

### 4.6 O que eu não faço, mesmo com a chave em mãos

- Não coloco a chave secreta em nenhum arquivo que vá para o Git.
- Não tento contornar verificação de identidade do Asaas.
- Não testo com dinheiro real enquanto o fluxo não estiver validado no
  sandbox.
- Não decido política de reembolso/cancelamento — isso é decisão sua (ver
  PAGAMENTOS.md, e a nota sobre mediação em [SEGURANCA.md](./SEGURANCA.md)).

---

## 5. Resend — e-mails (Fase 6)

O código já está pronto e testado contra um dublê local do Resend (mesmo
padrão do Asaas — ver `scripts/testbed/server.ts`); falta só a conta real.
Sem estas variáveis, o chat continua funcionando normalmente — só não avisa
por e-mail quem recebeu uma mensagem (ver `src/lib/messaging/notify.ts`).

1. [resend.com](https://resend.com) → conta
2. **Domains** → adicione seu domínio e configure os registros **SPF, DKIM e
   DMARC** no DNS. Sem isso o e-mail cai em spam — inclusive o de confirmação
   de cadastro.
3. **API Keys** → `RESEND_API_KEY`
4. `EMAIL_FROM="MyPlace <nao-responda@seudominio.com.br>"`

Configure também no Supabase (**Project Settings → Auth → SMTP Settings**) para
os e-mails de autenticação saírem pelo seu domínio. O SMTP padrão do Supabase
tem limite baixo e não serve para produção.

---

## 6. Upstash — rate limiting (antes de produção)

**Não é opcional.** O limitador atual é em memória e **não funciona em
serverless** — cada instância tem o próprio contador. Sem um contador
compartilhado, a proteção contra ataque de força bruta na tela de login é
ilusória.

1. [upstash.com](https://upstash.com) → **Create Database** → Redis
2. Região: mesma do app
3. Copie `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`

---

## 7. Sentry — erros (antes de produção)

1. [sentry.io](https://sentry.io) → projeto **Next.js**
2. Copie o DSN

Sem isso, você fica sabendo dos erros pelo cliente reclamando.

---

## 8. Vercel — publicação

1. [vercel.com](https://vercel.com) → conecte o repositório do GitHub
2. **Region:** `gru1` (São Paulo) — mesma do banco
3. **Environment Variables:** todas as do `.env.local`, com dois ajustes:
   - `NEXT_PUBLIC_SITE_URL` = seu domínio real
   - `DATABASE_URL` = string do **pooler** (porta **6543**), não a direta
4. Adicione `DIRECT_DATABASE_URL` com a conexão direta (5432), usada só por migração
5. **Settings → Domains:** adicione o domínio e aponte o DNS

> O plano Hobby da Vercel **proíbe uso comercial**. Para cobrar de alguém,
> precisa ser o Pro (US$ 20/mês).

Depois de publicar, volte ao Supabase (§1.4) e troque as URLs de
`localhost:3000` para o domínio real.

---

## 9. Rodar os testes contra os serviços reais

Os testes de integração (`pnpm verify:integracoes`) exercitam o app inteiro
num Chromium de verdade. Nesta máquina eles falam com um servidor local que
implementa o contrato REST do Supabase, porque a rede externa é bloqueada.

**Na sua máquina, com suas credenciais, o mesmo comando fala com o Supabase de
verdade.** É isso que fecha a única lacuna que sobrou. Para isso:

1. Tenha o `.env.local` preenchido com `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e
   `DATABASE_URL` apontando para o seu projeto.
2. Rode:

```bash
pnpm verify:integracoes
```

3. O script cria dois usuários de teste, envia fotos de verdade para o bucket
   `space-images`, confere que a referência chegou ao banco, que a foto
   aparece por URL assinada, e apaga tudo no final.

Se o bucket não existir, a mensagem é explícita ("Crie o bucket
'space-images'"), não um erro genérico.

> Ele grava e apaga dados no banco que o `DATABASE_URL` aponta. Use o projeto
> de desenvolvimento, não o que já tiver usuário real.

---

## Regras que valem sempre

1. **`.env.local` nunca vai para o Git.** Já está no `.gitignore`.
2. **Chave secreta nunca leva `NEXT_PUBLIC_`.** Esse prefixo publica o valor no
   JavaScript que vai para o navegador.
3. **Nunca mande uma chave em chat, e-mail ou issue** — nem para mim. Se
   precisar, cole no painel do serviço e me diga só o nome da variável.
4. **Chave vazada é chave rotacionada**, na hora. Todo serviço aqui permite.
5. **Sandbox antes de produção**, sempre, em qualquer coisa que toque dinheiro.

---

## Checklist antes de aceitar o primeiro usuário real

- [ ] Supabase Pro (o plano grátis pausa por inatividade)
- [ ] Vercel Pro (uso comercial)
- [ ] Domínio com HTTPS
- [ ] SPF, DKIM e DMARC configurados
- [ ] Upstash configurado (rate limiting real)
- [ ] Sentry recebendo eventos
- [ ] Asaas em produção, com KYC aprovado
- [ ] **Termos de Uso e Política de Privacidade revisados por advogado**
- [ ] Backup do banco verificado — testando uma restauração, não só confiando
- [ ] Um administrador criado (`UPDATE profiles SET role='admin' WHERE id='…'`)
