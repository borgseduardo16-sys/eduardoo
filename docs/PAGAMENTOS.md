# Pagamentos — análise dos gateways e economia real do modelo

> **Última revisão:** 16/09/2026 (taxas atualizadas para 3% + 3%)
> Preços e recursos de gateway mudam. Antes de assinar contrato, confirme tudo
> em [docs.asaas.com](https://docs.asaas.com) e com o gerente comercial.

---

## 1. O que o produto exige do gateway

| # | Requisito | Por quê |
|---|-----------|---------|
| 1 | Split de pagamento | A plataforma retém a taxa e repassa o resto ao proprietário na mesma transação |
| 2 | Subcontas / contas conectadas | Cada proprietário precisa de uma conta de recebimento própria |
| 3 | KYC do recebedor via API | Sem verificação de identidade não há repasse legal |
| 4 | Cobrança recorrente mensal | O modelo é aluguel mensal |
| 5 | Split **na recorrência** | Não adianta split só em cobrança avulsa |
| 6 | Webhooks | Confirmação de pagamento só vale vinda do gateway |
| 7 | Pix, boleto e cartão | Pix é o meio dominante no Brasil |
| 8 | Estorno e tratamento de chargeback | Disputas vão acontecer |

O requisito **5 é o filtro** que elimina a maior parte das opções.

---

## 2. Comparação

### Mercado Pago — **não recomendado para este caso**

Tem split (`marketplace_fee` / `application_fee`) e tem assinaturas
(`/preapproval`), mas são **produtos separados**. A documentação de split
descreve a integração sobre Checkout Pro, Transparente e Bricks; a de
assinaturas não documenta o parâmetro de comissão do marketplace.

**Limitação:** não há, na documentação pública, um caminho suportado para
split automático em cada cobrança de uma assinatura. A saída seria a
plataforma receber tudo e repassar por transferência separada — o que
significa **a plataforma custodiar dinheiro de terceiros**, com implicações
regulatórias sérias no Brasil. Não vamos por aí.

### Pagar.me (Stone) — tecnicamente viável, com atrito

Tem recebedores, split e **split na recorrência** documentado. Duas ressalvas
que pesam:

- Split em recorrência **só por percentual** (`type: 'percentage'`). O modelo
  2%+2% em percentual sobre o total dá 96,0784…% para o proprietário. Com duas
  casas decimais (96,08%), um aluguel de R$ 100 repassaria R$ 97,98 em vez de
  R$ 98,00. Dois centavos por mês, por contrato — pequeno, mas é divergência
  permanente de conciliação.
- O split é descrito como disponível **para clientes PSP**, o que envolve
  contrato comercial específico e análise.

### Stripe — não recomendado para o Brasil aqui

O Connect lista o Brasil entre os países suportados para contas Custom e
Express, e Billing + Connect resolveria recorrência com split. Mas:

- Custo de cartão no Brasil mais alto que os concorrentes locais.
- Sem Pix Automático, que é justamente o que torna este modelo viável.
- Onboarding de KYC desenhado para outros mercados.

Boa ferramenta, mercado errado para este produto.

### Asaas — **recomendado**

Instituição de pagamento que atende todos os oito requisitos com documentação
pública:

| Requisito | Situação |
|-----------|----------|
| Split | [Split de pagamentos](https://docs.asaas.com/docs/split-de-pagamentos) — aceita valor fixo **e** percentual, e permite combinar |
| Split na recorrência | [Split em assinaturas](https://docs.asaas.com/docs/split-em-assinaturas) |
| Subcontas via API | [Criação de subcontas](https://docs.asaas.com/docs/criacao-de-subcontas) — devolve `walletId` e `apiKey` |
| KYC | [Fluxo de aprovação](https://docs.asaas.com/docs/detalhamento-do-fluxo-de-aprovacao-de-subcontas) e link de envio de documentos |
| Webhooks | Configuráveis inclusive na criação da subconta |
| Pix, boleto, cartão | Todos |
| **Pix Automático** | [Documentado](https://docs.asaas.com/docs/pix-automatico) — débito recorrente autorizado uma vez pelo pagador |

**O `fixedValue` do split é o detalhe decisivo.** Ele permite garantir que o
proprietário receba exatamente R$ 98,00 — sem os dois centavos de erro que o
split percentual traria.

### Pix Automático muda a conta

Obrigatório para todas as instituições desde 16/06/2025. O pagador autoriza uma
vez, no app do banco, e as parcelas seguintes são debitadas automaticamente.
No Asaas usa-se a **Jornada 3**: o consentimento é colhido no pagamento da
primeira cobrança, com `paymentCreationMode: SUBSCRIPTION`.

Para este produto isso significa recorrência automática de verdade **sem
depender de cartão** — sem validade que vence, sem limite estourado, sem
chargeback, e com tarifa fixa baixa.

---

## 3. A economia real do modelo 3% + 3%

> **Histórico:** o modelo começou em 2% + 2%. A conta abaixo mostrou que isso
> não cobria o custo de cartão (0,68% de margem em um aluguel de R$ 180), e a
> taxa foi elevada para 3% de cada lado, com aluguel mínimo de R$ 35,00.

### Como o dinheiro se move

O split do Asaas é calculado sobre o **`netValue`** — o valor da cobrança
**depois** de descontada a tarifa. A tarifa sai primeiro, e quem a absorve é a
conta que emitiu a cobrança (a plataforma).

```
Locatário paga        R$ 103,00   (aluguel 100 + 3% dele)
  − tarifa do Asaas   R$   1,99   (Pix)
  = netValue          R$ 101,01
  − split ao dono     R$  97,00   (fixedValue: aluguel − 3% dele)
  = fica na plataforma R$  4,01
```

A plataforma **fatura** R$ 6,00 (3% + 3%), mas **embolsa** R$ 4,01.

### Tarifas de referência (tabela pública, após os 3 meses promocionais)

| Meio | Tarifa |
|------|--------|
| Pix | R$ 1,99 por recebimento |
| Boleto | R$ 1,99 por recebimento |
| Cartão de crédito (assinatura/parcelado) | 2,99% + R$ 0,49 |

> São preços de tabela, negociáveis por volume. Confirme os seus na sua conta.

### Receita líquida por aluguel

| Aluguel | Locatário paga | Dono recebe | Bruto | **Líquido Pix** | **Líquido cartão** |
|--------:|---------------:|------------:|------:|----------------:|-------------------:|
| R$ 35 *(mínimo)* | R$ 36,05 | R$ 33,95 | R$ 2,10 | R$ 0,11 | R$ 0,53 |
| R$ 50 | R$ 51,50 | R$ 48,50 | R$ 3,00 | R$ 1,01 | R$ 0,97 |
| R$ 80 | R$ 82,40 | R$ 77,60 | R$ 4,80 | R$ 2,81 | R$ 1,85 |
| R$ 100 | R$ 103,00 | R$ 97,00 | R$ 6,00 | **R$ 4,01** | **R$ 2,43** |
| R$ 150 | R$ 154,50 | R$ 145,50 | R$ 9,00 | R$ 7,01 | R$ 3,89 |
| R$ 180 | R$ 185,40 | R$ 174,60 | R$ 10,80 | **R$ 8,81** | **R$ 4,77** |
| R$ 250 | R$ 257,50 | R$ 242,50 | R$ 15,00 | R$ 13,01 | R$ 6,81 |
| R$ 300 | R$ 309,00 | R$ 291,00 | R$ 18,00 | R$ 16,01 | R$ 8,27 |
| R$ 600 | R$ 618,00 | R$ 582,00 | R$ 36,00 | R$ 34,01 | R$ 17,03 |

*(Calculado por `src/lib/money.ts` e conferido em `scripts/verify-schema.ts`.)*

### Comparação com o modelo anterior

Em um aluguel de R$ 180 — o valor típico de uma vaga de garagem:

| | 2% + 2% | **3% + 3%** | Ganho |
|---|--------:|------------:|------:|
| Líquido no Pix | R$ 5,21 | **R$ 8,81** | +69% |
| Líquido no cartão | R$ 1,22 | **R$ 4,77** | +291% |
| Margem no cartão | 0,68% | **2,65%** | — |

**O ganho principal não é o aluguel barato — é o cartão de crédito.** A 2%+2%
o cartão era um meio oferecido no prejuízo; a 3%+3% ele se sustenta.

### Ponto de equilíbrio

| Meio | 2% + 2% | **3% + 3%** |
|------|--------:|------------:|
| Pix | R$ 49,75 | **R$ 33,17** |
| Cartão | R$ 50,25 | **R$ 16,50** |

Daí o mínimo de **R$ 35,00** (`booking.min_rent_cents = 3500`): acima do
equilíbrio nos dois meios, com folga pequena mas positiva.

> **Detalhe que vale saber:** abaixo de ~R$ 49 o **cartão fica mais barato que
> o Pix** para a plataforma — os R$ 0,49 fixos do cartão perdem para os R$ 1,99
> fixos do Pix. Acima disso o Pix ganha, e a diferença só cresce.

### O que continua valendo

1. **O Pix segue sendo o melhor meio** acima de R$ 49: quase o dobro da margem
   do cartão, sem chargeback, e com recorrência automática via Pix Automático.
2. **A taxa é configurável sem deploy** (`platform_settings`). Mudar é um
   `UPDATE`, e fica registrado em `audit_logs`.
3. **Mudança de taxa não afeta contrato vigente.** Cada reserva guarda as taxas
   do momento do aceite (`bookings.renter_fee_bps` e `owner_fee_bps`).
4. **6% no total ainda é baixo** para um marketplace com custódia de pagamento
   e mediação. Há espaço para revisar quando houver volume.

### O risco que cresce junto com a taxa

Quanto maior a taxa, maior o incentivo para as duas partes se conhecerem pela
plataforma e depois combinarem Pix direto entre elas. A 6% sobre R$ 180, são
R$ 10,80/mês — R$ 129 por ano — que os dois economizam saindo da plataforma.

Esse é o risco estrutural do modelo, maior que qualquer detalhe de gateway. As
defesas estão descritas em [SEGURANCA.md](./SEGURANCA.md): endereço exato só
liberado após reserva aceita, conversa dentro da plataforma, e detector que
avisa quem está prestes a aceitar um pagamento por fora.

## 4. O que ainda precisa ser confirmado com o Asaas

Não consegui confirmar estes pontos apenas com a documentação pública. São
perguntas para o suporte/gerente **antes** de começar a Fase 7:

1. **Split funciona junto com Pix Automático?** Split em assinaturas está
   documentado, e Pix Automático está documentado — mas não achei confirmação
   explícita dos dois **juntos**. Se não funcionarem juntos, o plano muda.
2. **Tokenização de cartão em produção** exige liberação do gerente, sujeita a
   análise prévia. Isso está na documentação.
3. **Criação de subcontas white-label** — quais são as exigências contratuais.
4. **Tarifas reais** da sua conta, e a partir de quando a promoção acaba.
5. **Comportamento quando o `fixedValue` do split é maior que o `netValue`** —
   em aluguel muito baixo, ou se a tarifa subir. Precisamos saber se o Asaas
   recusa a cobrança ou repassa menos.
6. **Chargeback em transação com split já liquidado** — quem arca.

---

## 5. Situação atual

| Item | Estado |
|------|--------|
| Cálculo de valores no servidor | **IMPLEMENTADO** — `src/lib/money.ts`, testado |
| Invariantes de valor no banco | **IMPLEMENTADO** — o banco recusa total adulterado |
| Taxas configuráveis sem deploy | **IMPLEMENTADO** — `platform_settings`, hoje em 3% + 3% |
| Aluguel mínimo | **IMPLEMENTADO** — R$ 35,00, acima do equilíbrio nos dois meios |
| Tabelas de pagamento, repasse e livro-razão | **IMPLEMENTADO** |
| Idempotência de webhook | **IMPLEMENTADO** — chave única por evento |
| Integração com o Asaas | **NÃO IMPLEMENTADO** — Fase 7 |
| Criação de subconta e KYC | **NÃO IMPLEMENTADO** — Fase 8 |
| Cobrança real | **BLOQUEADO POR SERVIÇO EXTERNO** — depende da sua conta Asaas |

**Nenhum botão de pagamento existe hoje.** Não há checkout falso, não há
"pagamento simulado", não há tela de sucesso sem cobrança. Quando existir, vai
ser cobrança real ou erro real.
