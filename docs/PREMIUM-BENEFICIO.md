# Premium — benefício do primeiro mês (Fase C) e o que ainda NÃO foi provado

**Estado: construído, testado contra um DUBLÊ do Asaas, DESLIGADO (feature flag) e
NÃO validado no Asaas real.** Nenhum dinheiro da plataforma se move enquanto a flag
`premium.first_month_benefit_enabled` estiver em `0` (padrão). O banco também recusa
criar benefício com a flag desligada (`premium_benefits_flag_off`).

## O que o benefício é

- Premium **pago e vigente** (ciclo pago; Pix libera na confirmação; **cartão: 7 dias de
  carência** — `premium.card_hold_days` — que é trava de risco, não garantia contra contestação).
- **Um** por ciclo, até **R$ 100,00** (`premium.first_month_benefit_max_cents`), só na
  **primeira cobrança de uma locação nova** do próprio Premium como locatário; não vale em
  renovação, no próprio anúncio, nem acumula, nem vira dinheiro.
- Abate `min(R$ 100, aluguel)`. A taxa de serviço do locatário **não** é abatida.
- Identidade por **HMAC do CPF** (`IDENTITY_HASH_SECRET`): trocar de conta com o mesmo CPF
  no mesmo período não renova o direito.
- O proprietário **não perde**: a plataforma recebe a primeira cobrança (já abatida) e
  **transfere o repasse inteiro** (`platform_transfers`) da conta principal para a subconta.

## Como o código faz (e onde)

| Peça | Onde |
|---|---|
| Conta do abatimento (nunca passa de R$ 100; nunca "completa" o mínimo do gateway) | `computeFirstMonthBenefit` em `src/lib/money.ts` |
| Direito, carência, identidade, reserva, consumo, fila, validação, exposição | `src/lib/premium/benefit.ts` |
| Travas no banco (flag, ciclo, teto, locação nova, só 1ª cobrança, imutável, sem DELETE) | migração `0036` (`guard_premium_benefit`) |
| Gancho no checkout (só com a flag ligada) | `startCheckoutAction` |
| Consumo + fila ao receber o pagamento; razão com `premium_benefit_id` | `src/lib/payments/webhook.ts` |
| Fila de transferências (cron por minuto) | `processTransferOutbox` (em `runBookingMaintenance`) |
| Validação de transferência por webhook | `src/app/api/webhooks/asaas/transferencias/route.ts` |
| Painel: Premium elegíveis × R$ 100 × saldo da conta principal (lido no servidor) | `/admin/premium` |
| Validação no sandbox (rodar com chave de sandbox) | `scripts/validar-asaas-beneficio.ts` |

## O que o código ASSUME do Asaas — nada disto foi confirmado

Este ambiente **não alcança o Asaas** (a rede bloqueia `api-sandbox.asaas.com`, HTTP 403 do
proxy) e a validação **não foi feita**. Cada item abaixo precisa ser exercitado no sandbox
(`scripts/validar-asaas-beneficio.ts`) e, antes da primeira operação real, na configuração real:

1. `GET /v3/finance/balance` devolve o saldo da conta principal (`balance`, em reais).
2. `PUT /v3/payments/{id}` aceita **trocar o valor** e **remover o split** de uma cobrança
   pendente **gerada por assinatura**, sem mudar o valor das mensalidades seguintes.
3. `POST /v3/transfers` com `walletId` transfere da conta principal para a subconta, e o saldo
   fica disponível; aceita `externalReference`.
4. A **validação de transferência por webhook** (operação crítica) precisa ser **habilitada pelo
   suporte do Asaas** (não vem ligada; sujeita a análise). O formato do corpo que a rota espera
   (`transfer.value`, `transfer.externalReference`, `transfer.walletId`) segue a documentação
   lida e **não foi confirmado**; a rota **reprova** em qualquer dúvida.
5. O evento que confirma que a transferência "pousou" não está confirmado: por isso a
   transferência fica `sent`, nunca `confirmed`, até haver um evento confirmado.

> Regra do projeto: **se o sandbox contradisser qualquer item, PARE e informe exatamente qual —
> não invente alternativa.** O script para no primeiro passo que falha e imprime a resposta.

## Pontos em aberto (precisam de decisão do produto)

1. **Aluguel baixo.** Como o abatimento é `min(R$ 100, aluguel)` e a taxa de 3% do locatário
   fica, o que sobra cobrar é menor que R$ 5 (mínimo do gateway) para aluguéis até ~R$ 101,94.
   Hoje o benefício **não se aplica** nesses casos (R$ 80 e R$ 100 incluídos) — a tela deve
   dizer isso; o exemplo "R$ 80 consome R$ 80" **não acontece** com esta regra.
2. O benefício abate só o **aluguel**, não a taxa do locatário. Confirmar.
3. Contas "claramente vinculadas" ao proprietário: só dá para comparar o CPF do locatário
   entre contas Premium; o CPF do proprietário não é guardado localmente.
4. Contestação (chargeback) depois do consumo: a operação é identificável (benefício ↔ locação
   ↔ cobrança ↔ transferência ↔ ciclo do Premium), mas **não há desfazimento automático**.
5. A UI do checkout ainda **não mostra** o abatimento (a flag está desligada; ao ligar, a tela
   precisa dizer o valor abatido e, quando não se aplica, o motivo).

## Para ligar (só depois de validar)

1. Rodar `scripts/validar-asaas-beneficio.ts` no sandbox e levar o resultado ao produto.
2. Pedir ao suporte do Asaas a validação de transferência por webhook e cadastrar a URL
   `/api/webhooks/asaas/transferencias`.
3. Definir `IDENTITY_HASH_SECRET` e repor saldo na conta principal (ver `/admin/premium`).
4. Repetir a validação na configuração **real**.
5. Só então `premium.first_month_benefit_enabled = 1`.
