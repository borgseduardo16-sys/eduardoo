# Segurança interna — proteção entre usuários

> Este documento trata da segurança **entre pessoas** que se encontram pela
> plataforma. A segurança técnica (autenticação, RLS, chaves) está em
> [ARQUITETURA.md](./ARQUITETURA.md).

---

## O problema

Um marketplace de aluguel entre desconhecidos junta duas pessoas que nunca se
viram, para uma transação recorrente, envolvendo o imóvel de uma e os bens da
outra. Três coisas dão errado com frequência previsível:

1. **Golpe do sinal.** O anunciante puxa a conversa para o WhatsApp, pede um
   Pix de "sinal" e some. Fora da plataforma não há comprovante, mediação nem
   reembolso — a vítima não tem a quem recorrer.
2. **Assédio.** O chat vira canal de mensagens insistentes ou constrangedoras.
3. **Anúncio falso.** Fotos de outro lugar, endereço que não existe, preço que
   não é o cobrado.

O sistema abaixo ataca os três. Nenhuma das medidas é infalível — o objetivo é
cobrir o caso comum, criar atrito no caminho do golpe e dar à pessoa uma saída
que não dependa de esperar moderação.

---

## 1. Denúncia

Um sistema para **três alvos**: anúncio, usuário e mensagem específica.

Poder denunciar uma mensagem isolada importa: sem isso, uma denúncia de assédio
vira "essa pessoa me incomodou" sem nada que o moderador possa ler.

### 18 motivos, agrupados

| Grupo | Motivos |
|-------|---------|
| Anúncio | anúncio falso, endereço incorreto, preço enganoso, espaço não existe |
| Conduta | fraude, golpe de pagamento, insistiu em pagar por fora, assédio, discurso de ódio, ameaça, identidade falsa |
| Conteúdo | conteúdo inadequado, spam, atividade proibida |
| Contrato | não compareceu, dano ao espaço, uso indevido do espaço |
| — | outro (exige descrição) |

Cada motivo declara **em quais alvos faz sentido**. "Não compareceu" não aparece
ao denunciar um anúncio.

### Severidade é calculada no servidor

Ameaça, assédio, fraude e atividade proibida entram como `critical`; spam entra
como `low`. **O formulário não envia a gravidade.** Se enviasse, tudo chegaria
marcado como crítico e a fila de moderação perderia serventia.

### Evidência é congelada

Uma trigger copia o conteúdo denunciado no momento da denúncia. Conteúdo
denunciado é exatamente o que costuma ser editado ou apagado logo em seguida —
sem a cópia, o moderador recebe um caso sem o que julgar.

*Testado: a evidência sobrevive à edição da mensagem original.*

### Limites contra o uso da denúncia como assédio

- Máximo de **10 denúncias por dia** por usuário (`safety.max_reports_per_day`)
- Máximo de 3 por minuto
- **Uma denúncia em aberto por alvo** — garantido por índice único
- **Autodenúncia é recusada** pelo banco

### Confidencialidade

Quem denunciou vê a própria denúncia. **Ninguém vê denúncia feita contra si** —
saber quem denunciou é o caminho mais curto para retaliação. Isso é política de
RLS, não decisão de interface.

---

## 2. Bloqueio entre usuários

A ferramenta que **não depende de moderação**. Efeito imediato.

### É mútuo, de propósito

Se A bloqueia B, **nenhum dos dois** consegue falar ou negociar com o outro. Se
valesse só em um sentido, o bloqueado descobriria o bloqueio ao tentar falar — e
teria como contornar pelo outro lado.

### O que o bloqueio impede

| Ação | Resultado |
|------|-----------|
| Iniciar conversa | recusado pelo banco |
| Enviar mensagem | recusado pelo banco |
| Criar reserva | recusado pelo banco |
| Conversa existente | encerrada automaticamente |

**Garantido por trigger, não por código de aplicação.** Isso importa: o servidor
usa conexão privilegiada e ignora RLS. Trigger pega os dois caminhos.

Mensagens do sistema ("reserva cancelada") continuam passando — elas informam,
não são contato entre as pessoas.

*Testado: as quatro regras, incluindo a tentativa de contornar o bloqueio
criando uma reserva.*

---

## 3. Detector de dados de contato

O componente mais interessante do conjunto. Roda em cada mensagem do chat.

### O que detecta

| Tipo | Exemplo | Confiança |
|------|---------|-----------|
| Telefone | `(27) 99999-8888`, `27 9 9999 8888` | alta |
| E-mail | `joao@gmail.com` | alta |
| E-mail ofuscado | `joao arroba gmail ponto com` | alta |
| CPF / CNPJ | validado pelo **dígito verificador** | alta |
| Chave Pix aleatória | UUID | alta |
| Rede social | `wa.me/...`, `@perfil`, "me chama no zap" | alta / média |
| Pagamento por fora | "me manda um pix de sinal", "fugir da taxa" | média |

### Duas decisões que fazem diferença

**1. "Pix" sozinho não é sinal.** O Pix será o meio de pagamento principal
*dentro* da plataforma — "posso pagar por Pix?" é pergunta legítima e frequente.
Sinalizar toda menção encheria a fila de ruído e treinaria o time a ignorar o
alerta. O detector procura o Pix **direto**: pedido de envio, chave, sinal
adiantado. E promove uma menção solta a alerta forte quando ela aparece **junto
de uma forma de contato** — que é a assinatura exata do golpe.

**2. Dígito verificador, não "tem 11 números".** Validar CPF pelo checksum
elimina quase todo falso positivo: uma sequência aleatória de 11 dígitos tem
cerca de 1 em 100 de chance de passar.

### Sinaliza, não bloqueia

A mensagem é enviada normalmente. O que acontece é: a pessoa recebe um aviso, e
a mensagem entra na fila de moderação.

Bloquear o envio quebraria conversa legítima ("meu galpão fica na rua 27, número
1500") e empurraria as pessoas para ofuscação cada vez mais criativa, o que
**piora** a detecção.

### Privacidade do que foi detectado

`messages.flag_reason` guarda apenas os **tipos** encontrados
(`contato:telefone,mencao_pagamento_externo`), nunca o número ou o e-mail em si.

### Limitação declarada

Não detecta número escrito por extenso ("nove nove sete três…"), combinação por
imagem, nem código combinado entre as partes. **Quem quiser contornar,
contorna.** O objetivo é cobrir o caso comum, não prometer barreira
intransponível.

---

## 4. Reincidência

Quando a moderação resolve uma denúncia como **procedente** (`upheld = true`),
o contador do denunciado sobe, mantido por trigger.

| Limite | Configuração | Efeito |
|--------|-------------|--------|
| 3 | `safety.auto_review_upheld_threshold` | conta entra em revisão obrigatória |
| 5 | `safety.auto_suspend_upheld_threshold` | suspensão automática |

Para denúncia de anúncio ou mensagem, quem responde é o **autor do conteúdo** —
senão bastaria republicar o mesmo anúncio com outro id para zerar o histórico.

> **Estado:** a contagem funciona e está testada. A aplicação automática dos
> limites entra na Fase 11, junto do painel administrativo.

---

## 5. Privacidade da localização

Já descrito em [ARQUITETURA.md](./ARQUITETURA.md#4-privacidade-da-localização),
mas é medida de segurança e vale repetir:

- O ponto exato **nunca** sai em resposta pública
- O mapa mostra posição deslocada ~300 m, **determinística** por espaço
  (sorteio a cada carregamento permitiria triangular o ponto real)
- Rua, número e complemento só após reserva ativa

---

## 6. Validação de documentos

`src/lib/safety/documents.ts` valida CPF e CNPJ pelo dígito verificador oficial.
Usado em dois lugares: no detector de contato, e no cadastro de recebimento
(KYC) — rejeitar documento inválido antes de mandar ao gateway e receber um erro
genérico de volta.

**CPF é dado pessoal sob a LGPD.** A função `maskDocument` existe para que ele
nunca apareça inteiro em log, tela de suporte ou mensagem de erro:
`123.456.789-01` vira `***.456.789-**`.

---

## Estado de cada peça

| Peça | Banco | Lógica | Interface |
|------|-------|--------|-----------|
| Denúncia (3 alvos) | ✅ | ✅ | ✅ componente pronto |
| Severidade automática | ✅ | ✅ | — |
| Evidência congelada | ✅ trigger | — | — |
| Limites anti-abuso | ✅ | ✅ | — |
| Bloqueio de usuário | ✅ trigger | ✅ | ✅ |
| Lista de bloqueios | ✅ | ✅ | ✅ `/minha-conta/seguranca` |
| Detector de contato | — | ✅ | ⬜ Fase 6 (depende do chat) |
| Validação CPF/CNPJ | — | ✅ | ⬜ Fase 8 (depende do KYC) |
| Contagem de reincidência | ✅ trigger | — | ⬜ Fase 11 |
| Aplicação automática dos limites | — | ⬜ | ⬜ Fase 11 |
| Fila de moderação | ✅ índice | ⬜ | ⬜ Fase 11 |

O componente de denúncia (`ReportDialog`) está pronto e funcional, mas só
aparece na tela quando existirem anúncios e mensagens para denunciar — Fases 2 e 6.

---

## Verificação

```bash
pnpm tsx scripts/verify-safety.ts
```

**56 checagens**, entre funções puras e invariantes do banco. Inclui os casos
que não podem dar falso positivo:

```
✓ nao sinaliza  "o aluguel e R$ 1.500,00 por mes"
✓ nao sinaliza  "o CEP do local e 29700-000"
✓ nao sinaliza  "posso pagar por Pix aqui pelo aplicativo?"
✓ nao sinaliza  "o valor total ficou R$ 12.345.678,90"
```

E os que precisam pegar:

```
✓ detecta telefone                   "meu whatsapp e (27) 99999-8888"
✓ detecta email                      "joao silva arroba gmail ponto com"
✓ detecta cpf                        "minha chave pix e o cpf 111.444.777-35"
✓ telefone + pix na mesma mensagem vira alerta forte
✓ bloqueado nao reserva o espaco     bloqueado: bloqueio entre os usuarios
✓ evidencia sobrevive a edicao do conteudo denunciado
```
