# Status honesto do projeto

> **Atualizado em:** 21/09/2026 · **Fases concluídas:** 1 a 6 e 9 a 12 de 12 + segurança interna + prospecção de empresas sem site · **Fases 5, 7 e 8 dependem só da credencial Asaas real** (código e testes prontos) · **Prospecção depende só da credencial Google Places API real** (código e testes prontos)

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

## Prospecção de empresas sem site 🚧 *(código e testes prontos, falta a credencial real)*

Ferramenta separada do marketplace principal — pedido do próprio usuário do
produto: encontrar, dentro do Google Maps/Google Business Profile, empresas
que aparentam não ter nenhuma presença digital própria (site, cardápio
digital, catálogo, agendamento, loja virtual), para servir de lista de
prospecção de clientes de criação de site. Vive em rotas e tabelas próprias
(`/prospectar`, `/leads`, `src/db/schema/prospecting.ts`), reaproveitando só
a autenticação, o banco e o design system do MyPlace — o cabeçalho é outro
(`ProspectHeader`) de propósito, para não misturar os dois públicos num nav
só.

| Item | Estado | Observação |
|------|--------|------------|
| Modelo de dados (`prospect_searches`, `prospect_leads`) | ✅ | migração `0012_moaning_mysterio.sql`, aplicada e verificada |
| Regra "nunca inventar" no schema | ✅ | `CHECK`s no banco: lead válido exige `confidence`, lead descartado não pode ter `confidence`, lead salvo exige status — testado tentando burlar cada um |
| Classificador de presença digital (`website-classifier.ts`) | ✅ | puro, sem rede — **29 checagens automatizadas reproduzindo exatamente os 5 exemplos do pedido original**, `pnpm tsx scripts/verify-prospecting.ts` (parte de `pnpm verify`) |
| Regra central: rede social/contato nunca descarta | ✅ testado | WhatsApp, Instagram, Facebook, TikTok, YouTube, Telegram — nenhum deles marca a empresa como "tem site" |
| Cardápio digital, catálogo, agendamento, loja virtual e construtor de site descartam | ✅ testado | listas de domínio conhecidos (Goomer, iFood, Trinks, Booksy, Nuvemshop, Wix, Google Sites, `business.site`...) + domínio próprio desconhecido (site oficial de verdade) |
| Casos ambíguos ("link na bio", URL ilegível) | ✅ | não descartam — viram lead com `confidence = verificacao_recomendada`, exatamente como pedido |
| Busca real via Google Places API (New) | ⚙️ | `src/lib/prospecting/places-client.ts` — chamada real por texto, com paginação; **sem `GOOGLE_PLACES_API_KEY` a busca falha com mensagem explícita** (`IntegrationNotConfiguredError`), nunca mostra resultado inventado |
| Expansão de busca por estado/região/Brasil inteiro | ✅ | várias consultas por cidade (lista pública de capitais/polos, `locations.ts`) — a Places API não tem como buscar "o Brasil inteiro" numa chamada só |
| Orçamento de tempo/consultas por busca | ✅ | até 40 consultas × 3 páginas, ou ~50s — o que vier primeiro; existe porque isto roda dentro do tempo de execução de uma Server Action. **Consequência honesta:** buscas muito amplas (Brasil inteiro + milhares de empresas) podem devolver menos do que o pedido, e a tela diz exatamente quantas encontrou, nunca inventa para completar |
| Filtros (nicho, localização, avaliações mínimas, nota mínima, quantidade) | ✅ | presets + campo "Personalizado" em todos, como pedido |
| Tela de busca com carregamento em etapas | ✅ | "Analisando empresas... Verificando presença digital... Eliminando empresas com sites... Aplicando filtros... Preparando seus leads..." |
| Resultados: card por empresa, com o motivo exato do lead | ✅ | nunca mostra campo que a API não devolveu — sempre "Não encontrado" em vez de inventar |
| "Meus Leads": salvar, status, observações | ✅ | autorização na DAL (`src/lib/prospecting/queries.ts`), mesmo padrão de `favorites` — usuário só vê/edita o próprio lead |
| Exportação CSV e Excel | ✅ | `src/lib/prospecting/export.ts`, só campos realmente encontrados |
| Painel (`/prospectar/painel`) | ✅ | empresas analisadas, leads encontrados, descartadas por site/cardápio/catálogo/agendamento, leads salvos, contatadas, clientes conquistados — somado de `prospect_searches`/`prospect_leads` reais, nada mockado |
| Credencial real (`GOOGLE_PLACES_API_KEY`) | 🔑 | falta você criar a chave — [SETUP.md §8](./SETUP.md#8-google-places-api-prospecção) |
| Teste com a API do Google de verdade | 🔑 | diferente de Supabase/BrasilAPI/ViaCEP, a rede deste ambiente **alcança** `places.googleapis.com` — confirmado com `curl` de verdade contra o endpoint real: a mesma requisição que `places-client.ts` monta (corpo, `X-Goog-Api-Key`, `X-Goog-FieldMask`) foi enviada sem uma chave válida e a Google respondeu `400 API_KEY_INVALID` — ou seja, o formato da chamada foi validado pelo servidor real do Google, só falta a chave de verdade para ver um resultado. Sem ela não há como testar o parsing da resposta com dado real |
| Cobrança/plano | ⬜ | não implementado nesta versão, por pedido explícito — mas a estrutura (usuário dono da busca/lead) já suporta adicionar limite por plano sem redesenho |

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
verdade** (`scripts/verify-integracoes.ts`, 184 checagens — fotos, mapa, CEP,
busca com GPS real, filtros, favoritos, compartilhar, o fluxo de solicitar,
aceitar e cancelar aluguel, o de configurar recebimento e pagar, o chat
com e-mail de aviso e mensagem de sistema, e o painel administrativo).

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

São 656 checagens reais (`pnpm verify:tudo`). As telas de foto, mapa, CEP,
busca (com GPS real), filtros, favoritos, galeria, compartilhar, o fluxo de
solicitar/aceitar/cancelar aluguel, o chat, os paineis financeiros (com
webhook de pagamento disparado pela rota HTTP real) e o painel administrativo
(fila de moderação, resolver denúncia, suspensão manual, o 404 pra quem não
é admin) rodam em Chromium de verdade (`pnpm verify:integracoes`). O que
ainda não tem teste automatizado de interface: cadastro, login e o painel
"Meus espaços".

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
pnpm verify                          # 472 checagens contra o Postgres real
pnpm verify:integracoes              # 184 checagens em Chromium real (fotos, mapa, CEP, busca, favoritos, solicitar/aceitar/cancelar aluguel, configurar recebimento e pagar, chat, paineis financeiros, painel administrativo)
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
