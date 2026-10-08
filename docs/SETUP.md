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
| Twilio Verify | Por verificação concluída, sem mensalidade | idem | Opcional — selo "Telefone verificado" (§13) |

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
3. Procure `btree_gist` → **Enable** (Parte 12). É o que faz o próprio banco
   recusar duas reservas da mesma vaga no mesmo horário.

> Sem o PostGIS a migração falha — é ele que faz a busca por distância
> funcionar. O `btree_gist`, se você esquecer, o SQL do passo 1.6 ativa
> sozinho no schema `public`: funciona igual, só que o *Security Advisor* do
> Supabase passa a mostrar o aviso "Extension in Public" sobre ele.
>
> *Verificado:* o SQL entra sem erro e as checagens de aluguel passam com o
> `btree_gist` nos dois lugares (`extensions`, ativado pelo painel, ou
> `public`, ativado pelo SQL).

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

**Authentication → Providers → Email** (em versões novas do painel:
**Authentication → Sign In / Providers → Email**): deixe **Confirm email**
ligado.

> Desde a Fase 21 isto deixou de ser só boa prática: o selo **"E-mail
> verificado"** do perfil público é uma cópia de `auth.users.email_confirmed_at`.
> Com **Confirm email** desligado, o Supabase marca todo cadastro como
> confirmado sem ninguém abrir link nenhum — e o selo passaria a afirmar algo
> que não aconteceu. `pnpm check:producao` confere essa opção sozinho.

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

#### O bucket de áudio (`chat-audio`)

O chat e as instruções de acesso aceitam **áudio** (sem imagens). O SQL do
passo 1.6 já cria o bucket **`chat-audio`**: privado, 5 MB, só `audio/webm`,
`audio/ogg`, `audio/mp4` e `audio/mpeg`. O caminho do arquivo é
`<id da conversa>/<uuid>.<ext>` e duas políticas em `storage.objects` deixam
**só quem participa daquela conversa** (locatário ou proprietário) ler e enviar;
não há política para `anon`, nem para editar ou apagar. A autorização de
verdade fica no servidor (`src/lib/messaging/audio.ts`): o áudio só sai por URL
assinada de curta validade, e só para quem pode ouvir (o locatário só ouve as
instruções de acesso **depois do pagamento**).

Se o SQL avisar que não tem permissão para configurar o bucket (acontece em
alguns planos), faça à mão: **Storage → New bucket** → nome `chat-audio`,
**desmarque** "Public bucket", limite de 5 MB e os quatro tipos acima.

### 1.6 Criar o schema — cole um SQL, não mande senha para ninguém

Existem dois caminhos. **Prefira o primeiro.**

#### Caminho A — pelo painel (recomendado)

Nenhuma credencial sai das suas mãos.

1. No painel do Supabase: **SQL Editor → New query**
2. Abra `supabase/setup.sql` deste repositório
3. Cole o arquivo **inteiro** e clique em **Run**

**Já rodou o schema antes e só quer a parte nova?** Existem arquivos menores
com apenas as migrações recentes, gerados do mesmo lugar e guardados pelo
mesmo hash — então dá no mesmo:

| Arquivo | Migrações | O que traz | Para quem parou em |
|---|---|---|---|
| `supabase/atualizacao-0025.sql` | `0025` a `0036` | Fase 23, Parte 12, o **modelo mensal por quantidade** (`0033`) e o **Premium pago** (`0034` a `0036`) | `0024` (a última confirmada no seu projeto, em 29/09) |
| `supabase/atualizacao-0033.sql` | `0033` | só o modelo mensal por quantidade, o bucket e as políticas do áudio | `0032` |
| `supabase/atualizacao-0034.sql` | `0034` a `0036` | **Premium pago** (assinatura, ciclos), **taxa de 2% do proprietário** e o **benefício do primeiro mês** (desligado por feature flag) | `0033` |

Cada arquivo parcial confere, antes de tudo, se a migração anterior à
primeira dele já está no banco. Se não estiver, ele para ali **sem mudar
nada** e avisa: "Este banco ainda não tem a migração 24 (…). Nada foi
alterado: rode o supabase/setup.sql completo". **Na dúvida, cole o
`setup.sql` completo**: ele aplica só o que falta e pula o resto. Os
parciais são gerados com:

```bash
pnpm tsx scripts/build-supabase-setup.ts --desde 33
```

*Verificado em 04/10/2026 (modelo mensal, migração `0033`):* num banco montado
como o Supabase monta — PostGIS no schema `extensions`, schemas `auth` e
`storage` já existentes e o SQL rodado por um papel **sem superusuário** — o
`setup.sql` entra sem erro (37 de 37 migrações), cria o bucket `chat-audio` e as
duas políticas, e rodar de novo não faz nada. O schema resultante bate com o do
Drizzle (`verify-paridade`, coluna por coluna, índice por índice, CHECK por
CHECK), e as 101 checagens de locação (`verify-reservas`) passam nele. Também
bateram o `atualizacao-0025.sql` sobre um banco parado na `0024`, o
`atualizacao-0033.sql` sobre um parado na `0032` e o `setup.sql` completo sobre
um parado na `0024`. As políticas do áudio foram exercitadas de verdade: quem
participa da conversa lê o arquivo; um estranho não lê e não envia.

*Verificado com dados:* a `0033` foi aplicada a cópias de bancos de
desenvolvimento **parados na `0032` e já cheios** (29 e 9 reservas, 18 delas por
hora/dia/semana, anúncios publicados, alugados, pausados e arquivados): nenhuma
reserva foi apagada, a quantidade disponível de **todos** os anúncios ficou
igual a "oferecidas − locações que ocupam vaga", e o schema final bateu com o
de um banco novo. A cadeia completa `0000` → `0033` também sobe sozinha num
banco vazio.

Pronto: 40 tabelas, índices geoespaciais, triggers, RLS, as políticas do
bucket de fotos e as taxas iniciais.

**É seguro rodar mais de uma vez.** Cada migração só é aplicada se ainda não
estiver registrada em `drizzle.__drizzle_migrations`. Projeto novo recebe tudo;
projeto que já tem parte do schema recebe apenas o que falta; rodar duas vezes
seguidas não faz nada na segunda.

Ao terminar, a saída mostra o que foi feito (exemplo da época em que a 0009
era a última migração):

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
SELECT count(*) FROM drizzle.__drizzle_migrations;            -- 34 (uma por migração)
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
pnpm tsx scripts/verify-schema.ts   # 164 passaram
pnpm tsx scripts/verify-safety.ts   # 77 passaram
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

**Imagem aérea (satélite) no mapa de exploração (`/mapa`).** O botão
"Mostrar imagem aérea" só liga com uma destas variáveis — sem elas ele fica
desligado e **diz isso** (nada é simulado):

| Variável | O que faz |
|---|---|
| `NEXT_PUBLIC_MAPTILER_KEY` | usa o estilo `hybrid` do MapTiler (imagem aérea com nomes de ruas). A mesma chave dos tiles de rua |
| `NEXT_PUBLIC_SATELLITE_TILE_URL` (+ `NEXT_PUBLIC_SATELLITE_TILE_ATTRIBUTION`) | fonte própria de tiles aéreos, `https://.../{z}/{x}/{y}.jpg` |

Imagem aérea tem custo e licença próprios — confira os termos do provedor
antes de ligar para o público.

**O worker do mapa (automático, mas bom saber).** O MapLibre processa camadas
(como o círculo do raio) e estilos vetoriais num *worker*. Dentro do Next ele
não acha o próprio arquivo sozinho, então o projeto copia o worker de
`node_modules` para `public/maplibre/` (`scripts/copy-maplibre-worker.mjs`, que
roda em `postinstall`, `pnpm dev` e `pnpm build`) e o `setWorkerUrl()` aponta
para lá (`src/lib/maps/worker.ts`). `public/maplibre/` é **gerado** e não vai
para o Git. Sem ele, o círculo do raio não aparece e o MapTiler sai em branco —
o `pnpm check:producao` avisa se a pasta estiver ausente.

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
152 checagens — ver [STATUS.md](./STATUS.md)). O que falta agora só você
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

Isso já roda 152 checagens contra um Asaas "de mentira" que imita o contrato
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
  4. **Eventos:** marque ao menos `PAYMENT_CREATED`, `PAYMENT_CONFIRMED`,
     `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`,
     `PAYMENT_DELETED`, `PAYMENT_REPROVED_BY_RISK_ANALYSIS` e
     `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` — são os que o código de hoje já
     sabe tratar (`src/lib/payments/webhook.ts`). Outros eventos chegam sem
     erro, mas ficam marcados como "não tratado ainda".
     - `PAYMENT_RECEIVED` é **indispensável**: Pix e boleto chegam direto
       nele, sem passar por `PAYMENT_CONFIRMED` (só o cartão passa pelos
       dois). Sem ele, nada pago por Pix é confirmado.
     - `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` (Parte 12) é o cartão recusado
       na cobrança automática do mês: é ele que abre o "Pagamento pendente"
       com a janela de 2 horas para regularizar.
     O `PAYMENT_CREATED` é o da renovação mensal (Fase 23): é ele que avisa
     quando o Asaas gera a mensalidade seguinte, e com ele o locatário vê
     "Pagar agora" e o lembrete antes do vencimento. Sem ele, a renovação
     ainda é registrada quando for paga ou atrasar, mas o botão de pagar só
     aparece se ela atrasar.

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

### 4.7 Chave Pix na conta — para o QR aparecer na tela (Parte 12)

**PRECISA DA SUA AÇÃO.** O QR Code e o "copia e cola" que aparecem na tela
de pagamento (reserva por tempo, "Pagar agora" do pagamento pendente) vêm
do Asaas, e ele só gera o QR para contas com **chave Pix cadastrada**. No
painel do Asaas (sandbox e, depois, produção): **Pix → Minhas chaves →
Cadastrar chave** — a chave aleatória serve.

Sem a chave, nada finge funcionar: a cobrança continua valendo, a tela
mostra as formas de pagamento, o cartão segue pela página segura do Asaas e
quem escolher Pix lê o motivo que o Asaas devolver. Só o Pix na própria tela
não aparece.

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

**Não é opcional.** `src/lib/rate-limit.ts` já sabe falar com o Upstash
(contador via REST, compartilhado entre instâncias) — testado contra um
dublê do contrato REST em `pnpm tsx scripts/verify-rate-limit.ts`. Sem as
duas variáveis abaixo, ele cai sozinho para um `Map` em memória, que **não
funciona em serverless** (cada instância tem o próprio contador — a proteção
contra força bruta na tela de login vira ilusória).

1. [upstash.com](https://upstash.com) → **Create Database** → Redis
2. Região: mesma do app
3. Copie `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`

---

## 7. Sentry — erros (antes de produção)

O código já está integrado (`src/instrumentation.ts`,
`src/instrumentation-client.ts`, `src/sentry.server.config.ts`,
`src/sentry.edge.config.ts`, `next.config.ts`) — falta só o projeto real.

1. [sentry.io](https://sentry.io) → projeto **Next.js**
2. Copie o DSN em `NEXT_PUBLIC_SENTRY_DSN`
3. Opcional, só para o stack trace no painel vir legível (não minificado):
   crie um **Auth Token** (Settings → Auth Tokens) e preencha
   `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` e `SENTRY_PROJECT`. Sem isso o app
   funciona normalmente, o source map só não sobe no build.

Sem o DSN, o SDK simplesmente não envia nada — não é um `try/catch` que
esconde a ausência, é o comportamento padrão do próprio pacote. Mas sem
ele você fica sabendo dos erros pelo cliente reclamando.

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

## 10. Anthropic — classificação de padrão do espaço (opcional)

**Opcional** — o resto do app funciona inteiro sem isso. Habilita só a
ferramenta "Classificar espaço" em Meus espaços (Fase 16): a IA analisa as
fotos de verdade (acabamento, sinais de desgaste) pra compor um score de
padrão que só o próprio proprietário vê.

1. [console.anthropic.com](https://console.anthropic.com) → **Settings → API
   Keys** → crie uma chave
2. Copie em `ANTHROPIC_API_KEY`
3. Cobrança é por uso (sem plano fixo) — o modelo usado
   (`claude-haiku-4-5`) é o mais barato da família com visão, e a ação tem
   limite de 10 classificações por usuário a cada 24h (`src/lib/quality/actions.ts`)
   pra não deixar um uso em excesso, de propósito ou por engano, virar conta
   alta sozinho

Sem a chave, o botão continua na tela mas a ação recusa explicitamente
("A classificação por IA ainda não está configurada"), nunca inventa um
resultado — mesma regra de `requireIntegration` usada em todo o resto do
app (Asaas, Upstash, Sentry).

---

## 11. CRON_SECRET — notificações agendadas (Fase 18)

**Opcional, mas sem ele dois avisos não acontecem sozinhos:** o lembrete de
aluguel vencendo (7 dias e 1 dia antes) e o resumo de atividade do
proprietário (favoritos/conversas novas). O resto da Fase 18 (queda de
preço, disponibilidade, "novo espaço compatível") dispara na hora, dentro da
própria ação que muda o dado — só estes dois dependem de o tempo passar
sozinho, sem ninguém abrir o app.

1. Gere um valor aleatório longo, por exemplo:
   ```bash
   openssl rand -hex 32
   ```
2. Copie em `CRON_SECRET` (local e na Vercel)
3. Na Vercel, **nenhuma configuração extra é necessária** além da env var: o
   arquivo `vercel.json` já declara o agendamento (uma vez por dia), e a
   Vercel manda esse mesmo valor automaticamente no header `Authorization`
   de toda chamada agendada — convenção própria dela, documentada em
   [vercel.com/docs/cron-jobs](https://vercel.com/docs/cron-jobs)

Sem a variável configurada, `/api/cron/notificacoes` recusa a chamada
(503) em vez de rodar sem checar quem está chamando — mesma regra de
`requireIntegration` de todo o resto do app. Cron do plano **Hobby** roda no
máximo 1x/dia, por isso o agendamento é diário (não a cada hora).

**Fase 23** — o mesmo job diário também faz, sem configuração nova:

- aviso de queda de preço que ficou esperando o intervalo mínimo entre avisos;
- rede de segurança da lista de espera (quem ainda não foi avisado de que o
  espaço voltou);
- resumo dos alertas de busca salvos (o que chegou dentro do intervalo
  mínimo e ficou agrupado — Premium: 1 hora; gratuito: 24 horas). No plano
  Hobby, o resumo de 1 hora do Premium só sai na próxima publicação que
  bata com o alerta ou na rodada diária — limite do plano, não do código;
- aviso "seu relatório do mês está pronto" para proprietários com movimento
  no mês anterior (dias 1 a 7 de cada mês, um por mês);
- lembrete de renovação 7 dias e 1 dia antes do vencimento, agora com
  espaço, data, valor e se a cobrança já está disponível.

**Parte 12** — o mesmo `CRON_SECRET` protege o agendador por minuto
(`/api/cron/minuto`, §15), e o job diário também roda a manutenção dos
aluguéis, como rede de segurança caso o agendador por minuto pare.

---

## 12. VAPID — notificação push no celular (Fase 19)

**Opcional, mas sem isto a notificação só aparece dentro do app** (o sininho
existente desde a Fase 15). Com VAPID configurado, ela também aparece como
notificação de verdade no celular/computador da pessoa — inclusive com o app
fechado — do mesmo jeito que WhatsApp Web, Gmail etc. fazem no navegador.

1. Gere o par de chaves (não precisa de conta em lugar nenhum, é só
   criptografia local):
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Copie os dois valores:
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — pública de propósito, o navegador
     precisa dela para pedir permissão de notificação
   - `VAPID_PRIVATE_KEY` — nunca leva `NEXT_PUBLIC_`, fica só no servidor
3. Defina `VAPID_SUBJECT` como `mailto:` + um e-mail de contato real (ex.:
   `mailto:contato@myplace.com.br`) — é o que os navegadores mostram como
   remetente se abusarem do canal de push

Sem as 3 variáveis, `/minha-conta` mostra honestamente que a notificação
push não está disponível neste ambiente (nunca finge que ativou) e o resto
do app continua funcionando normalmente — o sino dentro do app não depende
disto.

**Limitação de plataforma, não deste código:** no iPhone/iPad, o Safari só
entrega push para um site depois que a pessoa adiciona-o à tela de início
("Adicionar à Tela de Início") — restrição da Apple, sem contorno possível a
partir do navegador comum.

---

## 13. Twilio Verify — verificação de telefone por SMS (Fase 21)

**Opcional, mas sem isto ninguém ganha o selo "Telefone verificado".** O resto
do perfil, das avaliações e das verificações funciona normalmente — a tela
`Minha conta → Verificações` diz com todas as letras que a verificação por
SMS ainda não está disponível, e nenhum código é enviado.

**Por que um serviço de verificação, e não "gerar um código e mandar por
SMS":** no Twilio Verify o código nunca passa pela MyPlace — quem gera,
envia, expira (10 minutos) e confere é o Twilio. Não existe código guardado
no nosso banco para vazar, nem comparação feita por nós que um bug pudesse
aceitar errado. O selo só é gravado quando o Twilio responde `approved`.

1. Crie a conta em [twilio.com](https://www.twilio.com/try-twilio)
2. No **Console**, em **Account Info** (página inicial), copie:
   - **Account SID** (começa com `AC`) → `TWILIO_ACCOUNT_SID`
   - **Auth Token** → `TWILIO_AUTH_TOKEN` — é **segredo**: nunca leva
     `NEXT_PUBLIC_`, nunca vai para chat ou issue
3. Em **Verify → Services → Create new**, crie um serviço (nome sugerido:
   `MyPlace`, canal **SMS** ligado) e copie o **Service SID** (começa com
   `VA`) → `TWILIO_VERIFY_SERVICE_SID`
4. Coloque as três variáveis no `.env.local` e na Vercel. **Não** defina
   `TWILIO_VERIFY_BASE_URL` — ela só existe para os testes automatizados
   apontarem para o dublê local
5. Teste: entre no app, abra **Minha conta → Verificações**, informe seu
   celular, receba o SMS e digite o código. O selo aparece no seu perfil
   público (`/perfil/<seu-id>`). `pnpm check:producao` também confirma que
   as três variáveis estão presentes

**Conta de teste (trial) do Twilio:** só envia SMS para números que você
mesmo cadastrou e confirmou no Console (**Verified Caller IDs**). Para
usuários reais é preciso ativar a conta (adicionar saldo). Se o SMS não
chegar para números do Brasil, confira nas configurações do Verify as
**permissões geográficas** — o Brasil (+55) precisa estar liberado.

**Custo:** cobrado por verificação, sem mensalidade — confira o preço atual
em [twilio.com/verify/pricing](https://www.twilio.com/en-us/verify/pricing).
A MyPlace já limita os pedidos de código por pessoa (rate limit + no máximo
uma verificação pendente por vez, garantido pelo banco) e o próprio Twilio
barra reenvio excessivo ao mesmo número, então um usuário sozinho não
consegue gerar uma conta alta.

**O que continua fora, de propósito:** verificação de **identidade**
(documento + selfie). A estrutura existe no banco
(`identity_verification_status`), mas nenhum provedor está integrado e o
selo "Identidade verificada" **não aparece para ninguém** até existir um de
verdade (ex.: idwall, unico, Serpro Datavalid). Escolher o provedor é uma
decisão sua — custo, contrato e LGPD mudam bastante entre eles.

---

## 14. Anthropic — busca por necessidade e sugestões de anúncio (opcional)

> **PRECISO DA SUA AÇÃO** (só se quiser ligar estas duas funções — o resto do
> app funciona sem elas)

1. **Serviço:** Anthropic (API do Claude). É a mesma chave da seção 10 — se
   você já configurou `ANTHROPIC_API_KEY` lá, não precisa fazer nada aqui.
2. **Motivo:** duas funções da Fase 23 usam a IA, e só para *interpretar* ou
   *sugerir* — nunca muda banco, preço, reserva, pagamento ou permissão:
   - **Busca por necessidade:** quando a pessoa escreve algo que as regras
     não entendem sozinhas (ex.: "lugar para minha lancha no inverno"), a IA
     só traduz o texto para os filtros que já existem. Sem a chave, a busca
     usa só as regras e, quando a IA seria necessária, mostra "Não
     conseguimos processar a busca inteligente agora. Você pode continuar
     usando os filtros tradicionais."
   - **Melhorar anúncio:** sugestões de título e descrição a partir do que
     o anúncio já tem. Nada muda até o proprietário clicar em "Usar este
     título/descrição". Sem a chave, o botão "Pedir sugestões" recusa com
     mensagem clara — nunca mostra sugestão inventada.
3. **Onde criar:** [console.anthropic.com](https://console.anthropic.com) →
   **Settings → API Keys → Create Key** (a organização precisa ter cobrança
   ativa em **Settings → Billing**).
4. **Como configurar:** na Vercel, **Project → Settings → Environment
   Variables**, adicione `ANTHROPIC_API_KEY` para *Production* (e *Preview*,
   se quiser testar lá) e faça um novo deploy. Localmente, no `.env.local`.
   Nunca com prefixo `NEXT_PUBLIC_` e nunca no código.
5. **Credenciais necessárias:** só a chave de API (começa com `sk-ant-`).
6. **Variável de ambiente:** `ANTHROPIC_API_KEY` (só no servidor).
   `ANTHROPIC_BASE_URL` existe apenas para os testes automatizados apontarem
   para o dublê local — **não configure em produção**.
7. **Como testar:**
   - Em `/espacos`, escreva "lugar para minha lancha no inverno" e busque:
     deve aparecer "Resultados para:" com o tipo e o veículo entendidos, sem
     o aviso de falha.
   - Em **Meus espaços**, num anúncio publicado, clique em **Melhorar
     anúncio → Pedir sugestões**: aparecem sugestões, e o anúncio só muda
     se você clicar em "Usar este título" ou "Usar esta descrição".

**Custo e limites (controlados no banco, `platform_settings`):**

| Função | Modelo | Limite |
|---|---|---|
| Busca por necessidade | `claude-haiku-4-5` (rápido e barato; responde em segundos) | `ai.search_daily_limit` = 500 chamadas/dia no total; só chama quando as regras não bastam; mesma pergunta repetida não chama de novo (cache) |
| Melhorar anúncio | `claude-opus-5-5`, esforço baixo, com o fallback de servidor ligado (se o modelo recusar, o próprio serviço tenta outro modelo — opção da API, não muda nada no app) | `ai.listing_daily_limit_per_owner` = 5 por proprietário/dia, `ai.listing_space_cooldown_minutes` = 10 min por anúncio, `ai.listing_daily_limit` = 300/dia no total |

Os contadores ficam em `ai_usage_counters` (por dia e função, sem dado de
quem chamou). Trocar um limite é um `UPDATE` em `platform_settings`, sem
deploy.

---

## 15. Agendador por minuto

**PRECISA DA SUA AÇÃO.** Alguns avisos e rotinas precisam acontecer no minuto
certo mesmo com o app fechado: "falta pouco para o proprietário responder",
"falta pouco para pagar", o aviso do pagamento pendente, a lista de espera
("Avise-me quando estiver disponível"), o encerramento dos pedidos que
chegaram na data e o cancelamento da cobrança no Asaas. Quem faz isso é a rota
`GET /api/cron/minuto`, que precisa ser chamada **a cada minuto** com o header
`Authorization: Bearer <CRON_SECRET>` (o mesmo segredo do §11).

> Os **prazos em si** (24 h para o proprietário responder, 24 h para pagar,
> 2 h para regularizar) não dependem deste agendador: quem os aplica é o
> relógio do banco, a cada leitura. Sem o agendador, o prazo vale do mesmo
> jeito; o que atrasa são os avisos e a lista de espera.

O plano Hobby da Vercel só agenda uma vez por dia — por isso a rota **não**
está no `vercel.json`. Escolha um dos caminhos:

**A) Supabase (recomendado — nada de conta nova, o segredo fica no Vault).**
No painel: **Database → Extensions**, ative `pg_cron` e `pg_net`. Depois, no
**SQL Editor**, troque os dois valores e rode uma vez:

```sql
-- Guarda o endereço e o segredo no Vault (não ficam no texto do agendamento).
select vault.create_secret('https://SEU-DOMINIO', 'myplace_site_url');
select vault.create_secret('COLE_AQUI_O_CRON_SECRET', 'myplace_cron_secret');

-- Chama a rota a cada minuto.
select cron.schedule(
  'myplace-aluguel-por-minuto',
  '* * * * *',
  $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'myplace_site_url') || '/api/cron/minuto',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'myplace_cron_secret')
    ),
    timeout_milliseconds := 20000
  );
  $$
);
```

Para conferir: `select status_code, content from net._http_response order by
created desc limit 5;` deve mostrar `200` e `{"ok":true,...}`. Para parar:
`select cron.unschedule('myplace-aluguel-por-minuto');`.

**B) cron-job.org (gratuito).** Crie um job com a URL
`https://SEU-DOMINIO/api/cron/minuto`, a cada 1 minuto, método GET, e em
**Advanced → Headers** adicione `Authorization` = `Bearer SEU_CRON_SECRET`.
O segredo fica guardado num serviço de terceiro — ele só permite disparar a
manutenção (que é idempotente) e a resposta só traz contagens, mas se vazar,
troque o `CRON_SECRET`.

**C) Vercel Pro.** Acrescente ao `vercel.json`
`{ "path": "/api/cron/minuto", "schedule": "* * * * *" }`. A Vercel manda o
`CRON_SECRET` sozinha, como no job diário.

Teste à mão (qualquer caminho):

```bash
curl -i -H "Authorization: Bearer SEU_CRON_SECRET" https://SEU-DOMINIO/api/cron/minuto
# 200 {"ok":true,"released":0,"notices":0,"outbox":{...}}
# sem o header: 401 · sem CRON_SECRET na Vercel: 503
```

Chamar duas vezes no mesmo minuto não duplica nada (avisos com chave única,
um executor por vez no gateway). E se o agendador parar, nada fica
**errado**: disponibilidade, contagem e prazos são calculados pelo relógio
do banco na hora de ler, e o job diário roda a mesma manutenção como rede de
segurança — só os avisos, a lista de espera e o cancelamento no Asaas deixam de
sair na hora.

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

Rode `pnpm check:producao` — ele lê o `.env.local`/`.env` real e confere
sozinho boa parte da lista abaixo (integrações configuradas, `NEXT_PUBLIC_SITE_URL`
e `DATABASE_URL` fora de localhost, se existe ao menos um administrador). O
que exige julgamento seu (documento jurídico, plano pago, backup testado de
verdade) ele lista como lembrete, não como aprovado.

- [ ] Supabase Pro (o plano grátis pausa por inatividade)
- [ ] Vercel Pro (uso comercial)
- [ ] Domínio com HTTPS
- [ ] SPF, DKIM e DMARC configurados
- [ ] Upstash configurado (rate limiting real)
- [ ] Sentry recebendo eventos
- [ ] Asaas em produção, com KYC aprovado
- [ ] Chave Pix cadastrada na conta Asaas (QR na tela — §4.7)
- [ ] Agendador por minuto chamando `/api/cron/minuto` (§15)
- [ ] **Termos de Uso e Política de Privacidade revisados por advogado**
- [ ] Backup do banco verificado — testando uma restauração, não só confiando
- [ ] Um administrador criado (`UPDATE profiles SET role='admin' WHERE id='…'`)
