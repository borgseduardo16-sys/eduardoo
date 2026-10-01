# Aluguel — unidades, temporário, contínuo e pagamentos (Parte 12)

Este documento registra a auditoria feita antes da Parte 12 e a arquitetura
que saiu dela. O que muda no código está descrito aqui; o estado de cada
peça fica em [STATUS.md](./STATUS.md).

---

## 1. Auditoria — como era antes desta etapa

| Peça | Como funcionava | Consequência para a Parte 12 |
|---|---|---|
| Anúncio | um espaço = uma coisa alugável; `spaces.price_monthly_cents` obrigatório | não existia unidade, grupo, nem preço por hora/dia/semana |
| Reserva | `bookings` com `start_date`/`end_date` em **dias**; índice único "uma reserva vigente por espaço" | não havia horário de início/fim, nem como ter 10 vagas alugadas ao mesmo tempo |
| Fluxo | solicitar → proprietário aceita → locatário paga → ativo. Ao aceitar, **todas** as outras solicitações do espaço eram recusadas | com várias unidades, recusar todo mundo estaria errado |
| Cobrança | assinatura mensal no Asaas com `billingType: UNDEFINED` (a pessoa escolhe Pix/boleto/cartão a cada mês, pela fatura) | não existia "cobrança automática", logo não existia "falha da cobrança automática" |
| Atraso | `PAYMENT_OVERDUE` → reserva `past_due` **sem prazo** | a unidade podia ficar ocupada indefinidamente sem pagamento |
| Encerrar | "Encerrar aluguel" já era imediato e cancelava a assinatura no Asaas antes de mexer no banco | aproveitado; ganhou o motivo do encerramento |
| Agendador | um cron diário da Vercel (`/api/cron/notificacoes`, plano Hobby) | prazos de 7 e 40 minutos não cabem num cron diário |
| Webhook | idempotente por `evento:idDaCobrança`, rota real `/api/webhooks/asaas` | aproveitado; ganhou o evento de cartão recusado |

### O que o Asaas oferece (confirmado na documentação oficial)

- Assinatura com `billingType: CREDIT_CARD` sem mandar o cartão pela API: a
  pessoa informa o cartão na fatura do próprio Asaas (`invoiceUrl`) e as
  próximas mensalidades são cobradas automaticamente nesse cartão.
- Cartão recusado gera o evento `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED`.
- `DELETE /v3/subscriptions/{id}` encerra a recorrência **e remove as
  cobranças pendentes ou vencidas** dela; as pagas continuam no histórico.
- `PUT /v3/payments/{id}` troca a forma de pagamento (`billingType`) de uma
  cobrança aguardando pagamento ou vencida.
- `GET /v3/payments/{id}/pixQrCode` devolve o QR Code e o "copia e cola" do
  Pix para cobranças `PIX`, `BOLETO` ou `UNDEFINED`.
- Cartão de **débito** não é aceito pela API: só aparece na fatura do Asaas
  quando a cobrança é `CREDIT_CARD` ou `UNDEFINED`.
- Split vale também para cobrança avulsa (`POST /v3/payments`).

Fontes: [webhook de cobranças](https://docs.asaas.com/docs/webhook-para-cobrancas),
[assinatura com cartão](https://docs.asaas.com/docs/criando-assinatura-com-cartao-de-credito),
[remover assinatura](https://docs.asaas.com/reference/remover-assinatura),
[atualizar cobrança](https://docs.asaas.com/reference/atualizar-cobranca-existente),
[QR Code Pix](https://docs.asaas.com/reference/obter-qr-code-para-pagamentos-via-pix),
[cobranças via cartão](https://docs.asaas.com/docs/cobrancas-via-cartao-de-credito).

---

## 2. Modelo

### Unidades e grupos

- **`space_unit_groups`**: um grupo de unidades com as mesmas regras — modos
  (contínuo, temporário ou ambos), preço mensal, regra de tempo, horário de
  funcionamento e se aceita renovação. Todo anúncio tem pelo menos um grupo.
- **`space_units`**: cada vaga/box/sala. Pertence a um grupo do mesmo
  anúncio (chave estrangeira composta). Unidade com histórico nunca é
  apagada: é desativada.
- Anúncios que já existiam ganharam um grupo e uma unidade, com o mesmo
  preço mensal de antes — nada muda para eles.

### Regra de tempo (aluguel temporário)

Duas formas, uma por grupo:

1. **Preço por período** — "R$ 50 por hora, máximo 5 horas". Hora, dia ou
   semana. Opcional para dia/semana: aceitar períodos menores com preço
   proporcional (diária de R$ 200 → 6 horas = R$ 50).
2. **Pacotes** — "Até 1 hora R$ 50 · Até 5 horas R$ 120 · Até 10 horas
   R$ 180". A pessoa escolhe um pacote. O banco recusa pacotes repetidos,
   fora de ordem ou um pacote mais longo mais barato que um mais curto —
   nunca há duas regras para a mesma duração.

Todo cálculo é no servidor, em centavos inteiros. Proporcional arredonda
**uma vez**, meio para cima (`round half up`) sobre o total — nunca soma
valores já arredondados por hora.

### Reserva

`bookings` ganhou: `kind` (`continuous`/`temporary`), `group_id`, `unit_id`,
`starts_at`/`ends_at` (horário exato), `occupied_until` (fim + janela de
renovação), duração comprada, `hold_expires_at` (prazo para pagar a
reserva temporária), as duas janelas de pagamento pendente e
`end_reason` (por que acabou).

**Ninguém aluga a mesma unidade ao mesmo tempo** — garantido pelo banco com
uma restrição de exclusão (`bookings_unit_no_overlap`): duas reservas que
ocupam a mesma unidade não podem ter intervalos sobrepostos. Aluguel
contínuo ocupa a unidade do início em diante (intervalo sem fim), então
também bloqueia temporárias por cima dele.

### Estados

Os estados que já existiam foram reaproveitados, sem criar sinônimos:

| Estado | Contínuo | Temporário |
|---|---|---|
| `requested` | solicitação enviada | — |
| `approved` | aceita, unidade reservada, falta pagar | — |
| `awaiting_payment` | primeira cobrança gerada | unidade segura até `hold_expires_at` enquanto a pessoa paga |
| `active` | em dia | pago; "próximo" se ainda não começou, "em uso" durante, "janela de renovação" nos 7 minutos depois do fim |
| `past_due` | **pagamento pendente**: janelas de 40 min + 1 h | — |
| `ended` | encerrado (motivo em `end_reason`) | terminou (motivo em `end_reason`) |
| `cancelled`, `rejected`, `expired` | como antes | `expired` = prazo de pagamento passou |

"Próximo", "em uso", "em processamento" e "janela de renovação" são
derivados do horário do banco, não gravados — gravar seria criar um estado
que fica errado sozinho com o passar do tempo.

---

## 3. Prazos — sempre pelo relógio do banco

| Prazo | Valor | Onde fica |
|---|---|---|
| Pagar uma reserva temporária | 15 min (configurável) | `hold_expires_at` |
| Janela de renovação | **7 min, fixo** | `occupied_until = ends_at + 7 min` |
| Aviso de fim | 10 min antes | agendador por minuto |
| Pagamento pendente — 1ª janela | **40 min, fixo** | `payment_issue_started_at` |
| Pagamento pendente — 2ª janela | **+1 h, fixo** | `payment_issue_deadline_at` |

A **correção não depende de agendador nenhum**: disponibilidade, contagem
regressiva e prazos são calculados pelo horário do banco; reserva vencida
é liberada pela própria transação que tenta alugar a unidade
(`release_expired_rentals`). O agendador por minuto só dispara o que
precisa acontecer na hora certa mesmo sem ninguém abrir o app: avisos,
cancelamento da recorrência no Asaas e estornos.

---

## 4. Pagamentos

- **Temporário**: cobrança avulsa no Asaas, com split para o proprietário.
  Pix aparece na própria tela (QR e copia e cola, do Asaas); cartão de
  crédito ou débito abre a fatura do Asaas. Só vale quando o webhook
  confirma.
- **Contínuo**: assinatura mensal real. Cartão de crédito = cobrança
  automática todo mês; Pix = cobrança mensal paga pelo app.
- **Falha** (cartão recusado ou mensalidade vencida): 40 min, depois mais
  1 h para regularizar. "Pagar agora" nunca cria cobrança nova — reaproveita
  a cobrança em aberto (troca para Pix ou abre a fatura do cartão).
  Passou o prazo: aluguel encerrado, recorrência cancelada no Asaas
  (`DELETE`, que também remove a cobrança em aberto), unidade liberada.
- **Pagamento depois do encerramento**: estornado automaticamente.
- **Cancelar aluguel**: imediato — recorrência cancelada no Asaas antes de
  qualquer mudança no banco; se o Asaas recusar, nada muda e a pessoa vê
  o motivo.
- **Valor mínimo por cobrança**: R$ 35 (`booking.min_rent_cents`), o mesmo
  piso das reservas mensais. Durações que ficariam abaixo disso nem
  aparecem na lista (R$ 20/hora começa em 2 horas), o servidor recusa com
  "O valor mínimo de um aluguel é R$ 35,00. Escolha uma duração maior." e o
  banco recusa de novo (`bookings_temporary_minimum`).
- **Pix não passa por `PAYMENT_CONFIRMED`**: o Asaas manda
  `PAYMENT_CREATED → PAYMENT_RECEIVED` para Pix e boleto, e
  `PAYMENT_CREATED → PAYMENT_CONFIRMED → PAYMENT_RECEIVED` para cartão.
  O `RECEIVED` de uma cobrança ainda pendente faz antes tudo o que o
  `CONFIRMED` faria (ativar, regularizar, reativar ou estornar). Ver §8.

---

## 5. Telas

| Tela | O que mostra |
|---|---|
| Página do anúncio | "Como alugar": quantas unidades há, livres e ocupadas ("3 vagas · 3 disponíveis · 0 ocupadas"), mensal por grupo e reserva por tempo com só as durações válidas; "Falar com o proprietário" pelo chat |
| Pagar (`/reservas/[id]/pagar`) | Pix na tela (QR e "copia e cola" do Asaas) com o prazo de 15 min correndo — "A vaga fica segura para você até 13:21"; cartão abre a fatura segura do Asaas; confirma sozinha quando o webhook chega |
| Meus aluguéis (`/reservas`) | seções **Pagamento pendente · Em andamento · Próximos · Aguardando · Histórico**. Temporário: "Começa em…", "Tempo restante: 1 h 59 min — termina às 15:06", janela de renovação e "Renovar aluguel" com o total que será cobrado ("Total: R$ 41,20 (aluguel R$ 40,00 + taxa de serviço R$ 1,20)", calculado no servidor). Mensal: "R$ 309,00/mês · Renovação automática ativa (cartão)" — o total que é cobrado todo mês, já com a taxa de serviço (aluguel de R$ 300) —, "Próxima cobrança", **sem contagem regressiva**, e "Cancelar aluguel" |
| Detalhe do aluguel (`/reservas/[id]`) | o mesmo tempo restante, próximos passos, resumo (unidade, período, valores), como terminou, link para a renovação |
| Pagamento pendente (`/reservas/[id]/pendente`) | o texto pedido, "Tempo restante" (1ª janela) ou "Último prazo" (2ª), valor em aberto, motivo informado pelo gateway, **Pagar agora** (a mesma cobrança: Pix na tela ou cartão) e **Cancelar aluguel**; pergunta de novo ao servidor a cada 8 s |
| Aviso ao abrir o app | antes de tudo, o aviso "Pagamento pendente" com o texto, a unidade, o tempo restante, "Pagar agora", "Cancelar aluguel" e um **X**. Fechou: não volta nesta sessão para a mesma pendência. Abriu o app de novo: aparece de novo enquanto não resolver. Não aparece nas telas do próprio aluguel com problema |
| Indicadores | ponto vermelho em "Meus aluguéis" (cabeçalho e barra inferior) enquanto houver pendência; **"!" só no aluguel com problema**. Os dois somem só quando o webhook confirma o pagamento — fechar o aviso não apaga nada |
| Tela principal | **nenhum tempo restante** (observação da etapa 14): o tempo fica em Meus aluguéis e no detalhe do aluguel |
| Proprietário — Solicitações | filtro "Em andamento", unidade e horário de cada aluguel, "Encerrar aluguel" no mensal |

Toda contagem regressiva parte da hora do **servidor** (a tela recebe a hora
dele e os instantes gravados; o relógio do aparelho só faz o ponteiro andar)
e todo horário é mostrado no fuso de Brasília.

---

## 6. Agendador por minuto e fila do gateway

`GET /api/cron/minuto` (com `Authorization: Bearer <CRON_SECRET>`) roda a
manutenção dos aluguéis:

1. **varre o que venceu** pelo relógio do banco (`release_expired_rentals`):
   prazo de pagamento da reserva por tempo, janela de renovação, prazo
   final do pagamento pendente;
2. **avisa**: "Seu aluguel termina em 10 minutos.", "Último prazo para
   regularizar o pagamento", "Aluguel encerrado por falta de pagamento" e
   "Reserva expirada" — cada aviso uma vez só (`dedupeKey` por reserva);
3. **executa no gateway o que o banco marcou** nas próprias linhas:
   recorrência cancelada ainda sem confirmação do Asaas, cobrança marcada
   para excluir, pagamento marcado para estornar. Um executor por vez
   (`pg_try_advisory_xact_lock`): duas chamadas simultâneas nunca mandam o
   mesmo estorno duas vezes. Se o Asaas falhar, a marca continua e a
   próxima rodada tenta de novo.

A mesma varredura roda **antes de ler** (Meus aluguéis, detalhe do
aluguel, pagamento pendente) e na transação de quem tenta alugar. Quando ela
encerra alguma coisa, os avisos e os efeitos no gateway saem depois da
resposta (`after()`), sem atrasar a tela. A disponibilidade da página do
anúncio nem depende dela: já é calculada pelo relógio do banco. O cron
diário (`/api/cron/notificacoes`) roda a manutenção também, como rede de
segurança.

O plano Hobby da Vercel só agenda uma vez por dia, então o "por minuto"
precisa de um agendador externo — [SETUP.md §15](./SETUP.md#15-agendador-por-minuto-parte-12).
Sem ele, nada fica **errado** — disponibilidade, contagem e prazos são
calculados pelo relógio do banco na hora de ler. O que deixa de acontecer
na hora certa: o aviso "termina em 10 minutos" (na prática, não sai), o de
último prazo e o de encerramento; e o cancelamento/estorno no Asaas, que só
sai quando alguém abre uma tela de aluguel e há algo vencido para
encerrar, ou na rodada diária.

---

## 7. Robustez

- **Valores**: o navegador manda só ids, a duração e o horário de início. O
  servidor calcula em centavos (`src/lib/rentals/pricing.ts`), e o banco
  recalcula e recusa outro valor (gatilho e `CHECK`).
- **Idempotência**: cada formulário de reserva/renovação leva uma chave
  gerada quando a tela abre, gravada na reserva (única por locatário).
  Reenviar o mesmo formulário devolve a mesma reserva. O webhook continua
  idempotente por `evento:idDaCobrança`.
- **Duplo clique**: os botões ficam desabilitados durante o envio, e "Pagar
  agora" trava a linha da cobrança (`SELECT … FOR UPDATE`): dois toques
  simultâneos fazem **uma** chamada ao gateway (testado).
- **Concorrência**: exclusão por unidade no banco + trava do anúncio na
  transação. Duas pessoas no mesmo horário da última vaga: uma consegue, a
  outra lê "Essa vaga acabou de ser reservada para esse horário. Escolha
  outro horário." (testado).
- **CPF/CNPJ**: conferido antes de chamar o gateway. Documento que já é de
  outra conta vira mensagem clara, e a reserva que nasceu sem cobrança é
  desfeita na hora (a unidade não fica presa).
- **Fuso**: o servidor roda em UTC; dia e horário são sempre convertidos
  pelo fuso de Brasília (`src/lib/rentals/time.ts`). Testado com reserva
  das 23:00 à 01:00.
- **Histórico**: toda mudança relevante vai para `audit_logs` — reserva
  criada ou renovada, forma de pagamento escolhida, janela de pagamento
  aberta, cobrança confirmada, recebida, vencida ou recusada, reativação
  depois de pagamento atrasado, estorno pedido e enviado, recorrência
  cancelada no gateway, reserva descartada — e o motivo do fim fica em
  `end_reason`.

---

## 8. Achados durante os testes desta etapa (corrigidos)

1. **Pix nunca ativava a reserva** — defeito antigo, de antes desta etapa.
   O código só ativava no `PAYMENT_CONFIRMED`, que o Asaas não manda para
   Pix. Valia para o checkout mensal, as renovações, a reserva por tempo, a
   compra de Destaque/Turbo e a caução. Corrigido nos três tratadores de
   webhook.
2. **Pagamento que chega depois do encerramento**: além do estorno, não gera
   mais repasse ao proprietário nem lançamento de repasse no livro-razão.
3. **CPF gravado antes das validações** e **erro 500** quando o CPF já era
   de outra conta (o índice único estourava) — agora é mensagem clara, antes
   de falar com o Asaas.
4. **Dois toques em "Pagar agora"** faziam duas chamadas ao Asaas.
5. **Erro de publicação sem mensagem**: o Drizzle embrulha o erro do
   Postgres e o nome da regra violada fica em `cause`. Afetava também as
   mensagens antigas "anúncio incompleto" e "marque a localização".
6. **Modais colados no canto superior esquerdo** (denúncia, selo Premium,
   destacar anúncio, filtros e o novo aviso): o preflight do Tailwind zera a
   `margin: auto` que centraliza o `<dialog>`.
7. **"Falar com o proprietário" sumiu da página do anúncio** na parte 1
   desta etapa — regressão minha, achada pelo teste de ponta a ponta e
   restaurada.
8. **Recusa automática com texto errado**: com uma unidade só, a pessoa
   lia "Todas as vagas foram alugadas"; com boxes, "Todas as boxes".
9. **Ocupação no painel de desempenho**: um aluguel de 2 horas contava
   como ocupado "até hoje". Agora conta só os dias que tocou.
10. **Meus aluguéis mostrava o prazo final** (1 h 40) no lugar da janela
    atual (40 min) no pagamento pendente — diferente do aviso e da tela de
    pendência.
11. **"Renovar aluguel" mostrava só o aluguel** ("Mais 2 horas — R$ 40,00")
    ao lado de "R$ 41,20 pagos": agora mostra também o total que será
    cobrado, com a taxa de serviço, pela mesma conta da cobrança.

---

## 9. Limitações conhecidas

- **Nada foi testado contra o Asaas de verdade** (nem sandbox): os testes
  usam um dublê local que segue o contrato HTTP documentado. A primeira
  cobrança real precisa ser acompanhada.
- **Pix mensal não é automático**: o "Pix Automático" do Banco Central não
  foi implementado. Quem escolhe Pix paga cada mensalidade pelo app; para
  essa pessoa, "falha da cobrança automática" é a mensalidade vencida (a
  tela diz isso com outras palavras). Cartão de crédito é automático.
- **Débito** só pela fatura do Asaas (a API não aceita).
- **QR do Pix na tela** exige uma chave Pix cadastrada na conta Asaas.
- **Estorno com split**: o código pede o estorno da cobrança inteira; como o
  Asaas desfaz a parte já repassada ao proprietário precisa ser confirmado
  com o suporte deles antes de produção.
- **Renovação não paga**: ao pedir a renovação, o fim protegido do aluguel
  atual passa a ser o fim exato do horário (a renovação começa ali, sem
  sobrepor). Se a pessoa não pagar a renovação nos 15 minutos, ela expira e
  a unidade fica livre no fim exato do horário — sem os 7 minutos de
  janela. Dá para pedir de novo enquanto o aluguel atual não acabar.
- **Bloqueios do calendário** valem para o anúncio inteiro, não por unidade.
- **Agendador por minuto** depende de configuração externa (§6).

---

## 10. Testes

| Suíte | O que prova | Resultado |
|---|---|---|
| `scripts/verify-alugueis.ts` | motor TS = SQL (centavos), regras e mensagens, reserva pelo fluxo real com Pix e split, concorrência, prazo vencido, pagamento atrasado (reativa ou estorna), renovação, aviso de 10 min, contínuo com cartão, recusa do cartão (40 min + 1 h, "Pagar agora" na mesma cobrança), encerramento sem pagamento, fila do gateway com dois executores, segredo do cron, fuso de Brasília | 106 checagens, 0 falhas — também no banco montado pelo SQL do Supabase, com o papel sem superusuário |
| `scripts/verify-alugueis-navegador.ts` | Chromium de verdade, build de produção: proprietária configura e publica pela tela; locatário reserva 2 h e paga com Pix (webhook pela rota HTTP real); tempo restante em Meus aluguéis e **não** na tela principal, e o total da renovação com a taxa de serviço; recusa do cartão → aviso ao abrir com X, ponto no menu, "!" só no aluguel com problema, nova sessão mostra de novo, pago some tudo; proprietária vê unidade e horário | 28 checagens, 0 falhas |
| `scripts/verify-schema.ts` | regras do banco (seção 16 nova: grupos, unidades, exclusão por unidade, gatilhos, prazos, permissões) | 218 checagens, 0 falhas |
