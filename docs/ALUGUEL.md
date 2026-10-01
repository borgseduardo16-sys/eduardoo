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
