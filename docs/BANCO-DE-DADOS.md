# Banco de dados — o que cada tabela faz

Explicação em linguagem simples de cada uma das 22 tabelas, por que existe e
que regra ela protege. O modelo em código está em `src/db/schema/`.

> Convenção que vale para tudo: **todo valor em dinheiro é inteiro, em
> centavos.** `R$ 102,00` é gravado como `10200`.

---

## Pessoas

### `profiles`
O perfil de cada usuário dentro do produto: nome, telefone, foto, papel.

**Senha não fica aqui** — e nem em lugar nenhum nosso. A identidade (e-mail e
senha) vive em `auth.users`, gerenciada pelo Supabase. O perfil é criado
automaticamente por trigger no momento do cadastro, para nunca existir usuário
sem perfil.

Papéis: `user` (locatário), `owner` (pode publicar), `admin`. "Visitante" é
simplesmente não ter sessão.

`upheld_report_count` conta as denúncias contra a pessoa que a moderação julgou
procedentes. É mantido por trigger e alimenta a política de suspensão
automática. Fica denormalizado porque essa consulta acontece a cada ação
sensível, e varrer a tabela de denúncias toda vez sairia caro.

**Protege:** um usuário comum não consegue se promover a admin. Existe
permissão por coluna (só escreve em nome, telefone e foto) mais uma trigger que
recusa mudança de papel, status ou CPF por essa via.

### `owner_payout_accounts`
Onde o proprietário recebe o dinheiro — a referência à subconta dele no gateway.

Separada de `profiles` de propósito: são dados financeiros e de verificação de
identidade, com ciclo de vida próprio. **A plataforma não guarda dinheiro nem
dados bancários** — quem faz isso é a instituição de pagamento. Aqui ficam só
os identificadores.

`can_receive` só vira `true` quando o gateway aprova a verificação. Sem isso,
não há repasse.

### `renter_billing_profiles`
O cadastro do locatário no gateway, do lado de quem paga. Necessário para
emitir cobrança.

---

## Anúncios

### `spaces`
O anúncio. Tipo, título, descrição, preço mensal, regras, tamanho, status.

**A parte importante são duas colunas de localização:**
- `location` — o ponto **exato**. Nunca sai em resposta pública.
- `approx_location` — ponto deslocado ~300 m, que é o que vai para o mapa.

Idem para o endereço: `street`, `number` e `complement` só aparecem depois da
reserva aceita. Bairro e cidade são públicos.

**Protege:** preço tem que ser positivo; anúncio publicado tem que ter
coordenada (senão não apareceria em busca por distância e ficaria invisível
sem ninguém entender por quê).

### `space_images`
As fotos. Guardamos o **caminho no bucket**, nunca uma URL pública fixa — a URL
é assinada na hora, com validade. Foto de garagem de alguém não deve ficar
acessível para sempre por link solto.

O caminho tem forma fixa: `<id-do-dono>/<id-do-anúncio>/<uuid>.<ext>`. Começar
pelo id do dono não é enfeite — é o que permite escrever a política do Storage
comparando a primeira pasta com `auth.uid()`, de modo que ninguém alcance
arquivo de outro dono nem conhecendo o caminho.

`position` define a ordem, e a posição `0` é a **capa**. Há `CHECK` garantindo
que não seja negativa.

**Protege:** duas regras vivem em trigger, e não só no código da aplicação:

- `spaces_publish_requires_photos` — anúncio só vira `published` com no mínimo
  o número de fotos em `platform_settings['space.min_photos_to_publish']`
  (hoje 3). Consequência disso: **não é possível inserir um anúncio já
  publicado**, porque foto precisa de anúncio existente. Todo caminho passa por
  rascunho → fotos → publicar, inclusive importação de dados.
- `space_images_keep_minimum` — apagar foto de anúncio publicado é recusado se
  isso o deixaria abaixo do mínimo. Sem isso, um anúncio ficaria no ar cada vez
  mais pobre sem ninguém perceber. Apagar o anúncio inteiro continua
  funcionando (a cascata é liberada).

### `features` e `space_features`
`features` é o catálogo de características (coberto, câmera, acesso 24 h,
acesso para caminhão…). É tabela e não lista fixa no código para o admin poder
gerenciar sem precisar de deploy.

Cada característica declara a quais tipos de espaço se aplica — é isso que faz
"acesso para caminhão" aparecer em galpão e não em vaga de moto.

`space_features` liga anúncio a característica. Já vem com 20 características
cadastradas.

### `favorites`
Os anúncios que o usuário salvou. Chave composta (usuário + espaço), o que já
impede favoritar duas vezes.

---

## Locação

### `bookings`
A reserva. **A tabela mais importante do sistema.**

Guarda os valores **congelados** no momento do aceite: aluguel, taxa do
locatário, taxa do proprietário, total cobrado, valor do repasse, e as taxas
vigentes em basis points. Se a plataforma mudar a taxa amanhã, contratos em
andamento continuam com o que foi combinado.

**Protege — e isto é o coração da segurança financeira:**
- `total_charged = aluguel + taxa_locatário` é `CHECK` no banco
- `owner_payout = aluguel − taxa_proprietário` é `CHECK` no banco
- locatário não pode ser o proprietário
- **um espaço não pode ter duas locações vigentes ao mesmo tempo**

Um bug de aplicação que tentasse gravar total adulterado é recusado pelo
Postgres. Isso está testado em `scripts/verify-schema.ts`.

### `subscriptions`
A recorrência mensal no gateway. Uma reserva ativa tem uma assinatura viva.
Guarda o dia de vencimento (limitado a 1–28, para não quebrar em fevereiro) e
quantos ciclos seguidos falharam.

### `payments`
Cada cobrança individual — um mês de aluguel.

`provider_payment_id` é **único**: é a chave de idempotência. Gateway reenvia
webhook, sempre. Sem essa restrição, reentrega viraria cobrança em dobro.

O status só muda por evento vindo do gateway. "O usuário voltou para a página
de sucesso" **não** confirma pagamento nenhum.

### `payouts`
O repasse ao proprietário — a perna do split que sai para a carteira dele.
Guarda a carteira usada **no momento do repasse**, porque o proprietário pode
trocar de conta depois e o histórico não pode mudar junto.

### `ledger_entries`
O livro-razão. Todo movimento de dinheiro vira um lançamento: cobrança
capturada, tarifa do gateway, taxa da plataforma, repasse, estorno, chargeback.

**É append-only, garantido por trigger.** Nada aqui é editado ou apagado —
correção se faz com lançamento novo de sinal contrário. É a fonte de verdade
para saber quanto a plataforma realmente ganhou e quanto cada pessoa recebeu.

### `webhook_events`
Todo evento recebido do gateway é gravado **antes** de ser processado, com
chave única por evento.

É o que garante que reentrega não cobre, credite ou repasse duas vezes. Também
é o histórico para investigar quando algo der errado.

---

## Comunicação

### `conversations`
A conversa entre interessado e proprietário, sempre no contexto de um anúncio.
Única por (espaço, interessado) — reabrir o chat cai na mesma thread.

### `messages`
As mensagens. Mensagem vazia é recusada pelo banco, e há limite de 4.000
caracteres. Moderação esconde sem apagar (o conteúdo fica para auditoria).

`flagged_at` e `flag_reason` são preenchidos pelo detector de dados de contato
quando a mensagem contém telefone, e-mail, chave Pix ou pedido de pagamento por
fora. Sinalizar **não esconde** a mensagem: avisa quem está conversando e
alimenta a fila de moderação. O `flag_reason` guarda só os **tipos**
encontrados, nunca o número ou o e-mail em si.

**É a única tabela que o navegador lê diretamente**, para o tempo real
funcionar. Por isso as regras de RLS dela são a barreira de verdade: só
participante da conversa lê, só o próprio remetente escreve, e só em conversa
aberta.

---

## Confiança

### `reviews`
Avaliações depois da locação encerrada.

**Três regras impedem avaliação falsa, todas no banco:**
1. Toda avaliação exige uma reserva real — sem locação, não há avaliação
2. Uma avaliação por parte, por locação (chave única)
3. Uma trigger confirma que a reserva está **encerrada** e que quem avalia
   **participou dela**

Tentar avaliar contrato em andamento, ou avaliar locação de terceiro, é
recusado pelo banco. Testado.

Uma trigger mantém a nota média do anúncio sempre coerente.

### `reports`
Denúncias. **Uma tabela para três alvos**: anúncio, usuário e mensagem
específica.

Poder denunciar uma mensagem isolada importa: sem isso, uma denúncia de assédio
chega ao moderador sem nada que ele possa ler.

`target_type` diz qual coluna de alvo está preenchida, e um `CHECK` garante que
**exatamente uma** esteja — sem isso, uma denúncia poderia apontar para lugar
nenhum ou para dois alvos ao mesmo tempo.

`severity` é calculada no servidor a partir do motivo (ameaça e assédio entram
como crítico; spam como baixo). **O formulário não envia a gravidade** — se
enviasse, tudo chegaria marcado como crítico.

`evidence_snapshot` guarda uma cópia do conteúdo denunciado, feita por trigger.
Conteúdo denunciado é exatamente o que costuma ser editado ou apagado logo em
seguida.

**Protege:**
- autodenúncia é recusada
- uma denúncia em aberto por alvo, por pessoa
- motivo tem que combinar com o alvo ("não compareceu" não serve para anúncio)
- quem denunciou vê a própria denúncia; **ninguém vê denúncia feita contra si**

### `user_blocks`
Bloqueio entre usuários. A ferramenta que **não depende de moderação** — vale na
hora.

O efeito é **mútuo** de propósito: se A bloqueia B, nenhum dos dois consegue
conversar ou negociar com o outro. Se valesse só em um sentido, o bloqueado
descobriria o bloqueio ao tentar falar, e teria como contornar pelo outro lado.

**Protege, por trigger no banco:**
- não inicia conversa
- não envia mensagem
- não cria reserva (senão bastaria alugar para contornar o bloqueio)
- a conversa existente entre os dois é encerrada automaticamente

Trigger e não só código de aplicação porque o servidor usa conexão privilegiada
e ignora RLS. Trigger pega os dois caminhos.

Detalhes em [SEGURANCA.md](./SEGURANCA.md).

## Sistema

### `notifications`
Fila de notificações do usuário. Email e push (quando existirem) leem daqui —
uma origem só, em vez de cada evento disparar e-mail por conta própria.

### `audit_logs`
Trilha de auditoria. Toda ação sensível registra aqui: admin bloqueando conta,
remoção de anúncio, mudança de taxa, troca de senha, alteração de dados de
recebimento.

Também é **append-only**. Trilha de auditoria que pode ser editada não é trilha
de auditoria.

### `platform_settings`
Configuração em tempo de execução. **As taxas moram aqui**, não no código:

| Chave | Valor | O que é |
|-------|-------|---------|
| `fees.renter_fee_bps` | 300 | 3% cobrados de quem aluga |
| `fees.owner_fee_bps` | 300 | 3% retidos de quem recebe |
| `booking.min_rent_cents` | 3500 | aluguel mínimo R$ 35 (ponto de equilíbrio é R$ 33,17 no Pix — ver PAGAMENTOS.md) |
| `booking.billing_day_default` | 5 | dia padrão de vencimento |
| `booking.max_failed_cycles` | 2 | falhas seguidas antes de suspender |
| `privacy.approx_location_meters` | 300 | deslocamento do ponto público |
| `safety.flag_contact_info` | true | sinalizar troca de contato no chat |
| `safety.auto_review_upheld_threshold` | 3 | denúncias procedentes até revisão obrigatória |
| `safety.auto_suspend_upheld_threshold` | 5 | denúncias procedentes até suspensão |
| `safety.max_reports_per_day` | 10 | teto diário de denúncias por usuário |

Mudar a taxa é um `UPDATE`, não um deploy — e fica registrado em `audit_logs`.

---

## Verificação

Nada acima é promessa. Os scripts rodam **237 checagens contra um Postgres
real**, provando que cada regra citada aqui bloqueia mesmo o dado inválido:

```bash
pnpm tsx scripts/verify-schema.ts        # 29 — invariantes centrais
pnpm tsx scripts/verify-safety.ts        # 72 — segurança entre usuários
pnpm tsx scripts/verify-spaces.ts        # 37 — anúncios, capa e permissões
pnpm tsx scripts/verify-images.ts        # 14 — EXIF e processamento
pnpm tsx scripts/verify-integracoes.ts   # 85 — Storage, mapa e CEP em navegador real
```

Ele cria dados, tenta violar cada invariante, confirma que o banco recusa, e
limpa tudo ao final.
