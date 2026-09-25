# Status honesto do projeto

> **Atualizado em:** 25/09/2026 · **Fases concluídas:** 1 a 6, 9 a 16 + segurança interna + auditoria de segurança adversarial · **Fases 5, 7 e 8 dependem só da credencial Asaas real** (código e testes prontos) · **Fase 13+14 (Destaques/Turbo/Premium, compra avulsa, elegibilidade e área de gerenciamento) funcionam de ponta a ponta, com cobrança real no Asaas; a assinatura mensal paga do Premium em si ainda não existe — hoje o benefício grátis é concedido manualmente pelo admin, como mecanismo interino** · **Fase 15 (avaliações, notificações, navegação no celular, páginas institucionais, encerrar aluguel) fecha as lacunas mais visíveis de um marketplace real; layout ajustado — paleta de cores segue em aberto, por pedido do usuário** · **Fase 16 (classificação de padrão do espaço por IA de visão — ferramenta do proprietário, não selo público) depende só da credencial Anthropic real** (código, schema e motor de cálculo prontos e testados)

Estados usados:

| Estado | Significado |
|--------|-------------|
| ✅ **IMPLEMENTADO** | Funciona e foi testado |
| ⚙️ **CONFIGURADO** | Estrutura pronta, falta credencial real |
| 🔑 **PRECISA DA SUA AÇÃO** | Bloqueado esperando você criar conta ou chave |
| ⬜ **NÃO IMPLEMENTADO** | Ainda não existe |
| 🚧 **BLOQUEADO POR SERVIÇO EXTERNO** | Depende de terceiro |
| ⚠️ **NÃO SEGURO PARA PRODUÇÃO** | Existe, mas não pode ir ao ar assim |

---

## Fase 1 — Arquitetura, banco e autenticação ✅

| Item | Estado | Observação |
|------|--------|------------|
| Projeto Next.js 16 + TypeScript strict | ✅ | `pnpm build` passa limpo |
| Design system próprio | ✅ | Tokens OKLCH, claro/escuro, `globals.css` |
| Modelo de dados (21 tabelas) | ✅ | `src/db/schema/` |
| Migrações versionadas | ✅ | Aplicadas contra Postgres 16 + PostGIS 3.4 real |
| Índices geoespaciais | ✅ | GIST sobre `(location::geography)` — busca por raio testada |
| Invariantes financeiras no banco | ✅ | Total adulterado é recusado pelo Postgres |
| Livro-razão append-only | ✅ | Trigger bloqueia UPDATE e DELETE |
| Idempotência de webhook | ✅ | Chave única por evento |
| Regras anti-avaliação-falsa | ✅ | Três camadas, testadas |
| RLS em todas as tabelas | ✅ | Negar por padrão |
| Cálculo de valores no servidor | ✅ | `src/lib/money.ts` |
| Cadastro, login, recuperação de senha | ✅ | Supabase Auth |
| Confirmação de e-mail | ✅ | Rotas de callback prontas |
| Autorização por papel | ✅ | `src/lib/auth/dal.ts` |
| Proteção de rotas | ✅ | `src/proxy.ts` — testado com requisição real |
| Proteção contra open redirect | ✅ | Testado |
| Página inicial | ✅ | Busca e geolocalização reais |
| Geolocalização do navegador | ✅ | Trata recusa com mensagem clara e alternativa manual |
| Verificação automatizada do banco | ✅ | 32 checagens — `pnpm tsx scripts/verify-schema.ts` |
| **Rate limiting** | ⚠️ | Em memória. **Não funciona em serverless.** Ver §Riscos |
| Projeto Supabase criado | ✅ | pelo usuário, com PostGIS ativo |
| SQL de instalação do schema | ✅ | `supabase/setup.sql` — testado num banco limpo que simula o Supabase |
| Schema aplicado no Supabase | 🔑 | colar `supabase/setup.sql` no SQL Editor — [SETUP.md §1.6](./SETUP.md#16-criar-o-schema--cole-um-sql-não-mande-senha-para-ninguém) |
| Credenciais para deploy | 🔑 | vão direto para a Vercel, não passam por aqui |

---

## Segurança interna ✅ *(fora da numeração de fases)*

Adicionada a pedido, fora da ordem original. Detalhada em
[SEGURANCA.md](./SEGURANCA.md).

| Item | Estado | Observação |
|------|--------|------------|
| Denúncia de anúncio | ✅ | 18 motivos, agrupados por alvo |
| Denúncia de usuário | ✅ | |
| Denúncia de mensagem específica | ✅ | sem isso, denúncia de assédio chega sem o que julgar |
| Severidade automática | ✅ | calculada no servidor a partir do motivo, nunca enviada pelo formulário |
| Evidência congelada | ✅ | trigger copia o conteúdo denunciado; sobrevive a edição — testado |
| Limites anti-abuso na denúncia | ✅ | 10/dia, 3/minuto, uma em aberto por alvo |
| Confidencialidade da denúncia | ✅ | ninguém vê denúncia feita contra si (RLS) |
| Bloqueio entre usuários | ✅ | mútuo, imediato, garantido por trigger |
| Bloqueio impede conversa, mensagem e reserva | ✅ | as três testadas |
| Bloqueio encerra conversa existente | ✅ | |
| Centro de segurança da conta | ✅ | `/minha-conta/seguranca` |
| Componente de denúncia | ✅ | `<dialog>` nativo, acessível — aparece nas telas das Fases 2 e 6 |
| Detector de dados de contato | ✅ | telefone, e-mail (inclusive ofuscado), CPF/CNPJ, chave Pix, redes, pedido de pagamento por fora |
| Validação de CPF/CNPJ | ✅ | dígito verificador oficial |
| Contagem de reincidência | ✅ | trigger mantém `upheld_report_count` |
| Verificação automatizada | ✅ | 72 checagens — `pnpm tsx scripts/verify-safety.ts` |
| Incentivo visual a fechar no app | ✅ | home, `/protecao`, rodapé |
| Página pública de proteção | ✅ | `/protecao` |
| Checklist de visita | ✅ | 4 grupos, muda por tipo de espaço, salvo no navegador |
| Aviso escalonado de pagamento por fora | ✅ | componente ligado no chat de verdade (Fase 6) — aparece enquanto a pessoa digita, testado em navegador real |
| Níveis de confiança do perfil | ✅ | denúncia procedente domina histórico longo |
| Contagem de locações concluídas | ✅ | trigger; conta os dois lados |
| Verificação de documento no perfil | ✅ banco | preenchido pelo KYC na Fase 8 |
| Aplicação automática de suspensão | ✅ trigger | Fase 11 — `0011_suspensao_automatica.sql`, só escala |
| Fila de moderação | ✅ | Fase 11 — `/admin/denuncias` |
| Detector ligado ao chat | ✅ | Fase 6 — sinaliza `flagged_at`/`flag_reason` a cada mensagem enviada de verdade |

---

## Fase 2 — Cadastro e publicação de anúncios ✅

| Item | Estado | Observação |
|------|--------|------------|
| Formulário em 8 etapas | ✅ | volta sem perder dado; cada etapa grava no rascunho |
| Rascunho retomável | ✅ | `/anunciar` lista onde você parou |
| Tipo define o formulário | ✅ | galpão pede altura, vaga de moto não |
| Busca de endereço por CEP | ✅ | **no servidor** (`/api/cep/[cep]`), BrasilAPI + ViaCEP de reserva, cache e limite por IP — testado em navegador real |
| Mapa com pino arrastável | ✅ | MapLibre; tiles, zoom, arrastar e marcadores testados em navegador real |
| Geolocalização do navegador | ✅ | trata recusa com alternativa manual |
| Localização aproximada automática | ✅ | trigger no banco, deslocamento determinístico ~250 m |
| Upload de fotos | ✅ | fluxo completo testado: prévia, progresso, envio, URL assinada, foto na tela e depois de recarregar |
| Validação por magic bytes | ✅ | PHP disfarçado de JPEG é recusado — testado |
| **Remoção de EXIF/GPS das fotos** | ✅ | **corrige falha que vazava o endereço exato** — testado |
| Miniatura automática | ✅ | grade de anúncios carrega ~1 KB por foto em vez de centenas |
| Redimensionamento no navegador | ✅ | foto de iPhone acima de 8 MB deixa de ser recusada |
| Mapa de área na página pública | ✅ | círculo, não pino (padrão Airbnb) |
| CEP busca sozinho | ✅ | 8 dígitos + 600 ms de espera = **uma** consulta; testado contando as requisições |
| Reordenar e escolher capa | ✅ | |
| Preço em centavos | ✅ | mínimo lido de `platform_settings` |
| Prévia do repasse | ✅ | mostra quanto cai na conta antes de publicar |
| Revisão antes de publicar | ✅ | mostra exatamente a visão pública |
| Publicação valida tudo de novo | ✅ | servidor + `CHECK` no banco |
| Anúncio incompleto não publica | ✅ | testado |
| Painel "Meus espaços" | ✅ | filtros, pausar, editar, excluir |
| Pausar / reativar | ✅ | some da busca, continua no painel |
| Exclusão preserva histórico | ✅ | com reserva vira arquivado — testado |
| Anúncio alugado trava edição sensível | ✅ | só descrição e regras |
| Marketplace público `/espacos` | ✅ | dados reais do banco, sem mock |
| Página do anúncio `/espacos/[slug]` | ✅ | |
| **Outro usuário não edita anúncio alheio** | ✅ | **testado** |
| **Endereço exato não vaza** | ✅ | **testado, inclusive serializando o objeto inteiro** |
| Mapa na listagem com marcadores | ✅ | marcadores vêm do banco, mostram o preço, abrem o anúncio — testado |
| Recomendação de 5 fotos | ✅ | orienta sem travar rascunho |
| Mínimo de 3 fotos para publicar | ✅ | dito na interface, cobrado na action e **garantido por trigger no banco** |
| Servidor não confia na cidade que o navegador manda | ✅ | confirma o CEP ao salvar — testado com cidade forjada |
| Políticas do Storage por pasta do dono | ✅ | migração 0009 aplicada no Supabase real em 18/09/2026 — bucket privado, 4 políticas confirmadas |
| Verificação automatizada | ✅ | 37 checagens — `scripts/verify-spaces.ts`; fotos/mapa/CEP em navegador real cobertas junto com a Fase 3/4 (ver abaixo) |
| Conversa com proprietário | ✅ | Fase 6, ver seção própria abaixo |
| Reservar / alugar (solicitação, aceite, cancelamento) | ✅ | Fase 5, ver seção própria abaixo — falta só o pagamento (Fase 7) |

---

## Fase 3 e 4 — Busca, mapa, favoritos e página do espaço ✅

O usuário chamou este bloco de "Parte 3" no pedido original; cobre as duas
fases do roteiro interno porque, na prática, busca e página do anúncio saíram
juntas de um só pedido.

| Item | Estado | Observação |
|------|--------|------------|
| Busca por tipo + localização | ✅ | GPS, CEP, cidade/bairro conhecido ou texto livre |
| Geolocalização real do navegador na busca | ✅ | mesmo tratamento de recusa já usado no anúncio |
| Reconhecimento de tipo por palavra-chave | ✅ | "quero uma vaga" → `vaga_carro`, sem IA — `src/lib/spaces/keywords.ts` |
| Geocodificação de endereço/cidade livre | ✅ | Google → MapTiler → Nominatim (grátis, sem chave), em camadas — `src/lib/maps/geocoding.ts` |
| `resolveLocation`: GPS → CEP → cidade/bairro real → geocodificação | ✅ | nunca inventa coordenada; sem resultado, cai para busca por texto |
| Distância calculada no servidor | ✅ | sempre a partir de `approx_location`, nunca do ponto exato — ver [SEGURANCA.md §8](./SEGURANCA.md#8-privacidade-da-localização) |
| Filtro de raio EXCLUI, não só inclui | ✅ | testado com anúncio a ~100 km |
| Filtros de preço, características e disponibilidade | ✅ | acumulam entre si, refletidos na URL (compartilhável, volta funciona) |
| Ordenação: mais próximos, menor/maior preço, mais recentes | ✅ | "mais próximos" só aparece com um ponto de referência real |
| Lista + mapa, lado a lado no desktop | ✅ | mapa sempre montado, sticky |
| Alternância Lista/Mapa no celular | ✅ | mapa só monta ao pedir, desmonta de verdade ao fechar |
| Estados vazio/erro honestos | ✅ | "nada por aqui" muda de texto conforme o motivo; CEP não encontrado é dito, não escondido |
| Página do espaço: galeria com zoom e navegação | ✅ | teclado (setas/Esc) e toque, navegação circular |
| CTA "Tenho interesse" honesto | ✅ | diz que a solicitação ainda não existe, em vez de fingir um botão que funciona |
| Favoritos | ✅ | tabela da Fase 1, isolamento por usuário testado com dois usuários reais |
| Compartilhar anúncio | ✅ | Web Share API nativa; sem ela, copia o link de verdade para a área de transferência |
| Imagem de compartilhamento (OG) dinâmica | ✅ | `espacos/[slug]/opengraph-image.tsx`, gerada por request, sem depender de URL assinada que expira |
| Metadados de SEO (título, descrição, canonical) | ✅ | por anúncio |
| Endereço/coordenada exata nunca aparece na busca | ✅ | **testado**, inclusive contra o HTML renderizado da página |
| Verificação automatizada (banco) | ✅ | 61 checagens — `scripts/verify-busca.ts` |
| Verificação automatizada (navegador) | ✅ | 6 testes reais (E–J) somados aos 4 de Fase 2 — 126 checagens; TESTE K (Fase 5, abaixo) soma mais 13 — 139 no total, `pnpm verify:integracoes` |
| Reserva / solicitação de fato | ✅ | Fase 5, ver seção abaixo — o CTA agora funciona de verdade |

**Dois bugs reais encontrados e corrigidos escrevendo os testes desta fase**
(não hipotéticos — pegos com Chromium de verdade, ver `git log`):

1. O mapa do celular tinha altura zero na primeira renderização: o CSS do
   `maplibre-gl` importado pela biblioteca troca `position: absolute` do
   Tailwind por `position: relative` na mesma classe, dependendo da ordem de
   carregamento das folhas de estilo — não é algo que se deva torcer para dar
   certo. Corrigido tornando o tamanho do contêiner do mapa independente
   dessa disputa de especificidade (`src/components/map/spaces-map.tsx`).
2. Clicar num marcador do mapa podia ser interceptado por outro marcador
   sobreposto na tela, quando dois anúncios próximos aparecem no mesmo
   enquadramento de um mapa que também precisa caber um anúncio distante —
   comportamento real de mapa com pontos próximos, corrigido no teste (mira
   num marcador isolado) em vez de mascarado.

---

## Fase 5 — Reserva e aluguel, sem pagamento 🚧

O pedido chamou este bloco de "Parte 4": identidade visual (abaixo) + o fluxo
real de solicitação → aceite/recusa → reserva → cancelamento. **Pagamento
ainda não existe** — isso é a Fase 7, bloqueada esperando a conta Asaas (ver
a tabela de fases mais abaixo). Sem pagamento, também não há repasse, cobrança
recorrente nem "aluguel ativo" de verdade — o que existe é o combinado entre
as duas partes, registrado e protegido contra corrida no banco.

### Identidade visual

| Item | Estado | Observação |
|------|--------|------------|
| Paleta azul + tokens OKLCH | ✅ | `--color-brand-*`, mesma curva de contraste (claro/escuro) da paleta anterior, só muda o matiz |
| Componente `Badge` | ✅ | `src/components/ui/badge.tsx` — retangular, cinco tons, **não** é pill |
| Navegação por sub-abas do proprietário | ✅ | `OwnerSubnav` — Meus espaços / Solicitações / Financeiro, com contador de pendentes |
| Imagem de compartilhamento (OG) | ✅ | atualizada para a nova paleta |

### Solicitação de aluguel

| Item | Estado | Observação |
|------|--------|------------|
| Tela de solicitação (`/espacos/[slug]/solicitar`) | ✅ | espaço, período, mensagem opcional, resumo com a taxa embutida antes de enviar |
| Status real no banco, não só no frontend | ✅ | enum `booking_status`: `requested/approved/rejected/cancelled/expired/awaiting_payment/active/past_due/ended` |
| Servidor recalcula o valor; nunca confia no que o navegador mandou | ✅ | `computeBookingAmounts` roda dos dois lados — o navegador só antecipa, quem decide é o servidor |
| Taxa aplicada: 3% locatário + 3% proprietário | ✅ | lida de `platform_settings` no momento da solicitação **e recongelada** no momento do aceite |
| Não deixa duplicar solicitação pendente para o mesmo espaço | ✅ | testado |
| Não deixa solicitar o próprio espaço | ✅ | testado |
| Expiração automática de solicitação parada | ✅ | varredura a cada listagem (`expireStaleBookingRequests`), sem precisar de worker/cron — status vira `expired` de verdade no banco |

### Área do proprietário — Solicitações

| Item | Estado | Observação |
|------|--------|------------|
| Lista com filtro por status | ✅ | Todas / Pendentes / Aceitas / Encerradas |
| Aceitar revalida disponibilidade no banco, não confia no que a tela mostrava | ✅ | transação + índice único parcial (`bookings_one_active_per_space`) |
| **Duas aprovações simultâneas pro mesmo espaço: só uma vence** | ✅ | **testado com corrida real (`Promise.all`), não hipotético** — cobre os dois erros que o Postgres pode devolver (`23505` de violação de unicidade e `40P01` de deadlock) |
| Aceitar recusa automaticamente os outros interessados do mesmo espaço | ✅ | com notificação para quem foi preterido, não só para quem ganhou |
| Recusar com motivo opcional | ✅ | só o dono e o interessado veem o motivo |
| Notificação interna | ✅ | proprietário: nova solicitação · locatário: aceita ou recusada — pelo sistema interno de notificações já existente |

### Cancelamento

| Item | Estado | Observação |
|------|--------|------------|
| Locatário cancela solicitação pendente ou reserva já aceita | ✅ | testado |
| Proprietário cancela reserva já aceita (solicitação pendente ele recusa, não cancela) | ✅ | testado |
| Política de reembolso | ⬜ | **decisão de negócio ainda não tomada** — sem pagamento, também não há o que reembolsar ainda; ver Fase 7 |

### Dashboards

| Item | Estado | Observação |
|------|--------|------------|
| `/reservas` (locatário) | ✅ | em andamento / encerradas numa lista só (ver bug corrigido abaixo), cancelar reserva |
| `/meus-espacos/financeiro` (proprietário) | ✅ | repasse esperado dos aluguéis aceitos; **honesto sobre não ter gateway** — não inventa pagamento nem mostra número de "recebido" |
| Verificação automatizada (banco) | ✅ | 43 checagens — `scripts/verify-bookings.ts`, inclui a corrida de concorrência real |
| Verificação automatizada (navegador) | ✅ | TESTE K — solicitar, aceitar, cancelar, tudo pela interface, num Chromium real; 13 checagens somadas às 126 já existentes |

**Um bug real, com três ocorrências da mesma causa, encontrado e corrigido
escrevendo os testes desta fase** (pego pelo Chromium de verdade travando em
`waitFor`, não hipotético): depois de qualquer Server Action, o Next atualiza
sozinho a árvore de Server Components da rota atual — equivalente a um
`router.refresh()` implícito. Quando um componente cliente guarda localmente
"acabei de ter sucesso" (para mostrar uma confirmação inline) e o **pai**
decide se esse componente existe na tela com base no mesmo dado que a própria
ação acabou de mudar, essa atualização automática desmonta o componente antes
da confirmação aparecer. Apareceu de duas formas diferentes:

1. Um `{status === 'requested' && <Componente />}` no pai: o status muda,
   a condição vira falsa, o componente (com o estado de sucesso dentro dele)
   some da árvore. Corrigido em `RespondRequestActions` e
   `CancelBookingButton`: agora recebem o status por prop e decidem sozinhos
   o que mostrar, checando o sucesso local **antes** do status vindo de fora.
   `RequestBookingForm` teve a mesma causa raiz, mas a solução foi diferente
   porque o objetivo dele é navegar para outra página: o redirecionamento
   passou a acontecer no servidor (`redirect()`), não num `useEffect` no
   cliente que corria contra a mesma atualização automática.
2. Mais sutil, em `/reservas`: a lista de reservas era **duas** arrays
   filtradas por status, cada uma no seu `<ul>` ("Em andamento" / "Encerradas").
   Cancelar uma reserva aceita move o item de uma lista pra outra — e mesmo
   com a mesma `key`, o item muda de pai no React (de um `<ul>` para outro) e
   perde a identidade, então o `CancelBookingButton` também é desmontado e
   remontado do zero, sem chance de mostrar "Cancelado.". Corrigido trocando
   as duas listas por **uma lista só**, ordenada com as ativas primeiro
   (`Array.prototype.sort` é estável), com o cabeçalho de seção inserido
   conforme a posição — nenhum item muda de pai quando o status dele muda.

### Pagamento de ponta a ponta — código pronto, falta só a credencial real 🚧

Detalhes completos e a reconfirmação da documentação em
[PAGAMENTOS.md §4](./PAGAMENTOS.md#4-reconfirmação-em-18092026-e-o-que-ainda-falta).

| Item | Estado | Observação |
|------|--------|------------|
| Cliente Asaas (`src/lib/payments/asaas.ts`) | ✅ | cliente, subconta, assinatura com split, busca de cobrança, estorno, cancelamento |
| Webhook (`POST /api/webhooks/asaas`) | ✅ | autentica por token (header `asaas-access-token`), idempotente de verdade — reentrega do mesmo evento testada e comprovada sem duplicar nada |
| `PAYMENT_CONFIRMED` ativa a reserva; `PAYMENT_RECEIVED` gera o repasse | ✅ | decisão registrada em PAGAMENTOS.md §4 — o locatário não espera a plataforma receber pra usar o que já pagou |
| Atraso (`PAYMENT_OVERDUE`) e recuperação | ✅ | reserva vira `past_due`, volta a `active` ao regularizar |
| Tentativa de webhook com token forjado | ✅ | recusada com 401, **nenhum evento gravado** — testado tentando de verdade |
| Onboarding do proprietário (`/meus-espacos/financeiro`) | ✅ | formulário cria a subconta no Asaas (`createSubaccount`), grava `walletId` — sem isso nenhum repasse tem para onde ir |
| Checkout do locatário (`/reservas/[id]/pagar`) | ✅ | cria cliente Asaas + assinatura com split, grava localmente, redireciona para a fatura hospedada pelo Asaas — nenhum dado de cartão passa por este código |
| CTA "Pagar agora" em `/reservas` | ✅ | aparece quando a reserva está `approved`, aguardando o locatário confirmar |
| Servidor nunca confia em preço/status vindo do formulário | ✅ | o valor cobrado é sempre `bookings.total_charged_cents`, congelado no aceite — nunca recalculado a partir do que o formulário manda |
| Verificação automatizada | ✅ | 63 checagens (`scripts/verify-payments.ts`, diretas) + 8 checagens em Chromium real (TESTE L, `pnpm verify:integracoes`) — o proprietário preenche o formulário de verdade, o locatário clica em "Pagar agora", digita o CPF e é redirecionado — contra o Postgres real e um dublê local do Asaas (sem credencial real, mesmo padrão do CEP/mapa) |
| Credencial real / conta Asaas | 🔑 | chave sandbox já em `.env.local`; este ambiente não alcança a API real do Asaas pra testar a chamada de verdade (mesmo bloqueio de rede da documentação) — o primeiro teste real só acontece com internet normal, fora deste container |
| Aprovação de KYC da subconta bloqueia recebimento? | ⚠️ | não confirmado (nem por busca) — a conta hoje entra como `can_receive=true` assim que criada, otimista; se o Asaas exigir aprovação antes, isso precisa mudar |
| Pix Automático (débito recorrente sem ação mensal do locatário) | ⬜ | a assinatura de hoje usa o recurso padrão do Asaas (`billingType: UNDEFINED`, o locatário escolhe Pix/boleto/cartão a cada cobrança); Pix Automático é uma melhoria futura, não implementada |

**Dois bugs reais encontrados rodando o próprio teste repetidamente** (não
hipotéticos): (1) o espaço de teste usava a mesma coordenada de um fixture de
`verify-busca.ts` e, uma vez com lançamento no razão, ficava ancorado no
banco para sempre — contaminava contagens de busca de execuções futuras;
corrigido na raiz (espaço fica `draft`, nunca `published`) e as sobras já
existentes foram arquivadas manualmente. (2) `profiles.cpf_cnpj` tem
`UNIQUE` de verdade no banco — um CPF de teste fixo, reusado em toda
execução, colidia com o perfil (também permanente) de uma execução anterior;
corrigido gerando um CPF válido novo a cada rodada.

---

## Fase 6 — Chat real entre locatário e proprietário ✅

Chat de verdade, no contexto de um anúncio: uma conversa por (espaço,
locatário), sempre visível pelos dois lados. Reusa integralmente o que a
Fase 1 (segurança interna) já tinha construído — detector de contato,
bloqueio, denúncia — em vez de duplicar qualquer regra.

| Item | Estado | Observação |
|------|--------|------------|
| Iniciar conversa (`/espacos/[slug]`) | ✅ | botão "Falar com o proprietário"; reabrir a mesma conversa não duplica (`UNIQUE (space_id, renter_id)`) |
| Inbox (`/mensagens`) | ✅ | prévia da última mensagem, contagem de não lidas, mais recente primeiro |
| Thread (`/mensagens/[id]`) | ✅ | bolhas próprio/outro, mensagem do sistema, mensagem escondida por moderação mostra só o aviso |
| Autorização | ✅ | só quem participa (locatário ou dono) vê a conversa — na DAL, testado com um terceiro tentando acessar |
| Indicador de não lidas no cabeçalho | ✅ | ponto vermelho + contagem no `aria-label`, testado em navegador real nos dois lados |
| Marcar como lida | ✅ | ao abrir a thread |
| Detector de dados de contato ligado de verdade | ✅ | sinaliza (`flagged_at`/`flag_reason`), **não bloqueia o envio** — mesma decisão de produto documentada em `contact-detection.ts` |
| Aviso ao digitar (`OffPlatformWarning`) | ✅ | aparece antes de enviar, escalonado (contato vs. pedido de pagamento), testado em navegador real |
| Bloqueio encerra a conversa | ✅ | trigger do banco (`user_blocks_close_conversations`, já existia desde a Fase de segurança) — testado disparando um bloqueio de verdade e conferindo `closed_at` |
| Bloqueio impede nova conversa | ✅ | testado |
| Validação de mensagem (vazia, 4000 caracteres) | ✅ | |
| Notificação por e-mail de mensagem nova (Resend) | ✅ | `src/lib/email/resend.ts` + `src/lib/messaging/notify.ts` — best-effort de propósito: sem `RESEND_API_KEY` configurada (ver [SETUP.md §5](./SETUP.md#5-resend--e-mails-fase-6)), o chat continua funcionando normalmente, só não manda o e-mail — testado nos dois cenários |
| Mensagem de sistema na reserva ("reserva aceita"/"cancelada") | ✅ | `src/lib/messaging/system.ts` — aceite CRIA a conversa se ainda não existir (as partes quase sempre vão precisar combinar algo); cancelamento só publica numa conversa que já existia, não abre canal novo só pra avisar isso |
| Verificação automatizada (banco) | ✅ | 75 checagens — `scripts/verify-messaging.ts` (era 48; +27 de e-mail e mensagem de sistema) |
| Verificação automatizada (navegador) | ✅ | TESTE M — iniciar conversa, aviso ao digitar, enviar (com e-mail capturado pelo dublê), indicador de não lida nos dois lados, responder, marcar como lida — 14 checagens; TESTE K ganhou mais 2 (mensagem de sistema do aceite + e-mail) — 163 no total em `pnpm verify:integracoes` |

**Um bug real encontrado testando o bloqueio de ponta a ponta** (não
hipotético — apareceu ao chamar `blockUserAction` pela primeira vez fora do
navegador real): `clientIp()`, em `src/lib/safety/actions.ts` **e**
`src/lib/auth/actions.ts` (duas cópias da mesma função, mesmo defeito),
caía para o texto `"desconhecido"` quando a requisição não tinha
`x-forwarded-for`/`x-real-ip`. `audit_logs.ip` é coluna `inet` — só aceita
endereço válido ou `NULL`; aquele texto quebrava o `INSERT` com
`22P02 invalid input syntax for type inet`, ou seja, denunciar, bloquear,
cadastrar ou entrar sem esses cabeçalhos de proxy presentes derrubava a ação
inteira. Corrigido nas duas cópias: `clientIp()` agora devolve `null`
nesse caso (a coluna aceita), e os limites de taxa — que só usam o IP como
parte de uma chave de texto — trocam o `null` por um valor de agrupamento
só ali, não no que vai para o banco.

**Um teste frágil encontrado ligando a mensagem de sistema ao TESTE K**
(não um bug do produto — do próprio teste): `donoId`/`outroId` são
compartilhados de propósito entre os TESTES A a M (simulam uma sessão
contínua). O TESTE M assumia que, depois de abrir a própria conversa, a
contagem de não lidas do cabeçalho ia pra **zero** — só que agora o aceite e
o cancelamento do TESTE K também deixam mensagem de sistema não lida para
essas mesmas identidades, e o TESTE K nunca abre o chat pra lê-las. A
contagem real (1, vindo do TESTE K) estava certa; a asserção é que assumia
um estado global que não existe mais. Corrigido tornando o TESTE M robusto
a isso: em vez de esperar exatamente zero, confere que abrir a conversa
derruba a contagem em exatamente 1 — a dela, não o total absoluto.

---

## Fase 9 e 10 — Painéis financeiros completos ✅ *(código pronto, falta a credencial real da Fase 7)*

As duas fases dependiam originalmente da Fase 7 (credencial Asaas real) por
um motivo que não se sustentou: o painel só precisa de dado que já existe no
**Postgres**, gravado pelo webhook (Fase 5) sempre que um evento chega — seja
do Asaas de verdade ou do dublê local de teste. Não há nada que o painel
precise "esperar" a credencial real para mostrar; a mesma tela que funciona
contra o dublê hoje mostra dinheiro real no dia em que a Fase 7 destravar,
sem precisar mudar uma linha.

| Item | Estado | Observação |
|------|--------|------------|
| Repasses do proprietário (`/meus-espacos/financeiro`) | ✅ | seção nova "Repasses": já pago vs. pendente, histórico por reserva — lê `payouts`, não inventa "pago" sem confirmação de liquidação (`payouts.status` hoje só alcança `pending`, ver PAGAMENTOS.md) |
| Status real de pagamento do locatário (`/reservas`) | ✅ | próxima cobrança, status e valor do último pagamento por reserva — lê `subscriptions`/`payments` de verdade, não só o status da reserva |
| `getOwnerPayoutSummary` | ✅ | soma por status (`settled` vs. `pending`+`scheduled`) — nunca mistura os dois |
| Verificação automatizada (banco) | ✅ | 9 checagens novas — `scripts/verify-payments.ts`, seção 3b (72 no total, era 63) |
| Verificação automatizada (navegador) | ✅ | TESTE L estendido: dispara os webhooks `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` pela **rota HTTP real** (não a função em processo — este script tem um Next real no ar), depois confere que `/reservas` e `/meus-espacos/financeiro` mostram o dado que veio do gateway; 9 checagens novas (172 no total) |

**Um problema real de isolamento de teste, encontrado ligando o webhook ao
TESTE L**: uma vez que uma reserva gera lançamento no razão
(`ledger_entries`, append-only de verdade), o espaço fica ancorado por FK
`RESTRICT` — permanentemente, como aconteceria em produção com dinheiro de
verdade movimentado. Isso já era um custo aceito em `scripts/verify-payments.ts`,
mas ali o espaço de teste é isolado; em `verify-integracoes.ts` o TESTE L
reusava `publicado`, a MESMA coordenada que TESTE B (lista todo anúncio
publicado, sem filtro nenhum) e TESTE E/F (raio) contam com exatidão.
Cada execução futura deixaria mais um anúncio idêntico ali, inflando essas
contagens sem limite — pego rodando a suíte duas vezes seguidas, não em
teoria. Corrigido em duas partes: (1) o espaço do TESTE L agora nasce numa
coordenada isolada, criado só dentro do próprio teste (não na semente do
início, que vale para A–M inteiros) e (2) é **arquivado** (não apagado —
o lançamento no razão não deixaria mesmo) assim que o pagamento é
confirmado, saindo da vitrine pública imediatamente. A sobra permanente
final é só uma linha invisível para qualquer busca: o histórico financeiro
real continua existindo, só não aparece mais pra ninguém.

---

## Fase 11 — Painel administrativo ✅

Painel em `/admin`, exclusivo de `profiles.role = 'admin'` — `requireAdmin()`
responde 404 (não 403) para qualquer outra conta, de propósito: quem não é
admin não deve nem descobrir que a rota existe.

| Item | Estado | Observação |
|------|--------|------------|
| Fila de moderação (`/admin/denuncias`) | ✅ | denúncias `open`/`reviewing`, mais graves primeiro — mesma ordem do índice `reports_queue_idx`; mostra o alvo resolvido (anúncio, usuário ou prévia da mensagem) e o histórico de reincidência |
| Resolver denúncia | ✅ | procedente/improcedente + nota — `reports.resolved_by`/`resolved_at` gravados; resolver a mesma denúncia duas vezes é recusado |
| Contagem de reincidência | ✅ trigger | já existia (Fase de segurança interna); sem mudança |
| **Suspensão automática** | ✅ trigger | `refresh_upheld_report_count` (migração `0011_suspensao_automatica.sql`) agora também aplica `safety.auto_suspend_upheld_threshold` (5): ao atingir o limite, `profiles.status` vira `suspended` com motivo padrão. **Só escala** — se um admin corrigir uma denúncia (`upheld → false`) e o contador cair, a suspensão já aplicada não reverte sozinha; reativar é sempre uma decisão manual no painel |
| Gestão manual de conta (`/admin/usuarios`) | ✅ | busca por nome, ativar/suspender/banir com motivo obrigatório (exceto ao reativar); admin não pode alterar a própria conta |
| Verificação automatizada (banco) | ✅ | 3 checagens novas em `scripts/verify-schema.ts` (seção 9): reincidência sobe sem suspender antes do limite, suspende ao atingir, e não reverte sozinha após correção (32 no total, era 29) |
| Verificação automatizada (ações) | ✅ | `scripts/verify-admin.ts`, novo — 52 checagens: fila com os 3 tipos de alvo e ordenação por gravidade, autorização (usuário comum é bloqueado), resolver denúncia, **suspensão automática disparada pela ação real** (não só o trigger cru), gestão manual de status, busca de contas |
| Verificação automatizada (navegador) | ✅ | TESTE N, novo — 12 checagens em Chromium real: 404 pra quem não é admin, fila com os 3 tipos de alvo ordenada por gravidade, resolver as duas primeiras pela interface (uma como procedente, outra como improcedente), fila cai e mostra a mensagem ainda aberta com o conteúdo denunciado, busca no painel de usuários já com a reincidência refletida, suspensão manual pela interface |

**Bug real encontrado pelo TESTE N**: `resolveReportAction` chamava
`revalidatePath('/admin/denuncias')` depois de resolver. Como a fila só lista
`open`/`reviewing`, isso disparava um refresh automático da lista assim que a
Server Action terminava — o item resolvido sumia da tela **antes** do admin
ver a confirmação "Denúncia marcada como procedente.", porque o componente
que mostrava essa mensagem morria junto com o `<li>` removido. Diferente do
`RespondRequestActions` (que não tem esse problema: a reserva aceita continua
na lista, só muda de grupo), aqui o item é mesmo removido da consulta.
Corrigido removendo o `revalidatePath` dali — a página já é `force-dynamic`,
então a próxima navegação de verdade mostra a fila atualizada sem precisar
de um refresh automático que atropela a própria confirmação.

O painel **não** lista todas as contas de uma vez (`searchAccounts('')` devolve
vazio) — de propósito, para não virar uma segunda superfície de vazamento de
dado pessoal além do necessário.

---

## Fase 12 — Preparação para produção ✅ *(código pronto, falta a conta real dos dois serviços)*

| Item | Estado | Observação |
|------|--------|------------|
| Rate limiting compartilhado (Upstash) | ✅ | `src/lib/rate-limit.ts` usa o Redis do Upstash (contador via REST, `INCR`+`EXPIRE NX`+`TTL`) quando configurado; cai sozinho para o `Map` em memória sem as credenciais — nunca finge ter proteção compartilhada que não tem |
| Fallback resiliente | ✅ | Se o Upstash falhar no meio de uma requisição (rede, erro do serviço), a ação protegida (login, denúncia, etc.) continua funcionando via limitador local, em vez de quebrar por causa de uma camada extra de proteção |
| Monitoramento de erro (Sentry) | ✅ | `src/instrumentation.ts` + `src/instrumentation-client.ts` + `sentry.server.config.ts`/`sentry.edge.config.ts`, `next.config.ts` envolvido com `withSentryConfig` — sem `NEXT_PUBLIC_SENTRY_DSN` o próprio SDK não envia nada (não é um `try/catch` escondendo a ausência) |
| Checklist de prontidão executável | ✅ | `pnpm check:producao`, novo — lê o `.env.local` real e confere integrações configuradas, `NEXT_PUBLIC_SITE_URL`/`DATABASE_URL` fora de localhost, e se existe ao menos um administrador no banco; o que exige julgamento humano (documento jurídico, plano pago, backup testado) aparece como lembrete, não como aprovado |
| Verificação automatizada | ✅ | `scripts/verify-rate-limit.ts`, novo — 14 checagens contra um dublê do contrato REST do Upstash (`scripts/testbed/server.ts` ganhou `POST /pipeline`): prova que o contador é **compartilhado de verdade** manipulando o "Redis" por fora e confirmando que a chamada seguinte enxerga a mudança — um `Map` em memória jamais veria isso |

**Por que provar "compartilhado" e não só "chama a API certa"**: o risco real do
limitador em memória não é ele "não funcionar" — é ele *parecer* funcionar em
todo teste local (onde só existe uma instância) e falhar exatamente em
produção, onde existem várias. O teste manipula o estado do "Redis" fora do
processo do limitador e confirma que a chamada seguinte reage a isso —
provando que a fonte da verdade é externa, o mesmo formato de corrida que uma
segunda instância serverless causaria.

O e-mail, o pagamento e o mapa já seguiam esse padrão (dublê do contrato REST
real); a diferença aqui é que rate limiting é sobre **estado compartilhado**,
não só sobre "chegou a resposta certa" — por isso o teste precisa provar
compartilhamento, não só sucesso de uma chamada isolada.

---

## Revisão visual manual ✅ *(pendência antiga da "Parte 4")*

Além dos 656 testes automatizados, uma passada olhando de verdade cada tela
— desktop e mobile, deslogado/proprietário/locatário/admin — num app real
rodando (não só o resultado de asserções). Testes automatizados provam que
o dado certo chega e a ação certa acontece; não provam que a tela **parece**
certa num celular real.

**Achado e corrigido**: o botão "Anunciar meu espaço" no cabeçalho de quem
não está logado quebrava em duas linhas e distorcia a altura do cabeçalho em
telas de 390px ou menos (iPhone SE, 12/13 mini) — um aparelho bem comum. Isso
nunca apareceu em `pnpm verify:integracoes` porque o viewport mobile dos
testes é 430px, largura suficiente por pouco. Corrigido com um rótulo curto
("Anunciar") abaixo do breakpoint `sm`, texto completo a partir do desktop —
testado em 320/390/430px depois do ajuste. `pnpm verify:integracoes` (184
checagens) continua passando.

Nenhum outro problema visual encontrado nas telas cobertas: home, busca,
detalhe do anúncio, cadastro, login, proteção, meus espaços, solicitações,
financeiro, mensagens, reservas, favoritos e o painel administrativo.

---

## Auditoria de segurança adversarial ✅ *(24/09/2026)*

Pedido explícito: simular uma chave de recebimento real e tentar de
propósito burlar o pagamento, cometer fraude, e acessar dado de outro
usuário por ataque comum ou avançado. Relatório completo, com o que foi
tentado e o que foi corrigido, em
[ARQUITETURA.md §9](./ARQUITETURA.md#9-auditoria-de-segurança-adversarial-24092026).

**Resumo:** nenhuma fraude de pagamento, adulteração de preço ou acesso a
dado de outro usuário se provou possível nos caminhos testados — testado
por execução real (Postgres e Chromium reais, suíte de 656 checagens
rodada do zero, não só lida), não só por leitura de código. Quatro lacunas
reais foram encontradas e corrigidas:

- Token do webhook do Asaas comparado com `!==` (timing attack) → agora
  `crypto.timingSafeEqual`.
- Nenhum cabeçalho de segurança HTTP (CSP, `X-Frame-Options`, HSTS, etc.) →
  adicionados em `next.config.ts`, validados contra os 184 testes de
  navegador real.
- `/api/cep/[cep]` com limitador próprio isolado por instância → passou a
  usar o limitador compartilhado (Upstash) do resto do app.
- `supabase/setup.sql` estava **desatualizado, faltando 2 migrações**
  (inclusive a suspensão automática de conta da Fase 11) — quem seguisse o
  guia para montar ou atualizar um Supabase real receberia um banco
  incompleto, silenciosamente. Regenerado e validado contra Postgres limpo.

Um achado ficou **sem correção de código, por decisão consciente**: a
promessa de que o locatário vê o endereço completo depois que a reserva
fica ativa nunca foi implementada — `safety.reveal_address_on_status`
existe no banco mas ninguém lê essa chave. Não é falha de segurança (o
dado nunca vaza, para ninguém — o efeito é a promessa não ser cumprida, não
o oposto), mas é uma lacuna de produto que fica para você decidir: construir
o reveal de verdade, ou ajustar o texto da interface para não prometer o
que não existe.

---

## Fase 13 — Destaques, Turbo e Premium (Parte 5) ✅ *(24/09/2026)*

Sistema de promoção de anúncios (Destaque/Turbo) e o selo de Membro Premium,
a partir do pedido detalhado do usuário. Aumenta exposição — nunca altera
preço, localização, disponibilidade ou avaliação de um anúncio.

### Schema e motor de benefícios

| Item | Estado | Observação |
|------|--------|------------|
| Tabela `promotions` | ✅ | estado real (`scheduled`/`active`/`expired`/`cancelled`) — **nunca** um booleano `is_featured` |
| Tabela `premium_memberships` | ✅ | status, origem, quem concedeu, quando |
| Nenhum Destaque/Turbo sobreposto no mesmo espaço | ✅ | índice único parcial `promotions_one_active_per_space`, mesmo padrão de `bookings_one_active_per_space` |
| Concorrência real | ✅ | **testado com corrida real (`Promise.all`)**: cota mensal travada por `SELECT ... FOR UPDATE`, duplo-clique no mesmo espaço coberto pelo índice único — exatamente uma ativação vence nos dois casos |
| Expiração preguiçosa | ✅ | sem worker/cron — varredura no início das consultas que precisam de dado fresco, mesmo padrão de `expireStaleBookingRequests` |
| Duração e cota mensal | ⚙️ | **placeholder** em `platform_settings` (7 dias Destaque / 48h Turbo, 2+1 por mês) — o usuário confirmou que já tem o modelo de números real e vai enviar depois; trocar é um `UPDATE`, sem deploy |

### Fluxo "Destacar anúncio" e identidade visual

| Item | Estado | Observação |
|------|--------|------------|
| Dialog em "Meus espaços" | ✅ | escolhe Destaque ou Turbo, mostra o saldo **real** do mês, consome de verdade, atualiza a tela na hora |
| Selo Destaque/Turbo | ✅ | discreto — mesma cor de marca nos dois, só o peso visual muda (contorno vs. preenchido); sem neon, gradiente ou animação chamativa |
| Cancelar | ✅ | não devolve o benefício do mês (dito na tela) |

### Home e busca

| Item | Estado | Observação |
|------|--------|------------|
| "Espaços em destaque" na home | ✅ | só existe quando há promoção ativa de verdade — **nenhuma seção vazia ou anúncio fictício** |
| Ordenação da home | ✅ | Turbo > Destaque > anúncio comum, exatamente como pedido |
| Busca: promoção nunca destrói relevância | ✅ | ordem é tipo → localização → disponibilidade → filtros → promoção; promoção é **critério de desempate**, nunca substitui os anteriores (o exemplo do pedido — vaga em Colatina não perder para um galpão longe só por ter Turbo — é garantido pela query, não por sorte) |

### Selo Premium e página `/premium`

| Item | Estado | Observação |
|------|--------|------------|
| "✦ Membro Premium" | ✅ | perfil do dono e anúncios dele — estrela verde de quatro pontas (`Sparkle`) |
| Clique abre painel com benefícios + "Torne-se membro" | ✅ | funciona como descoberta orgânica do Premium, como pedido |
| `/premium` | ✅ | consumo real do mês para quem é Premium ("1 de 2 utilizados"); para quem não é, diz com honestidade que a assinatura ainda não existe, sem fingir um botão de assinar |

### Favoritos e compartilhamento

| Item | Estado | Observação |
|------|--------|------------|
| Preço salvo no momento de favoritar | ✅ | nova coluna `favorites.price_cents_at_favorite` — aviso "o preço mudou" com o valor real de antes |
| Disponíveis/Indisponíveis separados | ✅ | com o motivo (pausado, alugado, etc.) |
| Compartilhamento e metadados de link | ✅ | já existiam da Fase 3/4 — confirmados intactos, sem mudança necessária |

### Como virar Premium hoje — mecanismo interino

O pedido foi explícito: a assinatura paga é uma etapa futura, ainda a
decidir. Até lá, o único caminho para o selo Premium é a concessão manual
pelo admin em `/admin/usuarios` — mesmo padrão já usado para suspender
conta, auditado, reversível. **Isso foi uma decisão minha, comunicada antes
de implementar** (não pedida explicitamente) para o sistema de benefícios
não ficar bloqueado esperando a etapa de pagamento.

| Item | Estado | Observação |
|------|--------|------------|
| Concessão/revogação de Premium pelo admin | ✅ | `/admin/usuarios`, idempotente, auditado, admin não concede a si mesmo |
| Assinatura paga real | ⬜ | decisão de negócio e modelo de preço ainda não enviados pelo usuário |
| Compra avulsa de Destaque/Turbo | ⬜ | preço ainda não decidido — schema já pronto (`transaction_id`, `source: 'purchase'`) para quando existir, mas **nenhuma loja foi construída agora**, por pedido explícito de não complicar esta etapa |

### Segurança

| Item | Estado | Observação |
|------|--------|------------|
| Autorização | ✅ | `getOwnedSpace` — só o dono promove o próprio anúncio, testado |
| Servidor nunca confia no navegador | ✅ | preço, tipo de promoção, quantidade de crédito e status são sempre recalculados no servidor |
| Ações sensíveis auditadas | ✅ | ativar/cancelar promoção e conceder/revogar Premium gravam em `audit_logs` |

### Verificação automatizada

| Item | Estado | Observação |
|------|--------|------------|
| Banco (`scripts/verify-promotions.ts`, novo) | ✅ | 40 checagens — ativação, autorização, cota mensal, Turbo, sobreposição, cancelamento, concorrência real, vitrine, expiração (520 no total em `pnpm verify`, era 472) |
| Admin (`scripts/verify-admin.ts`, seção nova) | ✅ | +8 checagens — conceder/revogar Premium pela ação real |
| Navegador (TESTE O, novo) | ✅ | 21 checagens em Chromium real — ativar e cancelar pela tela, selo na home/busca/Meus espaços, consumo real em `/premium`, selo Premium visto por outra pessoa, favoritos com preço/status reais, admin concedendo e revogando pela interface de verdade (205 no total em `pnpm verify:integracoes`, era 184) |

**Três bugs reais encontrados escrevendo o TESTE O** (pegos pelo Chromium
real travando em `waitFor`, não hipotéticos — o app nunca tinha sido
visitado por um navegador de verdade antes deste teste):

1. **A confirmação "Destaque ativado com sucesso." nunca aparecia**, e
   reabrir o dialog depois de promover mostrava a mensagem de sucesso
   **para sempre**, mesmo em aberturas futuras sem relação com aquela
   ativação. Causa: `revalidatePath` entrega a promoção recém-criada
   (`activePromotion`) na **mesma renderização** em que `useActionState`
   entrega `{ok:true}` — e o componente checava `activePromotion` primeiro,
   pulando direto para o painel "já ativo" sem nunca mostrar a confirmação;
   como `useActionState` não tem um jeito de "resetar", o valor antigo
   ficava colado em qualquer abertura futura do mesmo dialog. Corrigido
   extraindo o corpo do dialog num componente próprio, remontado
   (`key`) a cada abertura, com a confirmação de sucesso checada **antes**
   de `activePromotion` — mesma causa afetava o cancelamento
   ("Destaque cancelado."), corrigida junto.
2. **`RangeError: Invalid time value`, 500 real em `/premium`** para quem
   é Premium. `db.execute()` (consulta crua para o período do mês) devolve
   o valor do driver como **string**, não como `Date` — o genérico
   `db.execute<{periodEnd: Date}>()` é só um cast de TypeScript, não
   converte nada em tempo de execução. `Intl.DateTimeFormat.format()`
   recebendo essa string quebrava. Corrigido com `new Date(...)` explícito
   no retorno de `getMonthlyBenefitUsage`.
3. **Erro de hidratação do React (#418)** ao abrir o selo Premium na página
   do anúncio. `PremiumBadge` renderiza um `<dialog>` (não é "phrasing
   content"), e o único lugar que o usa colocava o componente dentro de um
   `<p>` — HTML inválido; o parser do navegador fecha o `<p>` mais cedo,
   dando uma árvore diferente da que o React esperava. Corrigido trocando
   o `<p>` por `<div>` em `espacos/[slug]/page.tsx`.

Dois problemas menores, também reais, encontrados na mesma revisão:
`<Link>` envolvendo um `<Button>` (aninhamento de conteúdo interativo
inválido em HTML) em dois lugares novos — corrigido usando `buttonVariants`
direto no `<Link>`, o mesmo padrão já usado em `/reservas` e na página do
anúncio; e `donoPromoId` (identidade nova do TESTE O) não estava incluído
na limpeza ao final do teste, o que acumularia espaços e contas órfãs a
cada execução — corrigido.

### O que ficou fora desta etapa, por pedido explícito

- Compra avulsa de Destaque/Turbo (preço ainda não decidido) — ver acima.
- Loja/checkout de créditos — pedido explícito de não construir agora (§4).
- Valorização, pontuação, previsão de preço, inteligência imobiliária,
  dados de prefeitura, anúncios de terceiros — não implementado, por pedido
  explícito (§22 do texto original).

### O que ficou fora desta etapa, honestamente (não pedido para ficar de fora)

- A passada de refinamento visual pedida para **o app inteiro** (§16) não
  foi feita — só as telas novas de Destaque/Premium seguem a linguagem
  visual discreta pedida; as telas pré-existentes não foram revisadas de
  novo nesta etapa.
- Primeira visita (§15) e microinterações mais amplas (§17) foram
  endereçadas só de forma incidental, dentro das telas novas — não como
  passada dedicada no restante do app.
- Auditoria sistemática de todos os estados de interface (§18: pausado,
  esgotado, etc. em toda tela) não foi feita como checklist formal — os
  estados relevantes às telas novas foram tratados e testados.

---

## Fase 14 — Compra avulsa de Destaque/Turbo, elegibilidade e área de gerenciamento ✅ *(24/09/2026)*

Continuação direta da Fase 13. O pedido original usava o nome "Premora" —
**ignorado por instrução explícita do próprio usuário**, é sobre o mesmo
MyPlace. Confirmado também por pergunta direta antes de implementar: o
benefício mensal grátis do Premium (Fase 13) e a compra avulsa **coexistem**
— ser Premium não desconta do preço fixo nem impede comprar, e comprar não
consome o benefício grátis do mês.

### Compra avulsa — preço fixo, cobrança real no Asaas

| Item | Estado | Observação |
|------|--------|------------|
| Preços | ✅ | **exatamente os valores pedidos**, sem arredondar nem inventar — Destaque: 1 dia R$12,90, 3 dias R$19,90, 5 dias R$24,90; Turbo: 1h R$9,90, 5h R$15,90, 12h R$19,90, 24h R$27,90. Vivem em `src/lib/promotions/purchase-pricing.ts` como catálogo fixo (não em `platform_settings`, diferente da Fase 13 — o usuário disse que estes são valores decididos, não placeholder) |
| Preço nunca vem do navegador | ✅ | a action recebe só `(tipo, duração)`; o preço é sempre a busca exata contra o catálogo fixo, nunca um número recebido do formulário |
| Cobrança real no Asaas | ✅ | `POST /v3/payments` (cobrança única, sem split — 100% da plataforma), reaproveitando o mesmo cliente Asaas usado para reserva quando já existe |
| Tabela `promotion_purchases` | ✅ | própria (não é `payments`, que tem `booking_id NOT NULL` e regras de payout que não se aplicam aqui) — registra tipo, duração, preço, status do pagamento, e só ganha `promotion_id` quando o webhook confirma |
| Webhook — confirmação cria a promoção | ✅ | `PAYMENT_CONFIRMED`/`RECEIVED` criam a linha em `promotions` (`source: 'purchase'`) só agora, nunca no momento da compra; `OVERDUE`/`REPROVED_BY_RISK_ANALYSIS`/`REFUNDED`/`DELETED` tratados |
| Concorrência: duas compras pendentes pro mesmo espaço | ✅ | **testado de verdade** — se a primeira confirmação já ativou a promoção, a segunda confirmação **não perde o dinheiro nem quebra o webhook** (fica `confirmed` com `promotion_id` nulo e motivo registrado, sinalizado para reembolso manual) |
| Compra exige anúncio publicado | ✅ | rascunho recusado antes de qualquer cobrança |

**Um bug real de concorrência encontrado e corrigido durante o próprio
teste que escrevi para essa parte**: a segunda confirmação de webhook, ao
tentar criar uma promoção que colidia com a já ativa, fazia o `INSERT`
falhar — e como o `catch` tentava gravar a recuperação **na mesma
transação já abortada pelo Postgres**, a gravação de recuperação também
falhava (`current transaction is aborted`). Corrigido isolando o `INSERT`
arriscado numa transação aninhada (`tx.transaction()`, um SAVEPOINT de
verdade via Drizzle) — se ela falhar, só aquele savepoint desfaz, a
transação externa continua utilizável para gravar o estado correto.

### Elegibilidade — Destaque/Turbo não furam a relevância de uma busca real

| Item | Estado | Observação |
|------|--------|------------|
| Regra pedida | ✅ | Destaque só entra na ordenação com **4+ características compatíveis**; Turbo precisa da **mesma cidade + 2+ características** |
| Sem busca ativa | ✅ | navegação livre (sem filtro nenhum) não tem o que medir — a promoção vale sem porta nenhuma, comportamento de antes preservado |
| Testado com os dois lados da fronteira | ✅ | um Destaque com 3 características **não** fura a ordem por recência (perde pro anúncio mais novo); com 4, fura — mesmo par de anúncios, só muda o filtro de busca |

**Substituição de domínio, decisão minha, não pedida**: o exemplo do pedido
original lista características residenciais (quartos, vagas de garagem,
casa/apartamento, estado de conservação) que **não existem neste
marketplace** — aqui os espaços são garagem, depósito, galpão, sala, não
imóvel residencial. Substituí por dimensões reais do schema: tipo, cidade,
bairro, faixa de preço, disponibilidade imediata e características
(`space_features`) — cada uma soma 1 ponto só quando a busca **especificou**
aquele critério e o espaço bate com ele.

**Limite aceito, não resolvido**: a regra "mesma cidade" do Turbo só é
verificada quando a busca tem uma cidade resolvida como filtro de fato
(`cityFilter`) — uma busca só por GPS/raio (sem cidade) não passa por essa
checagem específica. Documentado no código, não escondido.

### "Recomendados para você" — nova seção em `/espacos`

| Item | Estado | Observação |
|------|--------|------------|
| Seção separada, ordenada só por compatibilidade | ✅ | ignora Destaque/Turbo de propósito — o selo pode aparecer no card, mas não decide a posição **nesta seção** |
| Exemplo do pedido garantido pela query, não por sorte | ✅ | um anúncio com mais características compatíveis aparece antes de um menos compatível, mesmo que o segundo tenha comprado Destaque ou Turbo |
| Não duplica a lista principal | ✅ *(corrigido nesta etapa)* | ver bug #1 abaixo |

### Etapa opcional "Turbine seu anúncio" antes de publicar

| Item | Estado | Observação |
|------|--------|------------|
| Nova etapa em `/anunciar/[id]/promover` | ✅ | aparece **uma única vez**, logo após a primeira publicação — salvar uma edição depois (anúncio já publicado) vai direto para a confirmação, sem repetir a oferta |
| Texto pedido | ✅ | "Aumente suas chances de encontrar um interessado, destaque seu imóvel e dê mais visibilidade ao anúncio na MyPlace." |
| Destaque e Turbo lado a lado, com "Não quero promover" | ✅ | reaproveita os mesmos componentes do dialog "Destacar" (benefício grátis quando sobra, ou compra avulsa) — publicar continua incondicional, `publishSpaceAction` não mudou nenhuma validação, só o destino do redirect |

### Área de gerenciamento — `/meus-espacos/promocoes`

| Item | Estado | Observação |
|------|--------|------------|
| Nova aba "Promoções" no painel do proprietário | ✅ | ativas agora (com tempo restante), e histórico completo |
| Cada linha mostra | ✅ | modalidade, período contratado, valor pago (ou "Grátis" pro benefício Premium), início e término com data **e hora**, origem (benefício ou compra avulsa) e status |
| Atualiza sozinha quando o período termina | ✅ | mesma varredura preguiçosa de sempre, sem worker novo |

### Três bugs reais encontrados no navegador de verdade (Chromium, não hipotéticos)

Igual à Fase 13, o app nunca tinha sido visitado por um navegador de
verdade nesta superfície nova antes deste teste (TESTE P) — os três abaixo
só apareceram porque o teste realmente clicou, esperou e conferiu o
resultado.

1. **"Recomendados para você" duplicava o único resultado de uma busca já
   estreita** — com poucos filtros (ex.: preço máximo), a seção mostrava o
   **mesmo card** que já aparecia na lista principal, uma segunda vez, sem
   acrescentar nada. Corrigido comparando os ids: a seção só aparece quando
   traz um anúncio que a lista principal (nesta página) ainda não mostra.
2. **A confirmação "Promoção ativada" nunca aparecia ao usar o benefício
   grátis na própria etapa `/promover`** — a página redirecionava sozinha
   para a confirmação de publicação **antes** da pessoa ver que a promoção
   tinha sido ativada. Causa: um `redirect()` no Server Component da página
   checava "já existe uma promoção vigente?" para cobrir quem reentra na
   URL manualmente — mas a própria ativação feita ali reatualiza a árvore de
   Server Components ao terminar, disparando esse mesmo `redirect()` como
   efeito colateral da própria ação. Corrigido: a página não redireciona
   mais sozinha; passa o estado para o componente cliente, que decide o que
   mostrar (a confirmação da própria ação sempre vem primeiro).
3. **Busca por nome no admin (`/admin/usuarios`) podia não encontrar uma
   conta recente** — a consulta usa `LIMIT 20` sem nenhum `ORDER BY`; com
   20+ contas cujo nome bate com o termo buscado (o que aconteceu de
   verdade neste ambiente de teste, por sobra de execuções anteriores), a
   ordem devolvida pelo Postgres é arbitrária, e uma conta específica podia
   nem aparecer, sem nenhum aviso de que o resultado foi cortado. Não é uma
   regressão desta fase — o bug já existia, só nunca tinha sido alcançado
   por um teste real antes. Corrigido com `ORDER BY created_at DESC`
   (a conta mais recente sempre aparece primeiro).

### Verificação automatizada

| Item | Estado | Observação |
|------|--------|------------|
| Banco (`scripts/verify-promotions.ts`) | ✅ | +39 checagens novas (compra avulsa, concorrência, elegibilidade, histórico com valor pago) — 79 no total do arquivo (**559 no total em `pnpm verify`**, era 520) |
| Navegador (TESTE P, novo) | ✅ | 19 checagens em Chromium real — publicar pela tela de verdade indo para "Turbine seu anúncio", pular a oferta, salvar edição não repete a etapa, benefício grátis ativado na própria etapa, compra avulsa com pagamento e webhook **reais** (rota HTTP, não só a função em processo), área de gerenciamento mostrando o valor pago de verdade (**224 no total em `pnpm verify:integracoes`**, era 205) |

### O que ficou fora desta etapa, por pedido explícito

- Assinatura mensal paga do Premium em si — o usuário disse explicitamente
  que isso "vamos resolver depois". O que já existe (benefício grátis via
  concessão manual do admin) continua funcionando exatamente como na Fase 13.
- Preços diferentes dos definidos nesta etapa — não foi feito, por pedido.

---

## Fase 15 — Funcionalidades essenciais que faltavam + organização do layout ✅ *(25/09/2026)*

Pedido aberto, por voz: acrescentar o que um marketplace desse tipo
costuma ter e o MyPlace ainda não tinha, e organizar o layout — sem mexer
em paleta de cores, que o usuário disse que ainda vai decidir mais pra
frente. Não veio uma lista pronta; a lista saiu de auditar o próprio
projeto, não de supor. Cinco lacunas concretas, cada uma confirmada no
código antes de virar tarefa:

1. O rodapé linkava para 5 páginas que **não existiam** (404 real):
   Como funciona, Taxas, Termos, Privacidade, Suporte.
2. A tabela `reviews` — com trigger de validação, unicidade e recálculo
   de nota já prontos e já testados desde uma fase anterior — tinha
   **zero** linha de código de aplicação usando ela: nenhuma tela pra
   avaliar, nenhuma pra ver avaliação.
3. A tabela `notifications` é escrita a cada evento importante (nova
   solicitação, pagamento confirmado, mensagem nova…) mas **nunca
   exibida** em lugar nenhum — sem sino, sem página, sem contador.
4. Não existe navegação pensada pro celular: os links principais do
   header somem abaixo de `sm:` e não sobra nenhum jeito de navegar sem
   rolar até o rodapé.
5. `bookings.status = 'ended'` existe no schema, mas **nenhum código
   jamais levava uma reserva até lá** — e `asaas.cancelSubscription()`
   também já existia, pronta, sem nenhum lugar que a chamasse.

### 15.1 — Páginas institucionais

| Página | Estado | Observação |
|--------|--------|------------|
| `/como-funciona` | ✅ | passo a passo dos dois lados (quem procura / quem anuncia) |
| `/taxas` | ✅ | os 3%+3% e o mínimo de R$ 35 lidos de `platform_settings` de verdade; o exemplo numérico usa uma constante marcada no código como ilustrativa — não é outro valor real escondido |
| `/termos` | ✅ | com aviso explícito de que não é contrato revisado por advogado (mesma ressalva da Riscos §8, que continua valendo) |
| `/privacidade` | ✅ | idem — e sem prometer uma tela de editar/apagar dado que não existe (ver autocorreção abaixo) |
| `/suporte` | ✅ | FAQ + atalho para Mensagens e para Denunciar; **não inventa** e-mail nem formulário de contato que não existe |

**Autocorreção antes de publicar**: o primeiro rascunho de `/privacidade`
ia dizer que dava pra editar ou apagar os próprios dados pela tela "Minha
conta". Conferi o código antes de subir — essa ação não existe — e
reescrevi pra dizer a verdade: hoje isso é feito manualmente, por pedido
via Suporte.

### 15.2 — Central de notificações

| Item | Estado | Observação |
|------|--------|------------|
| Sino no header, com contador | ✅ | desktop e mobile, ao lado do ícone de mensagens que já existia |
| `/notificacoes` | ✅ | lista as últimas 30; abrir uma marca como lida e leva pro link do evento; também dá pra marcar todas de uma vez |
| Fonte real, sem dado novo | ✅ | lê a tabela `notifications`, já escrita desde fases anteriores a cada solicitação, aceite, pagamento e mensagem — só faltava a tela |

### 15.3 — Navegação inferior no celular

| Item | Estado | Observação |
|------|--------|------------|
| Barra fixa, 5 itens | ✅ | Início, Buscar, Meus espaços/Anunciar (conforme o papel de quem está logado), Reservas, Conta — só aparece pra quem está logado e não é admin |
| Não sobrepõe o rodapé | ✅ | `padding-bottom` condicional via `:has([data-mobile-bottom-nav])`, só nas páginas onde a barra realmente está presente |
| Fora do assistente de publicação | ✅ | `/anunciar/[id]/*` mantém só a sua própria barra fixa de ações — as duas juntas colidiriam na mesma tela |

### 15.4 — "Encerrar aluguel"

Sem essa ação, uma reserva `active` nunca vira `ended` — e sem `ended`,
**avaliação não tinha como existir** (é exatamente o que o trigger
`validate_review` exige). Isso trouxe pra dentro desta etapa uma ação que
já devia existir por conta própria, não só como pré-requisito de
Avaliações.

| Item | Estado | Observação |
|------|--------|------------|
| Botão "Encerrar aluguel" | ✅ | em `/reservas`, visível pro locatário e pelo proprietário, confirmação em duas etapas |
| Cancela a cobrança de verdade | ✅ | `asaas.cancelSubscription()` chamado **antes** de qualquer escrita no banco — se o gateway falhar, nada muda no banco e a cobrança mensal continua, nunca o contrário (nunca marca "encerrado" e deixa a pessoa sendo cobrada por engano) |
| 404 do gateway (assinatura já cancelada lá) | ✅ | tratado como sucesso silencioso — incerteza documentada no código, não escondida |
| Auditoria + aviso pro outro lado | ✅ | grava em `audit_logs` e cria notificação |

### 15.5 — Avaliações (reviews)

A infraestrutura — tabela, trigger `validate_review` (só depois de
`ended`, só quem participou da reserva, `space_id`/`target_user_id`
batendo com ela), a chave única por reserva+tipo+autor, e o trigger que
recalcula `rating_avg`/`rating_count` do anúncio — já existia e já estava
testada em `verify-schema.ts` (seção 5, 6 checagens, sem nenhuma mudança
nesta etapa). O que faltava era tudo que efetivamente usa isso.

| Item | Estado | Observação |
|------|--------|------------|
| Formulário de avaliação | ✅ | 1–5 estrelas + comentário opcional, em `/reservas` (avalia o espaço) e `/meus-espacos/solicitacoes` (avalia o locatário) — só aparece quando a reserva está `ended` e quem está vendo ainda não avaliou |
| Nota no card de busca e na página do espaço | ✅ | só quando `rating_count > 0` — nunca mostra "0 estrelas" fingindo ser avaliação real |
| Lista de avaliações na página do espaço | ✅ | nome de quem avaliou, nota, data, comentário |
| Selo de confiança "X de 5 em Y avaliações" | ✅ *(ativado agora, não construído agora)* | `computeTrustProfile`/`TrustBadges` já liam `ratingAvg`/`ratingCount` desde uma fase anterior — só nunca tinham dado real pra mostrar. Passa a aparecer sozinho, sem nenhuma mudança nesses componentes |
| Autorização de quem pode avaliar o quê | ✅ | checada na action (pra dar mensagem amigável) **e** garantida de verdade pelo trigger |

**O que ficou fora desta etapa, por escopo — não por esquecimento:**
- Moderação de avaliação: o detector de dado de contato (da Segurança
  interna) não roda em cima do comentário da avaliação, e as colunas
  `hidden_at`/`hidden_reason` — que já existem no schema — não têm tela
  de admin nem fluxo de denúncia ligados a elas ainda.
- A avaliação do proprietário sobre o locatário (`owner_to_renter`) é
  gravada, contada certinho e coexiste com a do espaço, mas **não existe
  nenhum perfil público de locatário** nesta plataforma hoje — não há
  pra onde mostrar essa nota publicamente ainda.
- A notificação do encerramento reaproveita o tipo `booking_cancelled`
  em vez de um `booking_ended` dedicado, pra não precisar de mais uma
  migração só por isso — o texto mostrado já diz "encerrado", não
  "cancelado", então quem lê não é enganado.

### Ajuste de layout encontrado numa revisão visual de verdade

Rodei o app compilado em modo produção contra o Postgres local, abri um
Chromium de verdade e tirei capturas das telas novas e de duas telas
antigas, pra comparar — o objetivo era achar problema estrutural, não só
"parece bonito". Achei um: na home, a faixa "Perto de verdade / Endereço
protegido / Pagamento pela plataforma" era só texto solto, sem nenhum
agrupamento visual — a única seção da página sem cartão nem fundo, entre
duas outras que têm (os passos numerados, e "Antes de fechar" logo
abaixo). Corrigido com o mesmo cartão (`rounded-[var(--radius-card)]
border`) que a própria página já usa três seções adiante — nenhuma cor
nova, só estrutura repetida.

O resto (sino, barra inferior, páginas institucionais, avaliação,
notificações) renderizou como esperado nas 8 capturas, celular e desktop.

**O que essa revisão NÃO é**: uma seção nova em `pnpm verify:integracoes`.
As telas novas desta fase não ganharam teste automatizado de interface —
foi uma passada manual, única, com um script descartado ao final (nada
repetível ficou para trás). Ver Riscos §7, atualizada.

### Verificação automatizada

| Item | Estado | Observação |
|------|--------|------------|
| Banco (`scripts/verify-payments.ts`, seções 8 e 9, novas) | ✅ | +25 checagens — **encerrar aluguel** (autorização, recusa fora do status certo, cancela a cobrança de verdade no dublê do Asaas antes de tocar no banco, auditoria, notificação, recusa reserva já encerrada — 12 checagens) e **avaliações** (bloqueia antes de `ended`, bloqueia o tipo errado dos dois lados, nota recalculada pela trigger, bloqueia avaliação duplicada, as duas pontas coexistem na mesma reserva — 13 checagens) — **584 no total em `pnpm verify`, era 559** |
| Navegador (`pnpm verify:integracoes`) | ➖ | sem seção nova — **224 checagens, inalterado**; rodada de novo depois de toda mudança desta fase (inclusive o ajuste de layout), sem quebrar nada — mas não cobre as telas novas (ver acima) |
| `scripts/verify-schema.ts` | ✅ | 32 checagens, inalterado — a seção 5 (Avaliações) já testava o trigger antes desta fase existir |
| `pnpm typecheck && pnpm lint && pnpm build` | ✅ | limpos, incluindo todas as rotas novas no build de produção |

---

## Fase 16 — Classificação de padrão do espaço, por IA de visão ✅ *(25/09/2026)*

Pedido veio como um documento inteiro colado na conversa, especificando um
"avaliador de imóvel" com IA — mas escrito pra casa/apartamento (quartos,
banheiros, "imóvel"), que não é o que a MyPlace anuncia. Duas decisões
ficaram explicitamente com o usuário antes de escrever qualquer código,
porque nenhuma das duas era minha pra tomar sozinho:

1. **Adaptar pros espaços reais da MyPlace** (garagem/depósito/galpão/sala/
   vaga/terreno) em vez de tratar como um pedido de imóvel residencial —
   confirmado.
2. **Usar a API da Claude pra analisar as fotos**, com credencial real de
   servidor (mesmo padrão de sempre: falha explícita sem a chave, nunca
   simula resultado) — confirmado.

O resto das dezenas de decisões de tradução do documento pro domínio real
(quais campos viram o quê, o que a IA decide vs. o que fica de fora) ficou
comigo, com a mesma régua usada em todo o projeto: nunca fingir dado que
não existe, sempre preferir dado real já no banco a uma estimativa da IA
quando os dois servem.

**Isto é uma ferramenta do proprietário, não um selo público.** O
resultado só aparece pra quem é dono do espaço — não vira selo na busca
nem na página do anúncio. Uma nota gerada por IA, sem revisão humana,
sendo mostrada a desconhecidos como se fosse fato objetivo é uma promessa
mais forte do que este sistema sustenta hoje.

### 16.1 — Schema

Tabela nova `space_quality_assessments` — cada classificação é um
snapshot completo (não só o resultado final), porque o proprietário pode
reclassificar depois de uma reforma e o histórico anterior continua
explicável sem precisar recalcular nada.

| Item | Estado | Observação |
|------|--------|------------|
| Faixas 0–10 em cada componente e no score final | ✅ | CHECK, testado |
| `base_score` bate com os 4 componentes ponderados | ✅ | CHECK que refaz a conta a partir das colunas já gravadas — mesmo espírito de `bookings_total_matches` |
| `final_score` bate com `base_score × fatores` | ✅ | idem, com `LEAST`/`GREATEST` garantindo o resultado em [0,10] |
| Classificação bate com a faixa do score final | ✅ | `economico`/`medio`/`alto_padrao`/`luxo`, sem gap nem sobreposição |
| Fatores restritos às tabelas fixas do motor | ✅ | conservação/idade/reforma só aceitam os valores do próprio algoritmo — nunca um número solto |

### 16.2 — Integração real com IA (Claude)

| Item | Estado | Observação |
|------|--------|------------|
| `ANTHROPIC_API_KEY` | ✅ | novo em `requireIntegration` (`src/lib/env.ts`), mesmo padrão do Asaas/Upstash/Sentry — [SETUP.md §10](./SETUP.md#10-anthropic-classificação-de-padrão-do-espaço-opcional) |
| Cliente | ✅ | `@anthropic-ai/sdk` oficial (não HTTP cru como o Asaas — aqui existe SDK mantido pelo próprio provedor) |
| Modelo | ✅ | `claude-haiku-4-5` — o mais barato da família com visão; é classificação estruturada, não raciocínio longo, Sonnet/Opus seria custo desproporcional |
| Saída estruturada e validada | ✅ | `client.messages.parse` + schema Zod — a IA nunca devolve texto livre que o código tenta adivinhar |
| Limite de uso | ✅ | 10 classificações por usuário a cada 24h (`rateLimit`, mesmo mecanismo usado em denúncia/cadastro) — cada chamada custa dinheiro de verdade |

### 16.3 — Motor de cálculo (adaptado ao domínio real)

Fórmula do pedido original preservada (`fotos×45% + localização×25% +
estrutura×15% + extras×15%`, depois × fator conservação × fator idade ×
fator reforma) — só os **ingredientes** de cada parte foram traduzidos pra
o que existe de verdade no schema, em vez de inventar campo novo:

| Componente | Fonte real | Observação |
|------------|-----------|------------|
| Fotos (45%) | Análise de IA nas fotos do anúncio | acabamento, "modernidade", sinais de desgaste — nunca "quartos" |
| Localização (25%) | **Outros anúncios publicados, mesmo tipo, mesma cidade** | preço/m² deste anúncio comparado à mediana real dos comparáveis — não existe API de valorização de bairro pra este tipo de espaço, então usei dado real do próprio marketplace em vez de pedir pra IA "chutar" um número sem nenhum lastro |
| Estrutura (15%) | `sizeM2` + `ceilingHeightM` + características de categoria "estrutura" | pé-direito, piso de concreto, iluminação etc. — o que existe pra garagem/depósito/galpão, não quarto/banheiro de casa |
| Extras (15%) | Características de categoria "segurança"/"acesso"/"veículo" | mesmo catálogo já usado no anúncio, normalizado pelo que **de fato se aplica** ao tipo do espaço |

**Bug real encontrado e corrigido durante o próprio teste que escrevi para
esta parte**: a primeira versão arredondava a soma ponderada em ponto
flutuante direto (`a×0,45 + b×0,25 + ...`, depois `×100` e arredondava) —
em ~1,7% de 300 tentativas aleatórias contra o CHECK do banco, um valor
que deveria arredondar exatamente em `X,XX5` caía do lado errado (ex.:
2,385 virava `238.49999999999997` em ponto flutuante, arredondando pra
2,38 em vez de 2,39). Corrigido fazendo a soma inteira em **centésimos**
(mesma ideia de `money.ts` evitar float pra dinheiro) — 1.200 tentativas
seguidas, 0 falhas depois da correção.

### 16.4 — Ação e interface

| Item | Estado | Observação |
|------|--------|------------|
| `/meus-espacos/[id]/classificacao` | ✅ | nova página — formulário (conservação/idade/reforma) + resultado (score, classificação, quebra por componente, texto explicativo, sinais de desgaste, histórico) |
| Atalho "Classificar" | ✅ | em cada anúncio não-rascunho, em Meus espaços |
| Autorização | ✅ | reaproveita `getOwnedSpace` (mesma função usada em todo o resto do painel do proprietário) — dono errado ou anúncio inexistente cai no mesmo 404 |
| Validação IA vs. proprietário | ✅ | diferença de 2+ degraus entre o que o dono informou e o que a IA percebeu nas fotos reduz o fator de conservação usado, com aviso explícito na tela |
| Sem foto = sem classificação | ✅ | mensagem clara, nunca um resultado fabricado sem ter o que analisar |

### O que ficou fora desta etapa, por escopo — não por esquecimento

- **Validação visual de extras** (a IA conferir se as fotos realmente
  mostram cada característica marcada) e **penalização de incoerência
  geral** (padrão alto num bairro simples, e vice-versa) — o pedido
  original especifica os dois; entraram no motor só a comparação de
  conservação (a mais claramente especificada, com exemplo concreto no
  próprio pedido). Documentado no código, não escondido.
- **A chamada real de IA não foi exercitada de ponta a ponta** — este
  ambiente não tem `ANTHROPIC_API_KEY` real. O que FOI verificado: a
  requisição chega certa nos servidores da Anthropic (testada com uma
  chave falsa — erro `401` de autenticação, não um erro de formato de
  requisição), e a falha explícita sem credencial (chave ausente).
  O que falta pra fechar essa lacuna é a mesma coisa de sempre: você
  criar a chave real ([SETUP.md §10](./SETUP.md#10-anthropic-classificação-de-padrão-do-espaço-opcional)).
- **Sem teste de navegador** — a tela nova não ganhou seção em
  `pnpm verify:integracoes` (ver Riscos §7).

### Verificação automatizada

| Item | Estado | Observação |
|------|--------|------------|
| `scripts/verify-schema.ts`, seção 10 (nova) | ✅ | +7 checagens — inserção válida aceita, cada CHECK (base/final/classificação/fator/idade/faixa) testado individualmente rejeitando dado ruim — **39 no total, era 32** |
| Motor de cálculo (`src/lib/quality/scoring.ts`) | ✅ | 1.200 execuções aleatórias inseridas de verdade contra os CHECKs do banco, 0 falhas (achou e corrigiu o bug de arredondamento acima) |
| Integração de IA (`src/lib/quality/vision.ts`) | ✅ | `IntegrationNotConfiguredError` sem chave (testado), requisição real validada contra os servidores da Anthropic com chave falsa (testado) — **chamada com chave real, não testada** |
| `pnpm typecheck && pnpm lint && pnpm build` | ✅ | limpos, rota nova no build de produção |

---

## Fases 7 e 8 — ⬜ não implementadas

| Fase | Escopo | Depende de |
|------|--------|-----------|
| 7 | Pagamento real (Pix, cartão, cobrança recorrente) | **Conta Asaas** — código completo (ver Fase 5), falta só a credencial real testada com internet normal |
| 8 | Repasse real ao proprietário | **KYC aprovado no Asaas** — comportamento durante aprovação ainda não confirmado |

A tela de `/anunciar` (rascunho) existe e **diz explicitamente o que falta**
quando algo não está pronto. Não há dado de exemplo em lugar nenhum que possa
ser confundido com dado real — inclusive os anúncios que aparecem na busca
durante os testes automatizados são criados e apagados a cada execução, nunca
deixados no banco.

---

## Nota sobre o ambiente desta sessão

A política de rede deste container **bloqueia conexões com `*.supabase.co`**.
Consequência prática, e ela é boa:

- O desenvolvimento roda contra um **Postgres local com PostGIS**, que tem
  exatamente o mesmo schema (conferido com `pg_dump` nos dois bancos — a única
  diferença é o schema onde o PostGIS mora).
- O schema chega ao Supabase por um **SQL que você cola no painel**, então
  nenhuma senha ou chave secreta precisa ser transmitida.
- As checagens de banco rodam **nos dois layouts de PostGIS** (`public` e
  `extensions`), o que já pegou um bug real: os scripts de verificação abriam
  conexão sem o `search_path` correto e quebravam como quebrariam em produção.

---

## O que NÃO existe (e não vai aparecer por engano)

- ❌ Nenhum botão de "pagar"
- ❌ Nenhum pagamento simulado ou tela de sucesso sem cobrança
- ❌ Nenhum anúncio de exemplo no banco
- ❌ Nenhuma localização inventada
- ❌ Nenhum chat falso
- ❌ Nenhuma avaliação fabricada
- ❌ Nenhuma denúncia ou bloqueio de exemplo
- ❌ Nenhum anúncio de exemplo no marketplace (ele começa vazio, e diz isso)
- ❌ Nenhuma reserva "aceita" que não esteja de fato gravada no banco — o
  status vem sempre do banco, nunca só do que a tela mostrou depois de clicar

O banco começa vazio, exceto pelas taxas da plataforma e pelo catálogo de 20
características — que são configuração, não conteúdo fictício.

---

## Riscos conhecidos

### ✅ 1. Rate limiting — código pronto para produção, falta a conta Upstash

`src/lib/rate-limit.ts` usa um contador **compartilhado no Upstash Redis**
quando `UPSTASH_REDIS_REST_URL`/`_TOKEN` estão configurados — testado de
verdade em `scripts/verify-rate-limit.ts` (14 checagens, prova o
compartilhamento manipulando o "Redis" por fora do processo). **Sem essas
variáveis**, cai sozinho para um `Map` **em memória**, que em serverless não
protege nada (cada instância tem o próprio mapa, o limite real vira
limite × instâncias).

**Impacto sem a conta real:** proteção contra força bruta no login é ilusória.
**Solução:** criar a conta Upstash ([SETUP.md §6](./SETUP.md#6-upstash--rate-limiting-antes-de-produção)) — nenhuma linha de código muda.
**Mitigação atual:** o Supabase Auth aplica limites próprios do lado dele.

### ⚠️ 2. A margem é fina, mesmo a 3%+3%

**Resolvido em parte.** A taxa subiu de 2%+2% para **3%+3%**, e o mínimo caiu de
R$ 50 para **R$ 35**. Em um aluguel de R$ 180 a margem no cartão foi de 0,68%
para **2,65%**, e no Pix de 2,89% para **4,89%**.

O que continua valendo:

- No mínimo de R$ 35, sobram **R$ 0,11 no Pix**. Positivo, mas simbólico — não
  paga um e-mail de suporte. É piso de produto, não de receita.
- 6% no total ainda é baixo para um marketplace com custódia e mediação. Há
  espaço para revisar quando houver volume.
- Quanto maior a taxa, maior o incentivo para as duas partes saírem da
  plataforma. A 6% sobre R$ 180 são R$ 129/ano que os dois economizam indo por
  fora. As defesas estão em [SEGURANCA.md](./SEGURANCA.md).

Contas completas em [PAGAMENTOS.md §3](./PAGAMENTOS.md#3-a-economia-real-do-modelo-3--3).

### ✅ 3. O que foi testado de verdade, e o que já está confirmado no seu projeto

A política de rede desta máquina bloqueia **toda** saída externa (BrasilAPI,
ViaCEP, tiles do OpenStreetMap, Nominatim e `*.supabase.co` devolvem `000`).
Para não cair no teste de mentirinha — "clicou, então funciona" — os testes
sobem, na própria máquina, um servidor que implementa o **contrato REST**
desses serviços, e exercitam o app inteiro contra ele **em um Chromium de
verdade** (`scripts/verify-integracoes.ts`, 224 checagens — fotos, mapa, CEP,
busca com GPS real, filtros, favoritos, compartilhar, o fluxo de solicitar,
aceitar e cancelar aluguel, o de configurar recebimento e pagar, o chat
com e-mail de aviso e mensagem de sistema, o painel administrativo, e
Destaque/Turbo/Premium).

**18/09/2026 — você rodou `supabase/atualizacao-0009.sql` no painel do seu
projeto real e confirmou sucesso.** Isso quer dizer que, no **seu** Supabase,
existem agora: o bucket `space-images` privado (8 MB, jpeg/png/webp), as
4 políticas que travam cada usuário na própria pasta, e as 2 triggers que
impedem publicar sem foto. O que essa migração NÃO inclui — porque não é SQL,
é o app rodando — é alguém ter efetivamente subido uma foto pela tela e visto
ela aparecer. Isso continua descrito na tabela abaixo.

| O que | Testado assim | O que isso prova | O que não prova |
|-------|---------------|------------------|-----------------|
| Upload de foto | fluxo completo no navegador: escolher, prévia, progresso, envio, URL assinada, foto na tela, sobreviver ao recarregar | nosso código monta a requisição certa, grava a referência no banco e mostra a imagem | que o servidor do Supabase responde igual ao contrato dele |
| Tiles do mapa | PNG gerados aqui, servidos por HTTP, consumidos pelo MapLibre com zoom e arrasto | o mapa pede `{z}/{x}/{y}`, desenha, reage e mostra marcadores do banco | que o CDN do OpenStreetMap/MapTiler está no ar |
| CEP | servidor local respondendo nos formatos da BrasilAPI e do ViaCEP, incluindo 404 e queda da fonte primária | debounce, normalização, mensagens, queda para a reserva e confirmação no servidor | que a BrasilAPI/ViaCEP estão no ar e com esses dados |

**O mesmo teste roda contra os serviços reais**: com `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` e as bases de CEP apontando para a produção, nada
no script muda. Se você tiver Node instalado numa máquina com internet, é o
que fecha esta última lacuna — veja
[SETUP.md](./SETUP.md#9-rodar-os-testes-contra-os-servicos-reais). Sem isso,
a forma mais simples de ver funcionando é publicar o app (Vercel, Fase 12) e
testar pela tela: criar um rascunho, subir uma foto de verdade e ver ela
aparecer no anúncio.

O **processamento** das fotos (remoção de EXIF/GPS, redimensionamento,
miniatura) e a **validação** por magic bytes rodam localmente e sempre foram
testados de verdade, com foto contendo GPS e com arquivo falso renomeado
para `.jpg`.

A **validação** das fotos foi testada de verdade, com arquivos reais — inclusive
um PHP renomeado para `.jpg`, que é recusado. O que não foi testado é o envio
ao bucket.

Se algo falhar, o app mostra o erro em vez de fingir que deu certo: bucket
inexistente, por exemplo, devolve *"Crie o bucket space-images no painel"*.

### ⚠️ 4. Não existe mediação de conflito

O produto **incentiva** fechar pela plataforma, e com razão: dentro dela há
registro, denúncia e bloqueio. Mas quando duas pessoas discordarem sobre um
dano, um atraso ou uma devolução, **hoje não há processo para resolver**.

Não existe prazo de contestação, critério de decisão, quem decide, nem regra
sobre o que acontece com o dinheiro durante a disputa.

Por isso a palavra "mediação" **não aparece em lugar nenhum da interface** — o
filtro é estrutural, em `src/lib/safety/protection.ts`, e está testado.

**O que falta:** uma decisão sua sobre a política de disputa (prazos, quem
decide, o que a plataforma banca), depois revisão jurídica, e só então o texto
pode prometer isso. Antes disso, prometer seria publicidade enganosa.

**O mesmo vale para cobertura de danos**, que exigiria seguro ou fundo de
garantia — decisão de negócio, não de engenharia.

### ⚠️ 5. Split + Pix Automático — indício forte, não confirmação direta

**18/09/2026:** encontrei confirmação de que os dois funcionam juntos, mas
por busca (resumo indexado citando a documentação), não por ter lido a
página oficial direto — o ambiente desta sessão bloqueia `docs.asaas.com`
por política de rede (testado com `curl`, resposta `403` do proxy; não é
algo que eu deva tentar contornar). Detalhes e o que ainda falta confirmar
por leitura direta em [PAGAMENTOS.md §4](./PAGAMENTOS.md#4-reconfirmação-em-18092026-e-o-que-ainda-falta).

### ✅ 6. Monitoramento de erro — código pronto, falta o projeto Sentry real

`src/instrumentation.ts`/`instrumentation-client.ts` já inicializam o Sentry
(servidor, edge e navegador) e `next.config.ts` já sobe source map quando
`SENTRY_AUTH_TOKEN` existir. Sem `NEXT_PUBLIC_SENTRY_DSN`, o próprio SDK não
envia nada — o build e o app funcionam normalmente, só não há para onde
mandar o erro. Falta só criar o projeto em [sentry.io](https://sentry.io) e
colar o DSN ([SETUP.md §7](./SETUP.md#7-sentry-erros-antes-de-produção)).

### ⚠️ 7. Teste de interface só em parte das telas

São 815 checagens reais (`pnpm verify:tudo` = 591 de banco + 224 de
navegador). As telas de foto, mapa, CEP, busca (com GPS real), filtros,
favoritos, galeria, compartilhar, o fluxo de solicitar/aceitar/cancelar
aluguel, o chat, os paineis financeiros (com webhook de pagamento disparado
pela rota HTTP real), o painel administrativo (fila de moderação, resolver
denúncia, suspensão manual, o 404 pra quem não é admin) e o sistema de
Destaque/Turbo/Premium (ativar e cancelar pela tela, selo na home/busca/Meus
espaços, consumo real em `/premium`, admin concedendo e revogando Premium)
rodam em Chromium de verdade (`pnpm verify:integracoes`). O que ainda não
tem teste automatizado de interface: cadastro, login, e as ações de
pausar/editar/excluir dentro de "Meus espaços" (só o fluxo de Destacar,
dentro dessa mesma tela, foi testado).

**Fase 15 (25/09/2026)** soma-se a essa lista: avaliação, encerrar
aluguel, central de notificações, navegação no celular e as páginas
institucionais não ganharam nenhuma seção nova em
`pnpm verify:integracoes` (continua em 224, sem quebrar). A parte de banco
dessa fase — autorização de quem avalia o quê, trigger recalculando nota,
cancelamento real no dublê do gateway antes de mexer no banco — tem 25
checagens novas em `verify-payments.ts`. A parte de tela foi conferida uma
única vez, manualmente, com capturas de um Chromium real (achou e corrigiu
um problema de layout na home) — não é repetível e não roda de novo
sozinha.

**Fase 16 (25/09/2026)**: a tela `/meus-espacos/[id]/classificacao`
também não tem seção em `pnpm verify:integracoes`. O motor de cálculo e o
schema têm cobertura pesada (1.200 execuções aleatórias inseridas de
verdade contra o banco + 7 checagens novas em `verify-schema.ts`), mas a
chamada real à API da Claude nunca foi exercitada de ponta a ponta — este
ambiente não tem `ANTHROPIC_API_KEY` real (ver Fase 16 acima para o que
foi verificado sem ela).

### ⚠️ 8. Sem documentos jurídicos

Termos de Uso, Política de Privacidade, LGPD, regras de cancelamento,
reembolso e disputa **não existem** e **não devem ser escritos por mim**.

Você opera intermediação de pagamento entre terceiros e trata dado pessoal —
inclusive CPF e localização. Isso exige advogado com experiência em marketplace
e LGPD. Não é formalidade; é o que te protege se algo der errado entre duas
pessoas que se conheceram pela sua plataforma.

---

## Como verificar você mesmo

```bash
pnpm install
pnpm db:migrate                      # aplica o schema
pnpm verify                          # 591 checagens contra o Postgres real
pnpm verify:integracoes              # 224 checagens em Chromium real (fotos, mapa, CEP, busca, favoritos, solicitar/aceitar/cancelar aluguel, configurar recebimento e pagar, chat, paineis financeiros, painel administrativo, Destaque/Turbo/Premium)
pnpm check                           # typecheck + lint + build
pnpm check:producao                  # relatorio do que falta configurar antes do primeiro usuario real
pnpm dev                             # http://localhost:3000
```

Os scripts não testam "se o código roda" — eles **tentam gravar dado inválido e
confirmam que o banco recusa**. É a diferença entre dizer que a regra existe e
mostrar que ela funciona.

O `verify:integracoes` vai além: compila o app em modo produção, sobe o
servidor, abre um Chromium de verdade e usa a interface — escolhe arquivo,
confere a prévia, espera o envio, confirma a foto na tela, arrasta o mapa,
digita CEP. Nenhuma etapa é simulada; o que ele conta são requisições HTTP
reais e linhas no banco.

O `verify-safety.ts` também cobre os **falsos positivos** do detector de
contato: "R$ 1.500,00", "CEP 29700-000" e "posso pagar por Pix aqui pelo
aplicativo?" não podem ser sinalizados.
