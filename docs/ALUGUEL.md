# Locação mensal por quantidade

Este documento descreve como a MyPlace aluga espaços hoje: **só por mês**, com
uma **quantidade** de unidades por anúncio. Ele substitui o desenho da Parte 12
(unidades individuais, aluguel por hora/dia/semana), que foi removido. O
estado de cada peça fica em [STATUS.md](./STATUS.md); as tabelas, em
[BANCO-DE-DADOS.md](./BANCO-DE-DADOS.md).

O fluxo inteiro, em uma linha:

> **anúncio → quantidade disponível → solicitação → aceite (com instruções de
> acesso) → pagamento → locação mensal → renovações**

---

## 1. O que existe e o que NÃO existe

| Existe | Não existe (de propósito) |
|---|---|
| Aluguel **mensal**, renovado todo mês até alguém encerrar | Aluguel por hora, dia ou semana |
| **Quantidade** por anúncio: 1 garagem, 80 vagas de um estacionamento | Unidade física obrigatória (A1, B17…): a organização física é do proprietário |
| Data de início escolhida pelo locatário (até 90 dias à frente) | Calendário de horários |
| Instruções de acesso **obrigatórias** no aceite (texto e/ou áudio) | Ocupação física automática por unidade |
| Chat com texto e **áudio** (sem imagens) | Clientes externos (quem não é da plataforma) |
| Encerramento: o locatário na hora; o proprietário por **pedido** com data | Multa ou aviso prévio definidos (ainda não decididos) |

Fica para a **próxima etapa, separada**: Selo Verificado, Premium e seus
benefícios, redução de taxa por nível. Destaque e Turbo, que já existiam,
continuam como estavam.

---

## 2. Quantidade e a última vaga

O anúncio tem três números (`spaces`):

- `quantity_offered` — quantas unidades o proprietário oferece **na plataforma**;
- `quantity_total` — (opcional, só informativo) quantas o local tem no total.
  "Este local tem 100 vagas; 80 são oferecidas aqui.";
- `quantity_available` — quantas ainda estão livres **agora**.

Quem mantém o `quantity_available` é o **banco**, não o código: a função
`refresh_space_availability` **recomeça a contagem** a partir das locações
(não soma nem subtrai), então o número nunca diverge delas. Ocupam vaga as
locações em `approved`, `awaiting_payment`, `active` e `past_due`. Um pedido
ainda sem resposta (`requested`) **não ocupa nada**.

Quando não sobra vaga o anúncio vira `rented`; quando volta a sobrar, volta a
`published`. Aceitar diminui 1; encerrar, cancelar, recusar um aceite não pago
ou deixar o prazo vencer devolve 1.

**Duas pessoas disputando a última vaga:** o gatilho `bookings_guard_capacity`
trava a linha do anúncio (`FOR UPDATE`) antes de contar, então os aceites
simultâneos passam em fila — o segundo recebe "as vagas deste anúncio foram
preenchidas". O gatilho também recusa qualquer escrita direta (SQL, outro
caminho do código) que passe do oferecido, reportando a constraint
`bookings_capacity`. `verify-reservas.ts` e `verify-schema.ts` disparam
aceites em paralelo contra o Postgres de verdade para provar isto.

O proprietário não consegue baixar `quantity_offered` abaixo do que já está
ocupado (`spaces_guard_quantity`), e um anúncio publicado não fica sem preço
mensal (`spaces_published_requires_price`).

---

## 3. Estados — sem redundância

Quem lê a tela vê três eixos, cada um com poucos estados:

| Eixo | Estados vistos | Onde mora |
|---|---|---|
| **Solicitação** | pendente · aceita · recusada · expirada | `bookings.status` (`requested`, `approved`/`awaiting_payment`, `rejected`, `expired`) |
| **Pagamento** | pendente · autorizado/confirmado · falhou · regularizado | `payments.status` (`pending`, `confirmed`, `received`, `overdue`, `failed`…) |
| **Locação** | aguardando início · ativa · pagamento pendente · encerrada · cancelada | `bookings.status` (`active` com início futuro, `active`, `past_due`, `ended`, `cancelled`) |

Duas decisões para não repetir informação:

- "Aceita" e "aguardando pagamento" são a **mesma situação** para quem aluga
  (falta pagar). O banco distingue só se a pessoa já abriu o pagamento; a tela
  mostra **"Aceita — falta pagar"** nos dois.
- "Aguardando início" **não é um estado gravado**: é uma locação `active` cuja
  data de início ainda não chegou (`bookingBadge` em `src/lib/bookings/format.ts`).

"Autorizado" não existe como etapa própria: no Asaas, cartão e Pix não têm
pré-autorização separada (ver §5). "Regularizado" é o evento de uma locação em
`past_due` que volta a `active` depois do pagamento.

---

## 4. Prazos — sempre pelo relógio do banco

| Prazo | Quanto | Onde está gravado | Quem aplica |
|---|---|---|---|
| Proprietário responder | **24 h** | `bookings.response_deadline_at` | `release_expired_rentals` → `expired` (`request_not_answered`) |
| Locatário pagar depois do aceite | **24 h** | `bookings.first_payment_deadline_at` | `release_expired_rentals` → `expired` (`payment_not_received`); a vaga volta |
| Regularizar um pagamento que falhou | **2 h no total** | `payment_issue_started_at` / `payment_issue_deadline_at` | `release_expired_rentals` → `ended` (`payment_not_received`) |
| Encerramento pedido pelo proprietário | na **data** do pedido | `booking_end_requests.requested_end_date` | `release_expired_rentals` → `ended` (`owner_end_request`) |
| Início da locação | até **90 dias** à frente | `booking.max_start_advance_days` | a ação do servidor que recebe o pedido (`requestBookingAction`) |

Os números de 24 h vêm de `platform_settings` (`booking.request_expiry_hours`,
`booking.payment_deadline_hours`) e são **gravados na locação** quando o estado
muda (trigger `bookings_set_deadlines`) — mudar a configuração depois não mexe
em prazo que já corre. A janela de 2 horas é imposta por constraint:
`bookings_payment_window` recusa qualquer valor que não seja exatamente
`início + 120 min`.

**Quem executa:** `release_expired_rentals(p_space)` roda no Postgres, com
`now()` do banco (nunca o relógio do aparelho nem o do servidor web). Ela é
chamada a cada leitura relevante (`sweepExpiredBookings`: abrir a locação, a
lista, o anúncio) e por ações (aceitar, cancelar), então **o prazo vale mesmo
sem agendador**. O agendador por minuto (`/api/cron/minuto`, SETUP §15) cuida do
resto: avisos ("falta pouco para pagar"), e-mails e lista de espera.

Textos de data: "Próximo vencimento: 21/11/2026" e, onde o banco **guarda a
hora** (prazos de resposta/pagamento, janela de 2 h), "…às 13:00". O Asaas
trabalha com vencimento **sem hora**, então a tela nunca inventa uma hora para
a mensalidade.

**Datas: o "hoje" é o de Brasília.** O banco roda em UTC (o Supabase também), e
lá, depois das 21h em Brasília, já é "amanhã". Por isso nem as funções do banco
nem as consultas do app usam `CURRENT_DATE`: usam
`(now() AT TIME ZONE 'America/Sao_Paulo')::date` (no app, a constante
`HOJE_BR_SQL` de `src/lib/dates.ts`). A seção 13 de `verify-descoberta.ts`
prova que o resultado não muda com o fuso da sessão e que nenhum arquivo de
`src/` volta a usar `CURRENT_DATE`.

---

## 5. Pagamento — o que foi adaptado, e por quê

O pedido original era: "pagamento/autorização **antes** da aprovação do
proprietário". **Isto não é possível de forma honesta com o Asaas** (a
confirmação é da documentação oficial, listada no fim):

- **Pix** não tem retenção nem pré-autorização: a cobrança só existe depois de
  paga.
- **Cartão** só teria pré-autorização com os dados do cartão trafegando por
  este site (PCI) ou por um checkout próprio. Hoje o cartão é informado na
  **fatura do Asaas** — nunca no site.

Por isso a ordem é **solicitar → aceitar → pagar em até 24 h**: nada é cobrado
ao solicitar (a tela diz isso), o proprietário aceita sabendo que a vaga fica
presa por até 24 h, e se o locatário não pagar a vaga volta. **Esta é a maior
divergência do pedido** e está listada de novo em STATUS.md.

Depois do aceite o locatário escolhe:

- **Cartão** — assinatura mensal no Asaas (`billingType: CREDIT_CARD`): a
  primeira cobrança na fatura do Asaas e as seguintes **automáticas**;
- **Pix** — cobrança avulsa, com QR Code e "copia e cola" **no app** (o QR vem
  do Asaas, `GET /payments/{id}/pixQrCode`), uma por mês; a do mês aparece em
  "Meus aluguéis" com lembrete.

Os dois levam o **split** para o proprietário e todo valor é **inteiro em
centavos** (`src/lib/money.ts`): o navegador manda só o id da locação, o
servidor calcula o aluguel + a taxa do locatário, e o banco confere
(`bookings_rent_matches_space`, no gatilho `bookings_guard_price`: o aluguel
gravado tem de ser o preço do anúncio, no pedido e no aceite). A tela do proprietário mostra o líquido: "Você receberá R$ 291,00
por mês. Esse valor já considera a taxa de serviço de 3%." e o extrato
(`/meus-espacos/financeiro`) prioriza o valor líquido por mês e o total
recebido.

**Falha de cobrança** (cartão recusado, Pix não pago no mês): a locação vira
`past_due` e abre a janela de **2 horas no total**. Durante ela dá para tentar
outro cartão ou pagar por Pix (sobre a **mesma** cobrança). Regularizou: volta
a `active`. Não regularizou: `ended` e a vaga volta. Ao abrir o app, quem tem
pendência vê um aviso com **X** (some nesta sessão se fechar; os indicadores
continuam até resolver).

**Webhook** (`/api/webhooks/asaas`): idempotente por `evento:idDaCobrança`;
pagamento que chega **depois** que a locação já terminou é **estornado
automaticamente** e a pessoa é avisada.

Fontes (documentação oficial do Asaas):
[webhook de cobranças](https://docs.asaas.com/docs/webhook-para-cobrancas),
[assinatura com cartão](https://docs.asaas.com/docs/criando-assinatura-com-cartao-de-credito),
[remover assinatura](https://docs.asaas.com/reference/remover-assinatura),
[split em cobranças avulsas](https://docs.asaas.com/docs/split-de-pagamentos).

---

## 6. Instruções de acesso e privacidade

**Ao aceitar**, o proprietário é obrigado a escrever instruções (≥ 10
caracteres), gravar um áudio, ou os dois — o trigger `guard_booking_approval`
recusa o aceite sem isso, não só o formulário. O áudio vai para o bucket
privado `chat-audio`, na pasta da conversa; só texto/áudio da própria
locação são aceitos (o caminho é conferido).

O locatário **só vê** as instruções, o áudio, o endereço exato e o botão
**"Traçar rota"** depois do **pagamento confirmado** (locação `active` ou
`past_due`). A regra está no `WHERE` das consultas
(`getBookingAddressForRenter`, `accessAudioPathForUser`), não num `if` depois.
Quando o pagamento confirma, as instruções também vão para o chat.

**Localização pública** (`approx_location`, mantida pelo trigger
`sync_approx_location`):

- espaços **residenciais/pessoais**: ponto **deslocado** de 100 a 400 m,
  estável (não muda a cada leitura);
- tipos **comerciais** (`platform_settings['privacy.exact_location_types']`:
  loja, escritório, galpão, estacionamento, espaço para eventos, oficina): o
  ponto exato — o endereço desses espaços já é público por natureza;
- **rua, número e complemento** continuam privados para qualquer tipo, até a
  locação ser confirmada. Nenhuma consulta pública lê `location`.

Mudar a lista de tipos recalcula os anúncios existentes
(`platform_settings_privacy_resync`).

---

## 7. Encerrar

- **Locatário**: "Encerrar locação" — imediato; cancela a assinatura/cobranças
  abertas no gateway e devolve a vaga. Antes do pagamento, "Desistir da
  locação".
- **Proprietário**: **"Solicitar encerramento da locação"** — registra o pedido
  com **data** (até 1 ano à frente) e **motivo**, avisa o locatário e guarda o
  histórico em `booking_end_requests` (um pendente por locação; dá para
  retirar). Na data, a manutenção do banco encerra a locação e a vaga volta.
  Escolher "hoje" encerra na hora, e a tela avisa. Só quem é dono do anúncio, só
  em locação `active`/`past_due` (trigger `booking_end_requests_guard`).
- O proprietário também pode **desfazer um aceite que ainda não foi pago**.

Não há multa cobrada pela plataforma e **não há aviso prévio mínimo definido**
(`rental.end_request_min_notice_days` = 0, conferido por trigger para a regra
poder mudar sem deploy). O que valer entre as partes é o combinado no chat —
ver as limitações abaixo.

---

## 8. Notificações — só o que importa

| Evento | Quem recebe |
|---|---|
| Nova solicitação | proprietário |
| Solicitação perto de expirar (4 h) | proprietário |
| Aceita / recusada / expirada | locatário (e o proprietário, se expirou) |
| Falta pouco para pagar (4 h) / prazo vencido | locatário |
| **Pagamento confirmado** — um aviso por pessoa; se a locação já começou, o mesmo aviso diz isso | os dois |
| Locação começou (quando o pagamento veio **antes** da data de início, no dia) | os dois |
| Pagamento pendente (janela de 2 h) | os dois |
| Pedido de encerramento / retirado | locatário |
| Locação encerrada · avaliação disponível | quem não encerrou · locatário |
| Há vaga de novo ("Avise-me quando estiver disponível") | quem pediu o aviso |

Cada aviso tem chave de deduplicação: reenvio de webhook ou duas rodadas do
agendador não geram dois avisos iguais. Preferências por categoria e o push
(VAPID) seguem como antes.

---

## 9. Telas

| Tela | Para quem | O que mostra |
|---|---|---|
| `/mapa` | todos | mapa aéreo/de ruas centrado na localização aproximada, raio de 2 km, marcadores por categoria, prévia, filtros com contagem |
| `/espacos/[slug]` | todos | valor mensal, "N de M vagas disponíveis", como funciona, "Avise-me quando estiver disponível" quando lotado |
| `/espacos/[slug]/solicitar` | locatário | data de início, mensagem, resumo (aluguel + taxa), nada é cobrado |
| `/reservas` ("Meus aluguéis") | locatário | espaço, estado, início, próximo vencimento, situação do pagamento, histórico |
| `/reservas/[id]` | os dois | linha do tempo, instruções/rota (após pagar), renovação, encerramento |
| `/reservas/[id]/pagar` · `/pendente` | locatário | pagar em 24 h · regularizar em 2 h |
| `/meus-espacos` | proprietário | painel: anúncios, vagas, pendentes, ativas, próximas renovações, valores recebidos |
| `/meus-espacos/solicitacoes` | proprietário | quem pediu (sinais de confiança reais), aceitar com instruções, recusar |
| `/meus-espacos/financeiro` | proprietário | líquido por mês e total recebido |

---

## 10. O que depende de serviço externo (e não finge)

| Peça | Depende de | Sem isso |
|---|---|---|
| Cobrança real (cartão/Pix, split) | Asaas — `ASAAS_*` | `requireIntegration` falha com mensagem; nada é simulado |
| Imagem aérea no mapa | `NEXT_PUBLIC_MAPTILER_KEY` ou `NEXT_PUBLIC_SATELLITE_TILE_URL` | o botão fica desligado e diz isso |
| Agendador por minuto | job externo chamando `/api/cron/minuto` (SETUP §15) | prazos continuam valendo (banco); avisos e lista de espera atrasam |
| E-mail e push | Resend e VAPID | só a central de notificações |
| Telefone verificado | Twilio Verify | o selo não aparece para ninguém |

---

## 11. Limitações conhecidas

- O **Asaas só foi exercitado contra um dublê** local (contrato REST
  reproduzido); a primeira cobrança real é o teste que falta.
- O **áudio não passa por detector de contato** (o chat de texto tem um): dá
  para combinar pagamento por fora falando. É uma limitação de transcrição, não
  esquecimento.
- Mudar a lista de tipos com **ponto exato** recalcula os anúncios já
  publicados (inclusive o que o mapa mostra deles).
- **Aviso prévio e multa** de encerramento não estão definidos.
- No `/mapa`, até 60 espaços na tela cada um tem o seu marcador; **dois muito
  próximos podem se sobrepor** até a pessoa dar zoom (o toque vai para o de
  cima). Acima de 60 o mapa agrupa em círculos com contagem.
- A **avaliação** do locatário vale para o espaço e para o proprietário (uma
  só); o proprietário avalia o locatário à parte.
- Locações de **hora/dia/semana** da Parte 12 foram encerradas pela migração
  `0033` (nunca apagadas: pagamentos e livro-razão apontam para elas).

---

## 12. Testes

- `pnpm verify` — banco e regras: `verify-schema` (constraints e gatilhos),
  `verify-reservas` (fluxo, prazos, concorrência da última vaga),
  `verify-payments` (webhook, estorno, janela de 2 h), `verify-audio`,
  `verify-mapa` (clusterização, filtros, privacidade), `verify-paridade`
  (banco migrado × schema do Drizzle).
- `pnpm verify:integracoes` — navegador (Chromium) contra o build de produção:
  testes **R** (locação ponta a ponta no celular, com áudio gravado por
  microfone falso), **S** (`/mapa`) e **T** (passeio por 43 telas em 390 px:
  abrem sem erro e sem rolagem lateral), além dos antigos.
