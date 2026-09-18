# Status honesto do projeto

> **Atualizado em:** 18/09/2026 · **Fases concluídas:** 1 a 4 de 12 + segurança interna · **Fase 5 em andamento:** reserva e aluguel sem pagamento

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
| Verificação automatizada do banco | ✅ | 29 checagens — `pnpm tsx scripts/verify-schema.ts` |
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
| Aviso escalonado de pagamento por fora | ✅ | componente pronto; liga no chat (Fase 6) |
| Níveis de confiança do perfil | ✅ | denúncia procedente domina histórico longo |
| Contagem de locações concluídas | ✅ | trigger; conta os dois lados |
| Verificação de documento no perfil | ✅ banco | preenchido pelo KYC na Fase 8 |
| Aplicação automática de suspensão | ⬜ | limites já configurados; a ação entra na Fase 11 |
| Fila de moderação | ⬜ | índice pronto; painel é Fase 11 |
| Detector ligado ao chat | ⬜ | depende do chat (Fase 6) |

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
| Conversa com proprietário | ⬜ | Fase 6 |
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

### Cliente Asaas e webhook — código pronto, sem credencial real 🚧

Detalhes completos e a reconfirmação da documentação em
[PAGAMENTOS.md §4](./PAGAMENTOS.md#4-reconfirmação-em-18092026-e-o-que-ainda-falta).

| Item | Estado | Observação |
|------|--------|------------|
| Cliente Asaas (`src/lib/payments/asaas.ts`) | ✅ | cliente, subconta, assinatura com split, busca de cobrança, estorno, cancelamento |
| Webhook (`POST /api/webhooks/asaas`) | ✅ | autentica por token (header `asaas-access-token`), idempotente de verdade — reentrega do mesmo evento testada e comprovada sem duplicar nada |
| `PAYMENT_CONFIRMED` ativa a reserva; `PAYMENT_RECEIVED` gera o repasse | ✅ | decisão registrada em PAGAMENTOS.md §4 — o locatário não espera a plataforma receber pra usar o que já pagou |
| Atraso (`PAYMENT_OVERDUE`) e recuperação | ✅ | reserva vira `past_due`, volta a `active` ao regularizar |
| Tentativa de webhook com token forjado | ✅ | recusada com 401, **nenhum evento gravado** — testado tentando de verdade |
| Verificação automatizada | ✅ | 50 checagens — `scripts/verify-payments.ts`, contra o Postgres real e um dublê local do Asaas (sem credencial real, mesmo padrão do CEP/mapa) |
| Ligar isso ao fluxo real (aceitar reserva → criar assinatura) | ⬜ | próximo passo — hoje o cliente existe mas nada o chama a partir da tela |
| Tela de checkout, onboarding do proprietário | ⬜ | |
| Credencial real / conta Asaas | 🔑 | ver PAGAMENTOS.md — a leitura da documentação nesta rodada foi por busca (rede bloqueada pra `docs.asaas.com` neste ambiente), não confirmada linha a linha |

---

## Fases 6 a 12 — ⬜ não implementadas

| Fase | Escopo | Depende de |
|------|--------|-----------|
| 6 | Chat e notificações (além do sistema interno já usado nas solicitações) | Resend |
| 7 | Pagamento real (Pix, cartão, cobrança recorrente) | **Conta Asaas** — cliente e webhook já existem (ver Fase 5), falta ligar ao fluxo, checkout e credencial real |
| 8 | Repasse real ao proprietário | **KYC aprovado no Asaas** |
| 9 | Painel do proprietário completo (valores recebidos/pendentes/histórico) | Fase 7 — hoje tem espaços, solicitações e reservas; falta a parte com dinheiro de verdade |
| 10 | Painel do locatário completo (pagamentos, próximo pagamento) | Fase 7 — hoje tem reservas; falta a parte com dinheiro de verdade |
| 11 | Painel administrativo | — |
| 12 | Segurança, testes e preparação para produção | Upstash + Sentry |

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

### ⚠️ 1. Rate limiting não serve para produção

`src/lib/rate-limit.ts` mantém contadores **em memória**. Em serverless cada
instância tem o próprio mapa, então o limite real vira (limite × instâncias).

**Impacto:** proteção contra força bruta no login é ilusória.
**Solução:** Upstash Redis ([SETUP.md §6](./SETUP.md#6-upstash--rate-limiting-antes-de-produção)).
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
verdade** (`scripts/verify-integracoes.ts`, 139 checagens — fotos, mapa, CEP,
busca com GPS real, filtros, favoritos, compartilhar e o fluxo de solicitar,
aceitar e cancelar aluguel).

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

### ⚠️ 6. Sem monitoramento de erro

Sentry não integrado. Em produção você descobriria falhas pelo cliente.

### ⚠️ 7. Teste de interface só em parte das telas

São 445 checagens reais (`pnpm verify:tudo`). As telas de foto, mapa, CEP,
busca (com GPS real), filtros, favoritos, galeria, compartilhar e o fluxo de
solicitar/aceitar/cancelar aluguel rodam em Chromium de verdade
(`pnpm verify:integracoes`). O que ainda não tem teste automatizado de
interface: cadastro, login e o painel "Meus espaços". Fase 12.

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
pnpm verify                          # 306 checagens contra o Postgres real
pnpm verify:integracoes              # 139 checagens em Chromium real (fotos, mapa, CEP, busca, favoritos, solicitar/aceitar/cancelar aluguel)
pnpm check                           # typecheck + lint + build
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
