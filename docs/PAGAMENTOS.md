# Pagamentos — análise dos gateways e economia real do modelo

> **Última revisão:** 18/09/2026 — reconfirmação da escolha e resolução da
> dúvida sobre split + Pix Automático (ver §4). **Feita por busca, não por
> leitura direta da documentação** — o ambiente desta sessão bloqueia acesso
> a `docs.asaas.com` (testado e confirmado, não é suposição). Antes de
> assinar contrato ou tocar em credencial real, confirme tudo em
> [docs.asaas.com](https://docs.asaas.com) e com o gerente comercial.

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

## 4. Reconfirmação em 18/09/2026, e o que ainda falta

### Como esta rodada foi feita — leia antes de confiar nela

O ambiente onde rodo tem uma política de rede que **bloqueia `docs.asaas.com`
por completo** — testado de duas formas independentes: uma sub-tarefa minha
tentou buscar 5 páginas específicas da documentação e todas retornaram
`EGRESS_BLOCKED` ("Access to docs.asaas.com is blocked by the network egress
proxy"); eu mesmo tentei um `curl` direto pela mesma sessão e recebi
`CONNECT tunnel failed, response 403` do proxy da organização. Não é um erro
de TLS ou configuração corrigível — é bloqueio deliberado de política, e por
instrução do projeto eu não contorno isso (nunca desabilito verificação de
TLS nem tento outra rota para escapar de um bloqueio de política).

A única ferramenta que respondeu foi a **busca web** (que roda do lado do
Anthropic, fora do proxy desta sessão) — então tudo abaixo vem de **trechos
indexados/resumidos de busca**, não da página crua lida diretamente. Cruzei
cada ponto com múltiplas buscas e, quando possível, com várias páginas
citando a mesma coisa — mas isto **não substitui** ler `docs.asaas.com`
direto. Antes de mandar dinheiro de verdade por este gateway, alguém com
acesso à internet normal (você, ou uma sessão sem esse bloqueio) precisa
conferir os nomes exatos de campo/endpoint abaixo contra a documentação viva.

### O que ficou confirmado nesta rodada

1. **Split funciona junto com Pix Automático — SIM.** Resultado de busca
   citando `docs.asaas.com/docs/diferença-entre-pix-automático-e-assinaturas-1`
   e páginas relacionadas: *"Você pode usar ambas as funcionalidades
   [Assinaturas e Pix Automático] com split de pagamento para automatizar
   divisões de valores em cobranças recorrentes."* Isso resolve a maior
   incerteza da revisão anterior — mas por vir de resumo de busca, e não de
   leitura direta da página, ainda merece uma conferência antes da Fase 7.
2. **Formato do split, com nomes de campo exatos** (de exemplos JSON
   encontrados via busca, citando `docs.asaas.com/docs/split`): o array vai
   no campo `split` (cobrança avulsa) — visto também como `splits` num
   exemplo de Checkout, o que sugere o nome do campo pode variar por
   endpoint e precisa ser confirmado por endpoint, não assumido igual em
   todos. Cada item tem `walletId` e **ou** `fixedValue` **ou**
   `percentualValue` (não `percentage` — o nome exato importa). `fixedValue`
   aceita só duas casas decimais.
3. **`fixedValue` + `percentualValue` somando mais que o `netValue`: a API
   recusa com exceção**, não repassa parcial nem ignora silenciosamente —
   resolve a pergunta 5 da revisão anterior. Confirma que preciso validar no
   meu lado ANTES de enviar, pra dar um erro claro em vez de deixar o Asaas
   recusar sem explicação pro usuário.
4. **Criação de subconta**: endpoint `POST /v3/accounts`. A resposta traz
   `apiKey` e `walletId`; a `apiKey` **só é devolvida uma vez**, na criação —
   precisa ser guardada (cifrada) imediatamente, porque não é possível
   consultá-la de novo depois. Isso muda o desenho: a criação da subconta do
   proprietário é um momento crítico de guardar segredo, não algo que dá pra
   refazer se falhar a gravação.
5. **Eventos de webhook, com nomes exatos** (cruzado em várias páginas):
   `PAYMENT_CREATED` → `PAYMENT_AWAITING_RISK_ANALYSIS` (cartão em análise) →
   `PAYMENT_APPROVED_BY_RISK_ANALYSIS` / `PAYMENT_REPROVED_BY_RISK_ANALYSIS` →
   `PAYMENT_AUTHORIZED` (cartão autorizado, aguardando captura) →
   `PAYMENT_CONFIRMED` → `PAYMENT_RECEIVED`. **Detalhe que muda o desenho do
   webhook:** `PAYMENT_CONFIRMED` significa "pagamento feito, mas o saldo
   ainda não está disponível" — diferente de `PAYMENT_RECEIVED` ("recebido").

   **Decisão tomada ao implementar** (`src/lib/payments/webhook.ts`): a
   reserva vira `active` (e o endereço exato libera) no `PAYMENT_CONFIRMED`
   — é o sinal de que o locatário cumpriu a parte dele, e ele não deveria
   esperar a plataforma receber o dinheiro pra poder usar o que já pagou. O
   **repasse ao proprietário**, esse sim, só é criado no `PAYMENT_RECEIVED`
   — só ali existe dinheiro disponível de verdade pra repassar. É uma
   decisão de modelagem técnica razoável, não a política financeira em si;
   vale revisar com o gerente do Asaas antes de produção.

### O que ainda precisa de confirmação direta (não resolvido por busca)

1. **Tokenização de cartão em produção** exige liberação do gerente, sujeita
   a análise prévia — informação que já vinha da documentação, sem mudança.
2. **Criação de subcontas white-label** — quais são as exigências
   contratuais. Busca não trouxe detalhe contratual, só o endpoint técnico.
3. **Tarifas reais** da sua conta, e a partir de quando a promoção acaba —
   isso só a sua conta comercial responde, nunca a documentação pública.
4. **Chargeback em transação com split já liquidado** — quem arca. Não
   apareceu em nenhum resultado de busca.
5. **Os nomes exatos de campo acima** (`split` vs `splits`,
   `percentualValue`, o corpo completo de `POST /v3/accounts`) — confirmados
   por trecho de busca, não por leitura direta da página viva.

---

## 5. Situação atual

| Item | Estado |
|------|--------|
| Cálculo de valores no servidor | **IMPLEMENTADO** — `src/lib/money.ts`, testado |
| Invariantes de valor no banco | **IMPLEMENTADO** — o banco recusa total adulterado |
| Taxas configuráveis sem deploy | **IMPLEMENTADO** — `platform_settings`, hoje em 3% + 3% |
| Aluguel mínimo | **IMPLEMENTADO** — R$ 35,00, acima do equilíbrio nos dois meios |
| Tabelas de pagamento, repasse e livro-razão | **IMPLEMENTADO** |
| Idempotência de webhook | **IMPLEMENTADO** — chave única por evento, testado com reentrega real |
| Livro-razão realmente append-only | **IMPLEMENTADO** — trigger recusa até `DELETE`, testado tentando de verdade |
| Cliente Asaas (`src/lib/payments/asaas.ts`) | **IMPLEMENTADO, sem credencial real** — cliente, subconta, assinatura+split, estorno; testado contra dublê local (63 checagens, `scripts/verify-payments.ts`) |
| Webhook (`/api/webhooks/asaas`) | **IMPLEMENTADO, sem credencial real** — autenticação por token, idempotente, nunca confia em redirecionamento do navegador |
| Ligar a aceitação da reserva à criação da assinatura | **IMPLEMENTADO** — `startCheckoutAction`, chamado a partir de `/reservas/[id]/pagar` |
| Tela de checkout (resumo antes de pagar) | **IMPLEMENTADO** — `/reservas/[id]/pagar`, redireciona pra fatura hospedada pelo Asaas |
| Tela de onboarding do proprietário (chama `createSubaccount`) | **IMPLEMENTADO** — dentro de `/meus-espacos/financeiro` |
| Criação de subconta e KYC do proprietário | **IMPLEMENTADO, aprovação não confirmada** — a subconta é criada e marcada `can_receive=true` de imediato (decisão otimista, ver §4); se o Asaas exigir aprovação antes de aceitar split de verdade, precisa revisar |
| Cobrança real | **BLOQUEADO POR SERVIÇO EXTERNO** — depende da sua conta Asaas e de testar fora deste ambiente (rede bloqueada aqui) |

**Nenhum botão de pagamento existe hoje.** Não há checkout falso, não há
"pagamento simulado", não há tela de sucesso sem cobrança. Quando existir, vai
ser cobrança real ou erro real.
