# Banco de dados — o que cada tabela faz

Explicação em linguagem simples das tabelas principais, por que existem e
que regra cada uma protege. O modelo em código está em `src/db/schema/`.

> As tabelas das Fases 13 a 20 — `promotions`, `promotion_purchases` e
> `premium_memberships` (Destaque/Turbo/Premium), `space_quality_assessments`
> (classificação de padrão), `push_subscriptions` (push no celular) e
> `booking_deposits` (caução) — estão descritas no
> [STATUS.md](./STATUS.md), na fase de cada uma.

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

**Perfil público e verificações (Fase 21):**

- `display_name` (opcional, 2–40 caracteres) e `public_name`, **coluna
  gerada**: o nome de exibição, ou só o primeiro nome. É o único nome que
  aparece para outras pessoas — o completo fica para cobrança e suporte.
- `bio` (até 500 caracteres) e `avatar_path`, que um `CHECK` prende à pasta
  do próprio usuário no Storage (`<id>/avatar/...`).
- `email_verified_at` — cópia de `auth.users.email_confirmed_at`, mantida por
  trigger. A fonte da verdade é o Supabase Auth.
- `phone_verified_at` — só o servidor grava, e só depois de o provedor de SMS
  responder `approved`. **Trocar o telefone zera a verificação** (trigger). Um
  índice único impede o mesmo número verificado em duas contas.
- `identity_verification_status` — só estrutura nesta fase; um `CHECK`
  amarra `verified` a `document_verified_at` preenchido.

Pela API do navegador, a leitura é **por coluna**: só o que pode ser público
(telefone, CPF, nome completo e contadores de moderação ficam de fora). E
nenhuma requisição com JWT de usuário altera selo ou contador — nem no
próprio perfil (`guard_profile_verification`).

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

**Quantidade (migração `0033`):** `quantity_offered` (quantas unidades o
proprietário oferece na plataforma), `quantity_total` (opcional, informativo:
"o local tem 100, 80 são oferecidas aqui") e `quantity_available` (livres
agora — **mantida pelo banco**, ver `bookings` e [ALUGUEL.md](./ALUGUEL.md)).
Não há unidade individual (A1, B17…): a organização física é do proprietário.

**A parte importante são duas colunas de localização:**
- `location` — o ponto **exato**. Nunca sai em resposta pública.
- `approx_location` — o que vai para o mapa, mantido pelo gatilho
  `sync_approx_location`: para espaços residenciais/pessoais é um ponto
  **deslocado de 100 a 400 m** (estável); para os tipos comerciais de
  `platform_settings['privacy.exact_location_types']` (loja, escritório,
  galpão, estacionamento, espaço para eventos, oficina) é o ponto exato, já
  que o endereço deles é público por natureza.

Idem para o endereço: `street`, `number` e `complement` só aparecem depois da
locação confirmada, para qualquer tipo. Bairro e cidade são públicos.

**Protege:** preço tem que ser positivo; anúncio publicado tem que ter
coordenada (senão não apareceria em busca por distância) **e preço mensal**
(`spaces_published_requires_price`); `quantity_offered` entre 1 e 10 000, o
total nunca abaixo do oferecido e o disponível entre 0 e o oferecido
(`spaces_quantity_*`); o proprietário não baixa a quantidade oferecida abaixo
do que já está ocupado (`spaces_guard_quantity`).

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
A solicitação e, depois do aceite e do pagamento, a locação mensal.
**A tabela mais importante do sistema.**

Guarda os valores **congelados** no momento do aceite: aluguel, taxa do
locatário, taxa do proprietário, total cobrado, valor do repasse, e as taxas
vigentes em basis points. Se a plataforma mudar a taxa amanhã, contratos em
andamento continuam com o que foi combinado. Também guarda os **prazos**
(`response_deadline_at`, `first_payment_deadline_at`, a janela de pagamento
pendente) e as **instruções de acesso** do aceite (`access_instructions`,
`access_audio_path`/`_duration_ms`/`_mime`).

**Protege — e isto é o coração da segurança financeira:**
- `total_charged = aluguel + taxa_locatário` é `CHECK` no banco
- `owner_payout = aluguel − taxa_proprietário` é `CHECK` no banco
- o aluguel gravado é o **preço do anúncio**, no pedido e no aceite
  (`bookings_rent_matches_space`, gatilho `bookings_guard_price`): o navegador
  nunca manda preço
- **a última vaga não é vendida duas vezes**: `bookings_guard_capacity` trava
  o anúncio e conta quantas locações ocupam vaga (`approved`,
  `awaiting_payment`, `active`, `past_due`); passou do oferecido, recusa
  (`bookings_capacity`). Pedido pendente não ocupa vaga
- um pedido/locação viva por locatário e anúncio
  (`bookings_one_live_per_renter_space`)
- aceitar exige instruções de acesso — texto com 10+ caracteres **ou** áudio da
  pasta da conversa (`guard_booking_approval`)
- janela de pagamento pendente de **exatamente 120 minutos**
  (`bookings_payment_window`)
- locatário não pode ser o proprietário

Um bug de aplicação que tentasse gravar total adulterado é recusado pelo
Postgres. Isso está testado em `scripts/verify-schema.ts` e
`scripts/verify-reservas.ts`.

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
As mensagens, de **texto** ou **áudio** (`kind`; imagens não existem no chat).
Texto vazio é recusado pelo banco, e há limite de 4.000 caracteres. Áudio tem
caminho no bucket privado `chat-audio`, **dentro da pasta da própria conversa**
(`messages_audio_path_in_conversation`), duração e formato conferidos
(`messages_audio_shape`). Moderação esconde sem apagar (o conteúdo fica para
auditoria).

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

**Quem recebeu** (`reviewed_user_id`, Fase 21) vem da própria reserva: a
trigger preenche com a outra parte, e informar qualquer outra pessoa é
recusado. É o que alimenta a reputação de cada um, separada por papel
(como proprietário e como locatário).

**Avaliação publicada não muda nem some** (`guard_review_immutable`): nota,
texto, autor e alvo são imutáveis, e `DELETE` é recusado — apagar avaliação
ruim é o jeito mais simples de inflar média. A moderação só **oculta**
(`hidden_at`, `hidden_reason`), e avaliação oculta sai da média. Para
manutenção excepcional (ex.: pedido de exclusão pela LGPD), quem opera o
banco liga `SET LOCAL myplace.allow_review_delete = 'on'` na própria
transação; a aplicação nunca faz isso.

Uma trigger mantém a nota média do anúncio sempre coerente — com **uma casa
decimal, arredondada uma única vez** a partir das notas (4,666… → 4,7).

### `reports`
Denúncias. **Uma tabela para quatro alvos**: anúncio, usuário, mensagem
específica e avaliação (Fase 21). `booking_id` (Fase 20, opcional) liga a
denúncia a uma locação — é a base para decidir uma caução.

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
- quem denunciou acompanha o status da própria denúncia, mas não lê a
  evidência copiada nem a anotação de quem julgou (permissão por coluna);
  **ninguém vê denúncia feita contra si**
- denúncia procedente de anúncio, mensagem ou avaliação conta contra quem
  **escreveu** o conteúdo

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
Fila de notificações do usuário. E-mail e push leem daqui — uma origem só, em
vez de cada evento disparar e-mail por conta própria.

`dedupe_key` (Fase 21) torna o aviso **idempotente**: um índice único por
pessoa + chave faz o mesmo evento (webhook reentregue, clique duplo) virar
um aviso só. Avisos sem chave — cada mensagem nova, por exemplo — seguem
livres.

### `notification_preferences`
O que cada pessoa quer receber, por categoria, "na central" e "no celular"
(Fase 21). Sem linha, vale o padrão (tudo ligado).

**Protege:** reservas, pagamentos e conta são **essenciais** — um `CHECK`
recusa desligá-las, qualquer que seja o caminho (tela, servidor ou SQL).

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

### `phone_verifications`
Cada pedido de verificação de telefone por SMS (Fase 21). **O código não fica
aqui** — quem gera, envia e confere é o provedor (Twilio Verify). Guarda o
número que o servidor pediu para verificar (é ele, e não o que vier do
formulário depois, que recebe o selo), o estado e as tentativas.

**Protege:** número só no formato internacional (E.164); no máximo uma
verificação pendente por pessoa; no máximo 10 tentativas; estado e data de
conclusão sempre coerentes.

---

## Descoberta, disponibilidade e desempenho (Fase 23)

Migrações `0025` a `0030`. Toda tabela nova tem RLS ligada **sem política
nenhuma** e `REVOKE` para `anon`/`authenticated`: o navegador não lê nem
escreve direto; tudo passa pelo servidor, que filtra pelo dono logado.

| Tabela | Para quê | O que o banco garante |
|---|---|---|
| `space_price_history` | cada mudança de preço depois da publicação | gravada **por gatilho** (`spaces_record_price_change`), nunca pelo app; imutável (`space_price_history_immutable`: UPDATE/DELETE recusados, só sai em cascata com o anúncio); só mudança real (`space_price_history_real_change`), preços positivos |
| `waitlist_entries` | lista de espera de espaço indisponível | uma entrada ativa por pessoa e espaço; o dono não entra no próprio espaço e quem tem bloqueio com o dono também não (`waitlist_entries_guard`); datas coerentes com o estado. Se o espaço está mesmo indisponível quem confere é o servidor, na hora de entrar — a disponibilidade muda com reserva, pausa e calendário, e o banco não trava isso na fila |
| `space_availability_blocks` | bloqueios manuais do calendário | início antes do fim, até 366 dias, nota curta; bloqueio não pode cair em cima de reserva vigente e reserva não começa antes de um bloqueio (`space_availability_blocks_guard`, `bookings_guard_blocked_period`, com trava da linha do espaço contra corrida) |
| `saved_searches` / `saved_search_matches` | alertas de busca e o que já casou com cada um | critérios como objeto JSON, rótulo curto, sem alerta repetido (`saved_searches_user_criteria_key`); limite de alertas ativos por plano (`saved_searches_active_limit`, lê `alerts.saved_search_max_*` e trava o perfil contra corrida); um anúncio casa uma vez por alerta |
| `listing_suggestions` | sugestões da IA para o anúncio | guarda o texto sugerido; aplicar copia **do banco** (não do navegador) e fica registrado na auditoria |
| `space_daily_stats` | visualizações e compartilhamentos por dia | só contadores (`space_id`, `day`, `views`, `shares`), nunca negativos — **nenhuma coluna de pessoa, IP ou horário** |
| `ai_usage_counters` | quantas chamadas de IA por dia e função | teto diário global que vale entre todas as instâncias; sem dado de quem chamou |

**Outros gatilhos da fase:**

- `bookings_sync_space_occupancy` — reserva vigente marca o espaço como
  `rented`; quando ela termina, volta a `published` (antes o status `rented`
  nunca era usado e espaço ocupado aparecia como disponível).
- `spaces_published_not_occupied` — não deixa marcar como publicado um
  espaço com reserva vigente.
- `favorites_guard_server_fields` — o preço de referência do favorito (base
  do aviso de queda) é sempre o do anúncio, nunca o que o navegador mandar.
- `guard_delete_photo_of_published` (já existia, Fase 2) — passa a valer
  também para espaço `rented`: anúncio no ar, alugado ou não, não fica com
  menos fotos que o mínimo.
- `0030` — as duas travas do calendário deixam datas invertidas para o CHECK
  de sempre (`space_availability_blocks_dates_ordered`,
  `bookings_dates_ordered`). Antes, o `daterange` delas estourava primeiro e a
  recusa saía com um erro cru do Postgres, sem o nome da regra. Nada que era
  recusado passou a ser aceito.

**Configurações (`platform_settings`) novas:** `alerts.*` (limites e
intervalos dos alertas), `ai.*` (tetos de IA), `analytics.views_counting_since`
(dia em que a contagem de visualizações começou — antes dele o painel mostra
"sem dado", nunca zero) e `premium.price_*` (só exibição; não há cobrança).

**Sem tabela nova, mas com regra nova:** a renovação mensal registra em
`payments` as cobranças que a assinatura gera no gateway, e
`subscriptions.next_due_date` passa a ser recalculada a cada evento (a mais
antiga em aberto, ou um mês depois da última paga).

---

## Modelo mensal por quantidade (migração `0033`)

A `0033` troca o desenho da Parte 12 (unidades individuais, grupos, aluguel por
hora/dia/semana — `0031` e `0032`) pelo modelo atual. Detalhes do produto em
[ALUGUEL.md](./ALUGUEL.md). A migração é **uma transação só**, cuida dos dados
que já existiam e **nunca apaga locação** (pagamentos e livro-razão apontam
para elas): as de hora/dia/semana ainda vivas foram encerradas ou canceladas, e
anúncio sem preço mensal ficou **pausado** até o proprietário informar o valor.

**Saiu:** tabelas `space_units` e `space_unit_groups`; colunas `kind`,
`group_id`, `unit_id`, `starts_at`, `ends_at`, `occupied_until`,
`duration_*`, `renewal_allowed`, `renewed_from_id`, `hold_expires_at` em
`bookings` e `temp_from_*` em `spaces`; os gatilhos e funções de unidade,
preço por tempo e ocupação por unidade; os tipos `rental_kind`,
`rental_time_unit`, `temporary_pricing_mode`, `operating_hours_mode`; as
configurações `rental.hold_minutes`, `rental.max_advance_days` e
`booking.request_expiry_days`.

**Entrou:**

| O quê | Para quê |
|---|---|
| `spaces.quantity_offered` / `quantity_total` / `quantity_available` | quantas unidades o anúncio oferece, e quantas estão livres |
| `bookings.response_deadline_at` / `first_payment_deadline_at` | prazos de 24 h (resposta do proprietário, pagamento do locatário), gravados pelo gatilho `bookings_set_deadlines` |
| `bookings.access_*` | instruções de acesso do aceite: texto e/ou áudio, obrigatórias |
| `booking_end_requests` | pedido do **proprietário** para encerrar a locação, com data e motivo; um pendente por locação (`booking_end_requests_one_pending`); só dono, só locação `active`/`past_due`, até 1 ano à frente (`guard_booking_end_request`). RLS ligada, sem política, `REVOKE` para `anon`/`authenticated` |
| enum `booking_end_reason` (recriado) | `cancelled_by_renter`, `cancelled_by_owner`, `request_not_answered`, `payment_not_received`, `owner_end_request` |
| `message_kind` (`text`/`audio`) e as colunas de áudio em `messages` | chat com áudio |
| bucket `chat-audio` (Storage, privado) e suas políticas | áudio do chat e das instruções; só participante da conversa lê e envia |
| `platform_settings`: `booking.request_expiry_hours` (24), `booking.payment_deadline_hours` (24), `booking.max_start_advance_days` (90), `rental.end_request_min_notice_days` (0), `privacy.exact_location_types` | prazos, aviso prévio (ainda sem regra) e tipos de espaço com ponto exato no mapa |

**Funções:**

- `refresh_space_availability(space)` — **reconta** (não soma/subtrai) as
  locações que ocupam vaga e atualiza `quantity_available` e o status do
  anúncio (`published` ↔ `rented`); trava a linha do anúncio. Chamada pelo
  gatilho `bookings_sync_availability` e quando a quantidade muda
  (`spaces_sync_after_quantity_change`).
- `release_expired_rentals(space)` — encerra **pelo relógio do banco** o que
  venceu: pedido sem resposta (24 h), aceite não pago (24 h), pagamento
  pendente (2 h) e pedido de encerramento na data. Devolve quantas linhas
  mudou. É chamada nas leituras e ações relevantes e pelo agendador.
- `guard_availability_block` / `guard_booking_against_blocks` — o bloqueio
  de datas do calendário fecha apenas o **início** de locações novas
  (`bookings_period_not_blocked`); nunca derruba locação vigente.
- `sync_approx_location` + `resync_approx_after_privacy_setting` — privacidade
  da localização por tipo (ver `spaces`).

**Índices novos que importam:** `bookings_one_pending_per_renter_space` (um
pedido pendente por pessoa e anúncio) e `booking_end_requests_due_idx` (a fila
dos pedidos que vencem hoje).

**Verificação do banco migrado:** `scripts/verify-paridade.ts` compara, tabela
por tabela, colunas, índices, CHECKs e enums do banco com o schema do Drizzle;
a cadeia `0000` → `0033` foi rodada num banco vazio para provar que ela sobe
sozinha.

---

## Verificação

Nada acima é promessa. Os scripts rodam contra um **Postgres real**,
provando que cada regra citada aqui bloqueia mesmo o dado inválido:

```bash
pnpm tsx scripts/verify-schema.ts        # cada CHECK, gatilho e índice único (quantidade, preço, aceite, prazos, encerramento)
pnpm tsx scripts/verify-safety.ts        # segurança entre usuários
pnpm tsx scripts/verify-confianca.ts     # perfil, avaliações, verificações, RLS
pnpm tsx scripts/verify-descoberta.ts    # tudo da Fase 23, inclusive IDOR entre usuários
pnpm tsx scripts/verify-reservas.ts      # fluxo mensal por quantidade: prazos, última vaga em paralelo, encerramento
pnpm tsx scripts/verify-paridade.ts      # banco migrado × schema do Drizzle
pnpm verify                              # todos os scripts de servidor
pnpm verify:integracoes                  # o app de verdade num navegador real
```

Ele cria dados, tenta violar cada invariante, confirma que o banco recusa, e
limpa tudo ao final.

## Etapa 2 — Premium (migrações 0034 a 0036)

- `0034`: `premium_memberships` (resumo), `premium_cycles` (período efetivamente pago; imutável),
  `premium_charges`; funções `premium_is_active`, `premium_financial_active`; travas de cota por ciclo.
- `0035`: taxas `fees.owner_fee_bps_premium` e `fees.premium_min_rent_cents`; gatilho
  `bookings_guard_price_fee` (taxa só padrão ou reduzida com Premium financeiro vigente e aluguel ≥ piso).
- `0036`: `premium_benefits`, `platform_transfers`, `premium_benefit_cycle_id()`,
  `premium_benefit_exposure()`, gatilho `guard_premium_benefit` e a **flag desligada**
  `premium.first_month_benefit_enabled`. Ver `docs/PREMIUM-BENEFICIO.md`.
