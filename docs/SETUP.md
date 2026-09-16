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
| MapTiler | Grátis até 100k carregamentos | ~US$ 25/mês | Fase 3 |
| Google Geocoding | US$ 200/mês de crédito grátis | ~US$ 5 / 1.000 buscas | Fase 3 |
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

### 1.5 Criar o bucket de fotos (pode deixar para a Fase 2)

**Storage → New bucket:**
- **Name:** `space-images`
- **Public bucket:** **desmarcado**. As fotos são servidas por URL assinada.

### 1.6 Rodar as migrações

```bash
cp .env.example .env.local     # preencha com os valores acima
pnpm install
pnpm db:migrate
pnpm tsx scripts/verify-schema.ts   # deve terminar com "28 passaram"
pnpm dev
```

---

## 2. Domínio (quando for publicar)

- **`.com.br`** — [registro.br](https://registro.br), ~R$ 40/ano. Exige CPF ou CNPJ.
- **`.com`** — [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/),
  ~US$ 10/ano, vendido a preço de custo.

Escolha o nome definitivo antes. "MyPlace" é provisório e trocar depois dá
trabalho (e-mails, links, marca).

---

## 3. Mapas e geocodificação — Fase 3

### 3.1 MapTiler (mapa na tela)

1. [maptiler.com](https://www.maptiler.com) → conta grátis
2. **Keys** → copie para `NEXT_PUBLIC_MAPTILER_KEY`
3. **Restrinja a chave ao seu domínio** — ela é pública por natureza; a
   restrição de origem é o que impede alguém de gastar sua cota.

### 3.2 Google Geocoding (endereço → coordenada)

Melhor cobertura no Brasil, e isso importa: coordenada errada põe o anúncio no
lugar errado.

1. [console.cloud.google.com](https://console.cloud.google.com) → novo projeto
2. Ative **Geocoding API**
3. **Credentials** → **Create credentials** → **API key**
4. **Restrinja:** *Application restrictions* → **IP addresses** (é chamada de
   servidor); *API restrictions* → somente **Geocoding API**
5. **Defina um teto de gastos** em Billing → Budgets & alerts. Sem teto, um bug
   em laço vira fatura alta.
6. Copie para `GOOGLE_GEOCODING_API_KEY` e ponha `GEOCODING_PROVIDER=google`

> Busca de CEP usa [BrasilAPI](https://brasilapi.com.br), que é gratuita e não
> precisa de chave.

---

## 4. Asaas — pagamentos (Fase 7)

**Leia [PAGAMENTOS.md](./PAGAMENTOS.md) antes.** Há uma conclusão sobre a
margem do modelo 2%+2% que muda decisões de negócio.

### 4.1 Sandbox primeiro

1. [sandbox.asaas.com](https://sandbox.asaas.com) → conta de teste
2. **Configurações → Integrações → Chave de API** → `ASAAS_API_KEY`
3. `ASAAS_ENV=sandbox`
4. `ASAAS_WEBHOOK_TOKEN` — **você inventa** este valor (ex.: 32 caracteres
   aleatórios). Ele vai no painel do Asaas e no `.env`; é como o servidor
   confirma que o webhook veio mesmo de lá.

### 4.2 Conta de produção

Vai exigir:
- **CNPJ** (fortemente recomendado — PF em marketplace de dinheiro de terceiros
  é problema)
- Documento do sócio administrador e selfie
- Dados bancários da empresa
- Declaração de faturamento
- Descrição da atividade

Prazo de análise costuma ser de alguns dias úteis.

### 4.3 Perguntas a fazer ao gerente **antes** de programar

Estão listadas em [PAGAMENTOS.md §4](./PAGAMENTOS.md#4-o-que-ainda-precisa-ser-confirmado-com-o-asaas).
A mais importante:

> **Split de pagamento funciona junto com Pix Automático?**

Se a resposta for não, a arquitetura de cobrança muda — melhor descobrir em
uma conversa do que depois de duas semanas de código.

Peça também a liberação de **tokenização de cartão em produção**: a
documentação diz que depende de análise prévia do gerente.

---

## 5. Resend — e-mails (Fase 6)

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
