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

## 4. Incentivo a fechar pela plataforma

O pedido aqui foi direto: **incentivar visualmente a pessoa a fechar no app**,
porque dentro dele existe a quem recorrer, e fora não.

A implementação segue esse pedido — com uma ressalva importante logo abaixo.

### Onde o incentivo aparece

| Lugar | Formato |
|-------|---------|
| Home | Seção "Visite o espaço. E combine tudo por aqui." |
| `/protecao` | Página completa: o que a plataforma garante, o que se perde por fora, checklist de visita e sinais de golpe |
| Rodapé | Link permanente "Como protegemos você" |
| Chat *(Fase 6)* | `ProtectionNotice variant="compact"` no rodapé da conversa |
| Antes de reservar *(Fase 5)* | `ProtectionNotice variant="card"` |
| Quando o detector dispara | `OffPlatformWarning`, escalonado |

### O texto nunca promete o que não existe — e isso é estrutural

**Esta é a parte que mais importa.** A tentação era escrever *"feche pelo app
que a gente resolve qualquer problema"*. Convence muito mais. Mas hoje **não
existe processo de mediação**: não há prazo, critério, quem decide, nem regra
sobre o dinheiro durante a disputa.

Prometer isso antes de existir é publicidade enganosa — com risco sob o Código
de Defesa do Consumidor, e com um custo de confiança muito maior no dia em que
alguém cobrar a promessa.

Então cada proteção em `src/lib/safety/protection.ts` declara um `status`, e a
interface renderiza **somente** os `live`:

| Proteção | Status | Falta |
|----------|--------|-------|
| Conversa registrada | `live` | — |
| Endereço protegido | `live` | — |
| Canal de denúncia | `live` | — |
| Bloqueio imediato | `live` | — |
| Alerta de pagamento por fora | `live` | — |
| Histórico visível | `live` | — |
| Comprovante de pagamento | `pending_phase` | Fase 7 |
| Estorno | `pending_phase` | Fase 7 |
| **Mediação de conflito** | `needs_policy` | processo não definido — decisão de negócio + jurídico |
| **Cobertura de danos** | `needs_policy` | exigiria seguro ou fundo de garantia |

Quando a Fase 7 entregar pagamento real, basta mudar o status: os itens passam
a aparecer sozinhos, sem caçar texto espalhado pelo código.

*Testado: `liveProtections()` nunca devolve item não-live, e a página renderizada
não contém as palavras "Mediação de conflito" nem "Cobertura de danos".*

---

## 4b. Metadado das fotos — a falha que quase anulou tudo

Foto tirada de celular carrega **EXIF**, e o EXIF carrega a **coordenada GPS
do lugar onde a foto foi tirada**, com precisão de poucos metros. Também
carrega modelo do aparelho, número de série e horário.

A primeira versão guardava o arquivo original. O efeito prático: o mapa
mostrava um ponto deslocado ~250 m, a página pública não trazia rua nem
número — e **a primeira foto tirada dentro da garagem entregava o endereço
exato** para qualquer pessoa que baixasse a imagem e abrisse os metadados.

Toda a proteção de localização descrita acima era anulada por isso.

### Como foi corrigido

A remoção acontece por **reencode**, não por "apagar a tag EXIF". Reencodar
gera um arquivo novo a partir dos pixels, então não sobra metadado algum — nem
os campos proprietários que cada fabricante inventa e que uma lista de exclusão
sempre acabaria deixando passar.

Duas armadilhas encontradas no caminho:

1. **`withMetadata({})` no sharp PRESERVA o metadado**, não remove. O nome
   sugere o contrário para quem lê rápido. A primeira correção usava isso e
   não removia nada — o teste é que pegou.
2. **A orientação vive no EXIF.** Remover o metadado sem antes aplicar a
   rotação aos pixels deixaria fotos tiradas de lado deitadas no anúncio.

### Verificação

`scripts/verify-images.ts` gera uma foto **com GPS de Colatina embutido**,
processa, e varre os bytes finais atrás de qualquer vestígio:

```
✓ coordenada e aparelho estao embutidos   Apple, iPhone, iOS 18, Exif + bloco GPS
✓ EXIF removido da imagem principal
✓ EXIF removido tambem da miniatura
✓ nenhum vestigio nos bytes crus          varrido por Apple, iPhone, Exif, GPS, data
✓ foto marcada como girada sai em pe      900x1200
```

O teste não depende de fixture no repositório nem de ferramenta externa: cria
e confere tudo sozinho.

E não fica só na unidade: `scripts/verify-integracoes.ts` faz o mesmo caminho
**pelo navegador**, subindo uma foto com GPS pela interface e varrendo os bytes
que chegaram ao Storage. Se um dia alguém reintroduzir o `withMetadata()`, os
dois testes acusam.

---

## 4c. Fotos no Storage — quem pode tocar em quê

O caminho de cada arquivo é `<id-do-dono>/<id-do-anúncio>/<uuid>.<ext>`, e
existem **três** travas independentes:

| Camada | O que garante | Onde |
|--------|---------------|------|
| Autorização na aplicação | toda action de foto começa por `getOwnedSpace(spaceId, userId)`, que lança se quem pede não é o dono | `src/lib/storage/actions.ts` |
| Escopo no `DELETE`/`UPDATE` | a consulta casa `imageId` **e** `spaceId`, então um id solto de outro anúncio não alcança nada | idem |
| Política do Storage | quatro políticas em `storage.objects` comparam a primeira pasta do caminho com `auth.uid()` | migração `0009` |

A aplicação fala com o Storage pela chave de serviço, que ignora RLS — a
autorização real é a primeira camada. As políticas existem porque a primeira é
código: se um dia alguém escrever uma tela que fale com o Storage direto do
navegador, é a política que continua segurando. Para o papel `anon` não existe
política nenhuma: visitante não lê, não lista e não escreve no bucket. Foto de
anúncio público é servida por **URL assinada de 1 hora**, gerada no servidor.

**Testado** (`verify-integracoes.ts`, seção "TESTE D"): o usuário B tenta
enviar, apagar e reordenar foto do anúncio de A pelas actions reais, com a
identidade de B. As três recusam, a foto de A continua no banco e o arquivo
continua no bucket. Pela interface, B recebe 404 nas páginas de edição de A —
404 e não 403, para nem confirmar que o anúncio existe.

---

## 5. Visita antes de fechar

A visita é a única verificação que nenhum sistema substitui. Foto se copia da
internet, endereço se inventa, conversa se finge — estar no lugar, não.

O checklist (`src/lib/safety/visit-checklist.ts`) tem 4 grupos e muda conforme
o tipo de espaço: "teste se seu veículo manobra" aparece em garagem e não em
sala; "verifique se alaga quando chove" aparece em terreno e galpão.

**7 itens são marcados como críticos**, e o primeiro da lista inteira é:

> **Não pague nada durante a visita.** Nem sinal, nem caução, nem "taxa de
> reserva". Quem pede dinheiro na visita está aplicando um golpe.

Praticamente todo golpe deste tipo depende de conseguir um adiantamento antes
de a pessoa conferir qualquer coisa.

Outros críticos: confirmar que quem atende é quem anunciou, avisar alguém para
onde você vai, conferir se o lugar é o das fotos, perguntar quem mais tem a
chave, fotografar o estado atual, e escrever no chat tudo que foi combinado
pessoalmente.

As marcações ficam no navegador (`useLocalSet`, sobre `useSyncExternalStore`),
porque a pessoa marca **durante** a visita — com o celular na mão e
provavelmente sem sinal.

---

## 6. Sinais de confiança — a defesa que realmente funciona

Aviso não segura ninguém. Quem quer combinar por fora combina, e um alerta a
mais na tela não muda isso.

**O que muda o cálculo é a pessoa ter algo a perder.**

Um proprietário com 14 locações concluídas e documento conferido não troca esse
histórico por economizar 3% em um mês — porque o histórico é o que faz o próximo
locatário escolher o anúncio dele. Reputação construída aqui não acompanha
ninguém para fora.

Por isso `src/lib/safety/trust.ts` existe: não para enfeitar o perfil, mas para
tornar a permanência economicamente racional.

### Níveis

| Nível | Critério |
|-------|----------|
| Conta nova | sem verificação e sem locação |
| Construindo histórico | 1 verificação ou 1 locação |
| Histórico consistente | 2+ locações e 2+ verificações |
| Histórico consolidado | 5+ locações, 3 verificações e nota ≥ 4,5 |
| **Conta em revisão** | 3+ denúncias procedentes — **domina todo o resto** |

Aquele último é o caso que mais importa: **histórico longo não pode mascarar
denúncias procedentes.** Um golpista com 20 locações e 3 denúncias confirmadas
é mais perigoso, não menos. *Testado.*

Não é nota de 0 a 100 de propósito: número único convida a comparar "87 contra
84", o que passa uma precisão que o dado não tem.

### Quando a visita ganha destaque

`shouldEmphasizeVisit()` devolve `true` para conta nova, histórico em construção
e conta em revisão. Nesses casos a recomendação de visitar vira destaque, em vez
de rodapé.

### `public_profiles`

A view pública ganhou `phone_verified`, `document_verified` e
`completed_bookings_count`. Continua **sem** CPF, telefone, motivo de bloqueio
ou contagem de denúncias. *Testado: a view não expõe nenhuma coluna sensível.*

---

## 7. Reincidência

Quando a moderação resolve uma denúncia como **procedente** (`upheld = true`),
o contador do denunciado sobe, mantido por trigger.

| Limite | Configuração | Efeito |
|--------|-------------|--------|
| 3 | `safety.auto_review_upheld_threshold` | conta entra em revisão obrigatória |
| 5 | `safety.auto_suspend_upheld_threshold` | suspensão automática |

Para denúncia de anúncio ou mensagem, quem responde é o **autor do conteúdo** —
senão bastaria republicar o mesmo anúncio com outro id para zerar o histórico.

> **Estado:** ✅ implementado. A contagem sobe por trigger; ao atingir 5, o
> mesmo trigger (`refresh_upheld_report_count`, migração
> `0011_suspensao_automatica.sql`) coloca a conta em `suspended` sozinho — sem
> depender do painel estar aberto ou de alguém clicar em nada. O limite de 3
> (revisão obrigatória) já era aplicado antes, no nível de confiança do perfil
> (`sob_revisao` em `src/lib/safety/trust.ts`). Ver
> [STATUS.md — Fase 11](./STATUS.md#fase-11--painel-administrativo-) para o
> painel de moderação em si.

---

## 8. Privacidade da localização

Já descrito em [ARQUITETURA.md](./ARQUITETURA.md#4-privacidade-da-localização),
mas é medida de segurança e vale repetir:

- O ponto exato **nunca** sai em resposta pública
- O mapa mostra posição deslocada ~300 m, **determinística** por espaço
  (sorteio a cada carregamento permitiria triangular o ponto real)
- Rua, número e complemento só após reserva ativa
- **A distância mostrada na busca segue a mesma regra.** "≈ 1,2 km" num
  cartão de resultado é sempre calculado a partir do ponto aproximado, nunca
  do exato — testado em `scripts/verify-busca.ts`. Mostrar distância até o
  ponto exato, combinada com buscas repetidas a partir de pontos diferentes,
  é o material bruto de um ataque de trilateração; distância até o ponto
  aproximado não vaza nada além do que o próprio marcador no mapa já mostra

---

## 9. Validação de documentos

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
| Detector de contato | — | ✅ | ✅ Fase 6 — ligado no chat de verdade |
| Validação CPF/CNPJ | — | ✅ | ⬜ Fase 8 (depende do KYC) |
| Contagem de reincidência | ✅ trigger | — | ✅ Fase 11 — refletida no painel |
| Aplicação automática dos limites | ✅ trigger | ✅ | ✅ Fase 11 |
| Fila de moderação | ✅ índice | ✅ | ✅ Fase 11 — `/admin/denuncias` |
| Incentivo a fechar no app | — | ✅ | ✅ home, `/protecao`, rodapé |
| Checklist de visita | — | ✅ | ✅ interativo, salvo no navegador |
| Aviso escalonado de pagamento por fora | — | ✅ | ✅ Fase 6 — no chat, ao digitar |
| Níveis de confiança | ✅ | ✅ | ✅ componente pronto |
| Contagem de locações concluídas | ✅ trigger | — | ⬜ aparece com os anúncios (Fase 2) |

O componente de denúncia (`ReportDialog`) está pronto e funcional, e já
aparece nas telas de anúncio (Fase 2) e de conversa (Fase 6).

---

## Verificação

```bash
pnpm tsx scripts/verify-safety.ts
```

**72 checagens**, entre funções puras e invariantes do banco. Inclui os casos
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

E as que protegem a honestidade do texto e o julgamento de confiança:

```
✓ mediacao e cobertura de danos ficam fora da interface   ainda nao existem
✓ todo item pendente declara o que falta
✓ "nao pague nada na visita" e item critico               7 criticos
✓ checklist muda conforme o tipo de espaco                manobra so em garagem
✓ denuncias procedentes dominam o historico               20 locacoes + 3 denuncias = sob revisao
✓ view publica de perfil nao expoe dado sensivel
```
