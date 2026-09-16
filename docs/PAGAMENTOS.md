# Pagamentos — análise dos gateways e economia real do modelo

> **Última revisão:** 16/09/2026
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

## 3. A economia real do modelo 2% + 2%

Esta é a parte que precisa de atenção antes de qualquer linha de código de
pagamento.

### Como o dinheiro se move

O split do Asaas é calculado sobre o **`netValue`** — o valor da cobrança
**depois** de descontada a tarifa. Ou seja: a tarifa sai primeiro, e quem a
absorve é a conta que emitiu a cobrança (a plataforma).

```
Locatário paga        R$ 102,00   (aluguel 100 + 2% dele)
  − tarifa do Asaas   R$   1,99   (Pix)
  = netValue          R$ 100,01
  − split ao dono     R$  98,00   (fixedValue: aluguel − 2% dele)
  = fica na plataforma R$  2,01
```

A plataforma **fatura** R$ 4,00 (2% + 2%), mas **embolsa** R$ 2,01.

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
| R$ 40 | R$ 40,80 | R$ 39,20 | R$ 1,60 | **−R$ 0,39** | **−R$ 0,11** |
| R$ 50 | R$ 51,00 | R$ 49,00 | R$ 2,00 | **R$ 0,01** | **−R$ 0,01** |
| R$ 100 | R$ 102,00 | R$ 98,00 | R$ 4,00 | **R$ 2,01** | **R$ 0,46** |
| R$ 180 | R$ 183,60 | R$ 176,40 | R$ 7,20 | **R$ 5,21** | **R$ 1,22** |
| R$ 300 | R$ 306,00 | R$ 294,00 | R$ 12,00 | **R$ 10,01** | **R$ 2,36** |
| R$ 600 | R$ 612,00 | R$ 588,00 | R$ 24,00 | **R$ 22,01** | **R$ 6,71** |

*(Estes números são calculados por `src/lib/money.ts` e conferidos em
`scripts/verify-schema.ts`. Rode `pnpm tsx scripts/verify-schema.ts` para ver.)*

### As três conclusões

**1. Abaixo de ~R$ 50/mês a plataforma perde dinheiro em toda transação.**
Ponto de equilíbrio: R$ 49,75 no Pix, R$ 51,57 no cartão. Por isso existe
`booking.min_rent_cents = 5000` (R$ 50,00) já configurado no banco.

**2. No cartão, a margem é praticamente zero.** Em R$ 180/mês sobram R$ 1,22 —
0,68% do aluguel. Não sustenta operação, suporte, infraestrutura ou perdas com
chargeback.

**3. No Pix a margem existe, mas é apertada.** Em R$ 180/mês sobram R$ 5,21 —
2,9% do aluguel. Funciona, e escala bem com aluguéis maiores.

### O que eu recomendo

Você define o modelo de negócio — eu implementei exatamente os 2% + 2% que
você pediu, e deixei **configurável no banco** (`platform_settings`), sem
precisar de deploy para mudar. As opções, na minha ordem de preferência:

1. **Pix Automático como meio principal.** Tarifa fixa baixa, recorrência
   automática de verdade, sem chargeback. Cartão fica como alternativa.
2. **Manter o mínimo de R$ 50/mês.** Já está valendo.
3. **Revisar a taxa quando houver volume.** Marketplaces desta categoria
   costumam trabalhar com percentuais bem acima de 4% somados. Começar baixo
   para atrair os primeiros anunciantes é uma decisão legítima — só precisa ser
   decisão consciente, não descoberta depois.
4. **Se mantiver cartão com 2%+2%, repasse a tarifa.** Ou cobrando a tarifa do
   cartão explicitamente de quem escolhe esse meio, ou descontando do repasse.
   Qualquer das duas precisa estar clara nos Termos de Uso.

---

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
| Taxas configuráveis sem deploy | **IMPLEMENTADO** — `platform_settings` |
| Tabelas de pagamento, repasse e livro-razão | **IMPLEMENTADO** |
| Idempotência de webhook | **IMPLEMENTADO** — chave única por evento |
| Integração com o Asaas | **NÃO IMPLEMENTADO** — Fase 7 |
| Criação de subconta e KYC | **NÃO IMPLEMENTADO** — Fase 8 |
| Cobrança real | **BLOQUEADO POR SERVIÇO EXTERNO** — depende da sua conta Asaas |

**Nenhum botão de pagamento existe hoje.** Não há checkout falso, não há
"pagamento simulado", não há tela de sucesso sem cobrança. Quando existir, vai
ser cobrança real ou erro real.
