import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ChevronLeft, ChevronRight, SearchX, SlidersHorizontal } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/dal';
import { buildNeedSearchUrl } from '@/lib/search/need/to-url';
import { todayInSaoPaulo } from '@/lib/dates';
import {
  needSummaryFromParams, parseSizeParam, parseStartParam, parseTypesParam, parseVehicleParam,
} from '@/lib/search/need/params';
import { computeMatch, earliestStartFrom, type MatchCriteria, type MatchResult } from '@/lib/search/match';
import {
  listPublishedSpaces, listFeaturesForType, listAllActiveFeatures, effectiveSort,
  type SearchSort,
} from '@/lib/spaces/queries';
import { hasSearchContext } from '@/lib/promotions/compatibility';
import { resolveLocation } from '@/lib/spaces/resolve-location';
import { matchSpaceTypeKeyword } from '@/lib/spaces/keywords';
import { listUserFavoriteIds } from '@/lib/favorites/queries';
import { signImagePaths } from '@/lib/storage/signed-urls';
import { parseBRLToCents, InvalidAmountError } from '@/lib/money';
import { SPACE_TYPES, spaceTypeLabel, spaceTypeOptions, spaceTypePlural, type SpaceTypeKey } from '@/lib/spaces/types';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { SearchBar } from '@/components/search/search-bar';
import { NeedSummaryView } from '@/components/search/need-summary';
import { SaveSearchButton } from '@/components/alerts/save-search-button';
import { getUserSavedSearch } from '@/lib/alerts/queries';
import { FiltersBar } from '@/components/espacos/filters-bar';
import { ResultCard } from '@/components/espacos/result-card';
import { ResultsMap, MobileMapToggle, type MapSpace } from '@/components/map/spaces-map';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Espaços disponíveis',
  description: 'Garagens, depósitos, galpões e salas disponíveis para alugar por mês.',
};

/** Sempre fresco: um anúncio recém-publicado precisa aparecer na hora. */
export const dynamic = 'force-dynamic';

const POR_PAGINA = 24;
const ORDENS_VALIDAS: readonly SearchSort[] = ['distance', 'price_asc', 'price_desc', 'recent'];

type Params = Record<string, string | undefined>;

/** Tenta ler um preço em reais digitado no filtro. Entrada ruim = filtro ignorado, não erro de página. */
function precoOuNulo(v: string | undefined): number | null {
  if (!v) return null;
  try {
    return parseBRLToCents(v);
  } catch (err) {
    if (err instanceof InvalidAmountError) return null;
    throw err;
  }
}

/** Monta a URL de uma página de resultados preservando os demais filtros. */
function hrefComPagina(sp: Params, pagina: number): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v && k !== 'pagina') params.set(k, v);
  }
  if (pagina > 1) params.set('pagina', String(pagina));
  const qs = params.toString();
  return qs ? `/espacos?${qs}` : '/espacos';
}

export default async function EspacosPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const sp = await searchParams;
  const viewer = await getCurrentUser();

  // ---- Busca por necessidade (Fase 23): o texto livre de "O que você
  // precisa?" chega como `q`, é interpretado UMA vez aqui e vira a URL de
  // resultados com os filtros de sempre — paginação, filtros e link
  // compartilhado funcionam sem reinterpretar (nem chamar a IA de novo).
  const necessidade = sp.q?.trim();
  if (necessidade) {
    const h = await headers();
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'sem-ip';
    const latQ = Number(sp.lat);
    const lngQ = Number(sp.lng);
    const destino = await buildNeedSearchUrl({
      q: necessidade,
      onde: sp.onde ?? null,
      gps: sp.lat && sp.lng && Number.isFinite(latQ) && Number.isFinite(lngQ) ? { lat: latQ, lng: lngQ } : null,
      clientKey: viewer?.id ?? `ip:${ip}`,
    });
    // Editando um alerta (Fase 23): a nova busca continua no modo de edição.
    const alertaEmEdicao = sp.alerta && /^[0-9a-f-]{36}$/i.test(sp.alerta) ? `&alerta=${sp.alerta}` : '';
    redirect(`${destino}${alertaEmEdicao}`);
  }
  const hoje = todayInSaoPaulo();

  // ---- Tipo: valor canonico, ou tentativa de reconhecer por palavra-chave.
  const tipoBruto = sp.tipo?.trim();
  const tipo: SpaceTypeKey | undefined =
    tipoBruto && (SPACE_TYPES as readonly string[]).includes(tipoBruto)
      ? (tipoBruto as SpaceTypeKey)
      : tipoBruto
        ? (matchSpaceTypeKeyword(tipoBruto) ?? undefined)
        : undefined;
  // Tipo digitado que nao bate com nada vira parte da busca por texto, em
  // vez de simplesmente zerar os resultados.
  const tipoNaoReconhecido = tipoBruto && !tipo ? tipoBruto : null;

  // ---- Localizacao: GPS direto, CEP, cidade/bairro real, ou geocodificacao.
  const lat = sp.lat ? Number(sp.lat) : undefined;
  const lng = sp.lng ? Number(sp.lng) : undefined;
  const resolucao = await resolveLocation({
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
    onde: sp.onde,
  });

  // `texto`: busca por necessidade que não entendeu nada, com poucas
  // palavras — vira a busca textual de sempre (título, cidade, bairro).
  const textQuery = [resolucao.source === 'unresolved' ? sp.onde : null, tipoNaoReconhecido, sp.texto?.trim().slice(0, 80)]
    .filter(Boolean)
    .join(' ') || undefined;

  // Vários tipos (busca por necessidade: "moto" cabe em vaga de moto,
  // garagem ou vaga de carro). Só vale quando nenhum tipo único foi escolhido.
  const tipos = tipo ? [] : parseTypesParam(sp.tipos);
  const areaMinM2 = parseSizeParam(sp.areaMin);
  const inicio = parseStartParam(sp.inicio, hoje);

  const raioMeters = sp.raio ? Number(sp.raio) : null;
  const precoMinCents = precoOuNulo(sp.precoMin);
  const precoMaxCents = precoOuNulo(sp.precoMax);
  const featureKeys = sp.caracteristicas ? sp.caracteristicas.split(',').filter(Boolean) : [];
  const disponivelAgora = sp.disponivel === '1';

  const ordenarPedido = ORDENS_VALIDAS.includes(sp.ordenar as SearchSort)
    ? (sp.ordenar as SearchSort)
    : undefined;
  const temPonto = resolucao.point != null;
  const ordenar = effectiveSort(ordenarPedido, temPonto);

  const pagina = Math.max(1, Math.trunc(Number(sp.pagina)) || 1);

  // CEP com formato valido mas que os Correios nao reconhecem: mostrar isso
  // explicitamente em vez de rodar uma busca sem filtro de local nenhum, que
  // devolveria anuncios de qualquer canto do Brasil sem avisar por quê.
  const buscaBloqueadaPorCep = resolucao.cepNotFound;

  // Mesmo contexto usado pra elegibilidade de Destaque/Turbo na ordenacao —
  // so mostra "Recomendados pra voce" quando ha algo real pra comparar.
  const contextoCompatibilidade = {
    type: tipo,
    types: tipos,
    cityFilter: resolucao.cityFilter,
    districtFilter: resolucao.districtFilter,
    priceMinCents: precoMinCents,
    priceMaxCents: precoMaxCents,
    availableNow: disponivelAgora,
    featureKeys,
  };
  const buscarRecomendados = !buscaBloqueadaPorCep && hasSearchContext(contextoCompatibilidade);

  const [itens, caracteristicasDisponiveis, recomendadosBrutos] = buscaBloqueadaPorCep
    ? [[], [], []]
    : await Promise.all([
        listPublishedSpaces({
          ...contextoCompatibilidade,
          point: resolucao.point,
          radiusMeters: raioMeters,
          textQuery,
          sizeMinM2: areaMinM2,
          startBy: inicio,
          sort: ordenar,
          limit: POR_PAGINA + 1,
          offset: (pagina - 1) * POR_PAGINA,
        }),
        tipo ? listFeaturesForType(tipo) : listAllActiveFeatures(),
        buscarRecomendados
          ? listPublishedSpaces({ ...contextoCompatibilidade, relaxTypeAndFeatures: true, sort: 'compatibility', limit: 12 })
          : Promise.resolve([]),
      ]);

  const temProximaPagina = itens.length > POR_PAGINA;
  const resultados = itens.slice(0, POR_PAGINA);

  /*
   * So mostra a secao quando ela acrescenta algo que a lista principal
   * (nesta pagina) ainda nao mostra — sem isso, uma busca ja bem estreita
   * (poucos resultados, todos tambem os mais compativeis) duplicaria o
   * MESMO card nas duas secoes ao mesmo tempo, o que e ruido, nao recomendacao.
   */
  // ---- Compatibilidade (Fase 23): só com o que a pessoa informou nesta
  // busca, e nunca muda quem aparece na lista principal. Na lista principal
  // aparece só na busca por necessidade — nos filtros comuns todo resultado
  // já cumpre todos os filtros, e "100% compatível" em cada card seria ruído.
  // Em "Recomendados" (tipo e características viram só pontuação) aparece
  // sempre, porque ali o número de fato varia e explica a ordem.
  const criterios: MatchCriteria = {
    types: tipo ? [tipo] : tipos,
    vehicle: parseVehicleParam(sp.veiculo),
    location: resolucao.districtFilter
      ? { kind: 'district', district: resolucao.districtFilter, city: resolucao.cityFilter }
      : resolucao.cityFilter
        ? { kind: 'city', city: resolucao.cityFilter }
        : resolucao.point
          ? { kind: 'point', radiusMeters: raioMeters && Number.isFinite(raioMeters) ? raioMeters : null }
          : null,
    priceMinCents: precoMinCents,
    priceMaxCents: precoMaxCents,
    featureKeys,
    sizeMinM2: areaMinM2,
    startBy: disponivelAgora ? hoje : inicio,
  };
  const rotulosCaracteristica = new Map((await listAllActiveFeatures()).map((f) => [f.key, f.label]));
  const compatibilidade = new Map<string, MatchResult | null>();
  for (const r of [...resultados, ...recomendadosBrutos]) {
    if (compatibilidade.has(r.id)) continue;
    compatibilidade.set(r.id, computeMatch(
      { ...r, earliestStart: earliestStartFrom(r.availableFrom, r.blockedUntil, hoje) },
      criterios,
      rotulosCaracteristica,
    ));
  }

  /*
   * Recomendados: a mesma compatibilidade que aparece no card decide a
   * ordem (estável: empate mantém a ordem do banco) — o número mostrado e a
   * posição nunca se contradizem. Promoção não entra aqui.
   */
  const idsResultados = new Set(resultados.map((r) => r.id));
  const recomendados = recomendadosBrutos
    .filter((r) => !idsResultados.has(r.id))
    .map((r, i) => ({ r, i, p: compatibilidade.get(r.id)?.percent ?? -1 }))
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .slice(0, 6)
    .map(({ r }) => r);
  const mostrarRecomendados = buscarRecomendados && recomendados.length > 0;

  const [urls, favoritosIds] = await Promise.all([
    signImagePaths(
      [...resultados, ...recomendados].map((r) => r.coverPath).filter(Boolean) as string[],
    ),
    viewer ? listUserFavoriteIds(viewer.id) : Promise.resolve(new Set<string>()),
  ]);

  const noMapa: MapSpace[] = resultados
    .filter((r) => r.approxLat != null && r.approxLng != null)
    .map((r) => ({
      id: r.id, slug: r.slug, title: r.title,
      typeLabel: spaceTypeLabel(r.type as SpaceTypeKey),
      priceMonthlyCents: r.priceMonthlyCents,
      district: r.district, city: r.city,
      lat: r.approxLat as number, lng: r.approxLng as number,
    }));

  const opcoesDeTipo = spaceTypeOptions();

  const resumoNecessidade = sp.busca
    ? needSummaryFromParams(sp, { today: hoje, featureLabels: rotulosCaracteristica })
    : null;

  // ---- Alerta desta busca (Fase 23): só quando a busca diz O QUE ou ONDE —
  // "qualquer espaço em qualquer lugar" avisaria de todo anúncio novo.
  const alertavel = !buscaBloqueadaPorCep && resolucao.source !== 'unresolved' && Boolean(
    tipo || tipos.length > 0 || resolucao.cityFilter || resolucao.districtFilter || resolucao.point,
  );
  const alertaEmEdicao = viewer && sp.alerta ? await getUserSavedSearch(viewer.id, sp.alerta) : null;
  const buscaAtual = new URLSearchParams(
    Object.entries(sp).filter(([k, v]) => v && k !== 'pagina' && k !== 'alerta') as [string, string][],
  ).toString();

  // ---- Cabecalho: o que estamos mostrando, em uma frase.
  let tituloLocal: string | null = null;
  if (resolucao.label) {
    tituloLocal = resolucao.source === 'gps' ? 'perto de você' : `em ${resolucao.label}`;
  }
  const titulo = [
    tipo ? spaceTypePlural(tipo) : 'Espaços',
    tituloLocal,
  ].filter(Boolean).join(' ');

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8 space-y-5">
        <div className="max-w-3xl">
          <SearchBar
            initialTipo={sp.busca ?? sp.tipo}
            initialOnde={sp.busca ? sp.ondeCampo : sp.onde}
            keepParams={alertaEmEdicao ? { alerta: alertaEmEdicao.id } : undefined}
            initialGps={resolucao.source === 'gps' && lat != null && lng != null ? { lat, lng } : undefined}
          />
        </div>

        <header className="space-y-1 pt-2">
          <h1 className="text-[1.375rem] sm:text-[1.625rem] font-semibold">
            {titulo}
          </h1>
          {!buscaBloqueadaPorCep && (
            <p className="text-[var(--content-muted)] text-[0.9375rem]">
              {resultados.length === 0
                ? 'Nenhum espaço encontrado.'
                : `${resultados.length}${temProximaPagina ? '+' : ''} ${resultados.length === 1 ? 'espaço' : 'espaços'} para alugar por mês.`}
            </p>
          )}
        </header>

        {resumoNecessidade && <NeedSummaryView summary={resumoNecessidade} />}

        {alertavel && (
          <SaveSearchButton
            search={buscaAtual}
            loggedIn={Boolean(viewer)}
            alertId={alertaEmEdicao?.id}
            alertLabel={alertaEmEdicao?.label}
          />
        )}

        {buscaBloqueadaPorCep && (
          <Alert tone="warning" title="CEP não encontrado">
            Confira o CEP digitado ou busque por cidade, bairro ou endereço.
          </Alert>
        )}

        {/*
          Recomendados: ordenado SO por compatibilidade com a busca atual —
          nunca por Destaque/Turbo (o selo pode aparecer, mas nao decide a
          posicao aqui). E o contraponto explicito pedido: um anuncio pago
          com menos caracteristicas compativeis nao fica na frente de um
          gratuito com mais, nesta secao.
        */}
        {mostrarRecomendados && (
          <section className="space-y-3" data-testid="secao-recomendados">
            <div className="space-y-0.5">
              <h2 className="text-[1.0625rem] font-semibold">Recomendados para você</h2>
              <p className="text-[0.8125rem] text-[var(--content-muted)]">
                Selecionados pela compatibilidade com a sua busca, não pelo que foi pago.
              </p>
            </div>
            {/*
              ResultCard ja renderiza o proprio <li> raiz (mesmo padrao da
              home) — o layout horizontal aqui vem do <ul> pai, via seletor
              de filho, sem embrulhar num <li> extra (que seria <li><li>,
              HTML invalido, o mesmo defeito ja corrigido em PremiumBadge).
            */}
            <ul className="flex gap-4 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 snap-x snap-mandatory [&>li]:w-[15.5rem] [&>li]:shrink-0 [&>li]:snap-start">
              {recomendados.map((r) => (
                <ResultCard
                  key={r.id}
                  space={r}
                  coverUrl={r.coverPath ? (urls.get(r.coverPath) ?? null) : null}
                  favorited={favoritosIds.has(r.id)}
                  loggedIn={Boolean(viewer)}
                  match={compatibilidade.get(r.id)}
                />
              ))}
            </ul>
          </section>
        )}

        {!buscaBloqueadaPorCep && (
          <>
            <nav aria-label="Filtrar por tipo" className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
              <Link
                href={hrefComPagina({ ...sp, tipo: undefined, tipos: undefined }, 1)}
                aria-current={!tipo && tipos.length === 0 ? 'page' : undefined}
                className={cn(
                  'shrink-0 px-3.5 py-2 rounded-[var(--radius-pill)] text-[0.875rem] border transition-colors',
                  !tipo && tipos.length === 0
                    ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)] font-medium'
                    : 'text-[var(--content-muted)] hover:border-[var(--content-subtle)]',
                )}
              >
                Todos
              </Link>
              {opcoesDeTipo.map((t) => (
                <Link
                  key={t.value}
                  href={hrefComPagina({ ...sp, tipo: t.value, tipos: undefined }, 1)}
                  aria-current={tipo === t.value ? 'page' : undefined}
                  className={cn(
                    'shrink-0 px-3.5 py-2 rounded-[var(--radius-pill)] text-[0.875rem] border transition-colors',
                    tipo === t.value
                      ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)] font-medium'
                      : 'text-[var(--content-muted)] hover:border-[var(--content-subtle)]',
                  )}
                >
                  {t.label}
                </Link>
              ))}
            </nav>

            <FiltersBar
              value={{
                precoMin: sp.precoMin ?? '',
                precoMax: sp.precoMax ?? '',
                raio: sp.raio ?? '',
                caracteristicas: featureKeys,
                disponivel: disponivelAgora,
                ordenar,
              }}
              temPontoDeReferencia={temPonto}
              features={caracteristicasDisponiveis}
              totalResultados={resultados.length}
            />

            {resultados.length === 0 ? (
              <div className="rounded-[var(--radius-card)] border border-dashed p-12 sm:p-16 text-center space-y-3">
                <SearchX className="size-6 mx-auto text-[var(--content-subtle)]" aria-hidden />
                <p className="font-medium">Nada por aqui ainda</p>
                <p className="text-[0.9375rem] text-[var(--content-muted)] max-w-sm mx-auto leading-relaxed">
                  {resumoNecessidade && resumoNecessidade.chips.length > 0
                    ? 'Nenhum espaço atende a tudo isso ainda. Tire um dos critérios acima para ver mais opções.'
                    : temPonto || tipo || tipos.length > 0 || featureKeys.length > 0 || precoMinCents || precoMaxCents
                    ? 'Experimente aumentar a distância, remover um filtro ou buscar outro local.'
                    : resolucao.source === 'unresolved'
                      ? `Não encontramos nada para "${resolucao.label}". Tente outro local.`
                      : 'Ainda não há espaços publicados por aqui. Se você tem um espaço parado, pode ser o primeiro.'}
                </p>
                <Link
                  href="/espacos"
                  className="inline-flex items-center gap-1.5 mt-2 text-[0.875rem] text-[var(--accent)] underline underline-offset-4"
                >
                  <SlidersHorizontal className="size-3.5" aria-hidden />
                  Ver todos os espaços
                </Link>
              </div>
            ) : (
              <div className="lg:grid lg:grid-cols-[1fr_26rem] lg:gap-6 lg:items-start">
                <div>
                  <ul data-testid="lista-resultados" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                    {resultados.map((r) => (
                      <ResultCard
                        key={r.id}
                        space={r}
                        coverUrl={r.coverPath ? (urls.get(r.coverPath) ?? null) : null}
                        favorited={favoritosIds.has(r.id)}
                        loggedIn={Boolean(viewer)}
                        match={sp.busca ? compatibilidade.get(r.id) : null}
                      />
                    ))}
                  </ul>

                  {(pagina > 1 || temProximaPagina) && (
                    <div className="flex items-center justify-between gap-3 pt-8">
                      {pagina > 1 ? (
                        <Link
                          href={hrefComPagina(sp, pagina - 1)}
                          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-[var(--radius-field)] border text-[0.875rem] font-medium hover:bg-[var(--surface-sunken)]"
                        >
                          <ChevronLeft className="size-4" aria-hidden />
                          Anterior
                        </Link>
                      ) : <span />}
                      {temProximaPagina && (
                        <Link
                          href={hrefComPagina(sp, pagina + 1)}
                          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-[var(--radius-field)] border text-[0.875rem] font-medium hover:bg-[var(--surface-sunken)]"
                        >
                          Próxima
                          <ChevronRight className="size-4" aria-hidden />
                        </Link>
                      )}
                    </div>
                  )}
                </div>

                {/* Desktop: mapa fixo ao lado, sempre montado. */}
                <div data-testid="mapa-desktop" className="hidden lg:block lg:sticky lg:top-20">
                  <ResultsMap
                    spaces={noMapa}
                    referencePoint={resolucao.point}
                    className="h-[calc(100vh-7rem)] max-h-[42rem]"
                  />
                </div>

                {/* Celular: alternância Lista/Mapa, mapa só monta quando pedido. */}
                <MobileMapToggle spaces={noMapa} referencePoint={resolucao.point} />
              </div>
            )}
          </>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
