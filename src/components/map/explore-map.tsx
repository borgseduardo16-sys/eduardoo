'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Map as MapLibreMap, Marker, NavigationControl, type GeoJSONSource } from 'maplibre-gl';
import { Layers, LoaderCircle, LocateFixed, SlidersHorizontal } from 'lucide-react';
import { DEFAULT_ZOOM, getSatelliteSource, getTileSource } from '@/lib/maps/config';
import { prepararMapLibre } from '@/lib/maps/worker';
import { circleBounds, circlePolygon } from '@/lib/maps/geo';
import {
  DEFAULT_RADIUS_M,
  buildExploreQuery,
  roundApprox,
  type ExploreQuery,
} from '@/lib/maps/explore-params';
import type { ExploreCluster, ExplorePin, ExploreResult, MapPreview } from '@/lib/maps/explore';
import { typesOfCategories } from '@/lib/spaces/categories';
import { formatBRLShort } from '@/lib/money';
import { CategoryIcon, categoryLabel } from './category-icon';
import { ExploreFiltersPanel, NO_FILTERS, activeFilterCount, type ExploreFilters } from './explore-filters';
import { ExplorePreview } from './explore-preview';
import { cn } from '@/lib/utils';
import 'maplibre-gl/dist/maplibre-gl.css';

type Referencia = { lat: number; lng: number; kind: 'gps' | 'busca' | 'padrao' };

export type ExploreMapProps = {
  /** Centro quando não há GPS: o lugar buscado em "Onde", ou a região padrão do app. */
  fallback: { lat: number; lng: number; label: string; kind: 'busca' | 'padrao' };
  initialFilters: ExploreFilters;
  /** Pedir a localização ao abrir? Falso quando a pessoa já escolheu um lugar. */
  autoLocate: boolean;
  /** Aviso da busca ("Não encontramos esse lugar…"), mostrado uma vez. */
  notice?: string | null;
};

const REDUZIR_MOVIMENTO = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Mapa de exploração.
 *
 *  - Abre em volta da localização APROXIMADA da pessoa (o navegador devolve a
 *    posição, arredondada aqui para ~110 m antes de sair do aparelho), com o
 *    raio de 2 km enquadrado. Sem permissão, abre no lugar buscado ou na
 *    região padrão — e diz qual é, em vez de fingir que sabe onde a pessoa está.
 *  - Os marcadores vêm do servidor já limitados: um por espaço enquanto cabem,
 *    círculos com contagem quando a área está cheia (ver `exploreSpaces`).
 *  - Marcadores são botões do React dentro de elementos do MapLibre (portais),
 *    então teclado, leitor de tela e estado (selecionado) funcionam como em
 *    qualquer componente.
 *  - A imagem aérea só liga quando existe uma fonte configurada; senão o botão
 *    fica desligado e diz isso.
 */
export function ExploreMap({ fallback, initialFilters, autoLocate, notice }: ExploreMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [tileError, setTileError] = useState(false);

  const satelite = useMemo(() => getSatelliteSource(), []);
  const ruas = useMemo(() => getTileSource(), []);
  const [basemap, setBasemap] = useState<'satellite' | 'streets'>(satelite ? 'satellite' : 'streets');

  const [reference, setReference] = useState<Referencia>({ lat: fallback.lat, lng: fallback.lng, kind: fallback.kind });
  const [filters, setFilters] = useState<ExploreFilters>(initialFilters);
  const [data, setData] = useState<ExploreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [painelAberto, setPainelAberto] = useState(false);
  const [localizando, setLocalizando] = useState(false);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<ExplorePin | null>(null);
  // A prévia guarda o id a que pertence: trocar de marcador mostra o novo cartão limpo, sem efeito para "zerar".
  const [previaEstado, setPreviaEstado] = useState<{ id: string; data: MapPreview | null; falhou: boolean } | null>(null);
  const previaAtual = previaEstado && selecionado && previaEstado.id === selecionado.id ? previaEstado : null;
  const previa = previaAtual?.data ?? null;
  const previaFalhou = previaAtual?.falhou ?? false;

  // Últimos valores para os ouvintes do MapLibre, que vivem mais que um render.
  const estadoRef = useRef({ reference, filters, basemap });
  useEffect(() => {
    estadoRef.current = { reference, filters, basemap };
  });

  const rotuloReferencia =
    reference.kind === 'gps' ? 'sua localização' : fallback.kind === 'busca' || reference.kind === 'busca' ? fallback.label : fallback.label;

  // ---- Mapa: nasce uma vez.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const inicial = satelite ?? ruas;
    prepararMapLibre();
    const m = new MapLibreMap({
      container: containerRef.current,
      style: inicial.style as never,
      center: [fallback.lng, fallback.lat],
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
    m.addControl(new NavigationControl({ showCompass: false, visualizePitch: false }), 'top-right');
    m.on('load', () => {
      if (initialFilters.radius) {
        m.fitBounds(circleBounds(fallback, initialFilters.radius), { padding: 48, duration: 0 });
      }
      setMap(m);
    });
    m.on('error', () => setTileError(true));
    // O círculo do raio é uma camada GeoJSON: só aparece depois que o worker do mapa a processa. Este atributo marca
    // que isso aconteceu (o teste de navegador espera por ele; ver src/lib/maps/worker.ts).
    m.on('sourcedata', (e) => {
      if (e.sourceId === 'zona-raio' && m.isSourceLoaded('zona-raio')) containerRef.current?.setAttribute('data-raio-pronto', 'true');
    });
    mapRef.current = m;
    return () => {
      m.remove();
      mapRef.current = null;
      setMap(null);
    };
    // Só na montagem: o centro inicial não reage a re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Círculo do raio (e redesenho depois de trocar o estilo do mapa).
  const desenharRaio = useCallback((m: MapLibreMap) => {
    const { reference: ref, filters: f } = estadoRef.current;
    const feature = {
      type: 'FeatureCollection' as const,
      features: f.radius
        ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [circlePolygon(ref, f.radius)] } }]
        : [],
    };
    const fonte = m.getSource('zona-raio') as GeoJSONSource | undefined;
    if (fonte) {
      fonte.setData(feature);
      return;
    }
    m.addSource('zona-raio', { type: 'geojson', data: feature });
    m.addLayer({ id: 'zona-raio-fundo', type: 'fill', source: 'zona-raio', paint: { 'fill-color': '#2f6bdc', 'fill-opacity': 0.07 } });
    m.addLayer({ id: 'zona-raio-borda-branca', type: 'line', source: 'zona-raio', paint: { 'line-color': '#ffffff', 'line-width': 4, 'line-opacity': 0.85 } });
    m.addLayer({ id: 'zona-raio-borda', type: 'line', source: 'zona-raio', paint: { 'line-color': '#2f6bdc', 'line-width': 2, 'line-dasharray': [2, 2] } });
  }, []);

  useEffect(() => {
    if (!map) return;
    desenharRaio(map);
  }, [map, reference, filters.radius, desenharRaio]);

  // ---- Troca de imagem aérea / ruas.
  const trocarBase = useCallback(
    (alvo: 'satellite' | 'streets') => {
      const m = mapRef.current;
      const fonte = alvo === 'satellite' ? satelite : ruas;
      if (!m || !fonte) return;
      setBasemap(alvo);
      m.once('style.load', () => desenharRaio(m));
      m.setStyle(fonte.style as never);
    },
    [satelite, ruas, desenharRaio],
  );

  // ---- Dados: busca o que cabe na tela (com atraso curto, para não pedir a cada pixel arrastado).
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = useCallback(async () => {
    const m = mapRef.current;
    if (!m) return;
    const { reference: ref, filters: f } = estadoRef.current;
    const b = m.getBounds();
    const q: ExploreQuery = {
      bbox: { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
      zoom: m.getZoom(),
      center: { lat: ref.lat, lng: ref.lng },
      radiusMeters: f.radius,
      priceMaxCents: f.priceMaxCents,
      categories: f.categories,
      availableNow: f.availableNow,
    };
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setLoading(true);
    try {
      const res = await fetch(`/api/mapa?${buildExploreQuery(q)}`, { signal: ctl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ExploreResult;
      if (ctl.signal.aborted) return;
      setData(json);
      setLoadError(false);
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return;
      setLoadError(true);
    } finally {
      if (!ctl.signal.aborted) setLoading(false);
    }
  }, []);

  const agendar = useCallback(
    (atrasoMs: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void carregar(), atrasoMs);
    },
    [carregar],
  );

  useEffect(() => {
    if (!map) return;
    const aoMover = () => agendar(350);
    map.on('moveend', aoMover);
    return () => {
      map.off('moveend', aoMover);
    };
  }, [map, agendar]);

  // Filtros ou referência mudaram: busca de novo (e enquadra o raio, quando ele mudou).
  const primeiraBusca = useRef(true);
  useEffect(() => {
    if (!map) return;
    if (primeiraBusca.current) {
      primeiraBusca.current = false;
      agendar(0);
      return;
    }
    agendar(120);
  }, [map, filters, reference, agendar]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    },
    [],
  );

  // ---- Localização aproximada da pessoa.
  const localizar = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGeoMsg('Este navegador não oferece localização. Busque um bairro, cidade ou CEP.');
      return;
    }
    setLocalizando(true);
    setGeoMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // ~110 m: localização aproximada antes de sair do aparelho.
        const ponto = { lat: roundApprox(pos.coords.latitude), lng: roundApprox(pos.coords.longitude) };
        setLocalizando(false);
        setReference({ ...ponto, kind: 'gps' });
        const m = mapRef.current;
        const raio = estadoRef.current.filters.radius ?? DEFAULT_RADIUS_M;
        m?.fitBounds(circleBounds(ponto, raio), { padding: 48, duration: REDUZIR_MOVIMENTO() ? 0 : 600 });
      },
      (err) => {
        setLocalizando(false);
        const msgs: Record<number, string> = {
          1: 'Você não permitiu o acesso à localização. Busque um bairro, cidade ou CEP.',
          2: 'Não conseguimos descobrir onde você está. Busque um bairro, cidade ou CEP.',
          3: 'A localização demorou demais. Tente de novo ou busque um bairro, cidade ou CEP.',
        };
        setGeoMsg(msgs[err.code] ?? 'Não foi possível obter sua localização.');
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }, []);

  const tentouGps = useRef(false);
  useEffect(() => {
    if (!map || !autoLocate || tentouGps.current) return;
    tentouGps.current = true;
    localizar();
  }, [map, autoLocate, localizar]);

  // Mudou o raio: enquadra o círculo novo em volta da referência.
  const raioAnterior = useRef(filters.radius);
  useEffect(() => {
    if (!map) return;
    if (raioAnterior.current !== filters.radius && filters.radius) {
      map.fitBounds(circleBounds(reference, filters.radius), { padding: 48, duration: REDUZIR_MOVIMENTO() ? 0 : 500 });
    }
    raioAnterior.current = filters.radius;
  }, [map, filters.radius, reference]);

  // ---- Prévia: dados do marcador na hora; foto e características vêm de uma segunda chamada.
  const idSelecionado = selecionado?.id ?? null;
  useEffect(() => {
    if (!idSelecionado) return;
    const ctl = new AbortController();
    fetch(`/api/mapa/previa/${idSelecionado}`, { signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<MapPreview>) : Promise.reject(new Error(String(r.status)))))
      .then((data) => setPreviaEstado({ id: idSelecionado, data, falhou: false }))
      .catch((err) => {
        if ((err as { name?: string }).name !== 'AbortError') setPreviaEstado({ id: idSelecionado, data: null, falhou: true });
      });
    return () => ctl.abort();
  }, [idSelecionado]);

  // Toque no vazio do mapa fecha a prévia.
  useEffect(() => {
    if (!map) return;
    const aoClicar = (e: { originalEvent: MouseEvent }) => {
      const alvo = e.originalEvent?.target as HTMLElement | null;
      if (alvo?.closest?.('[data-marcador]')) return;
      setSelecionado(null);
    };
    map.on('click', aoClicar);
    return () => {
      map.off('click', aoClicar);
    };
  }, [map]);

  // ---- Endereço da página acompanha os filtros (sem guardar a posição do GPS: é só da pessoa).
  useEffect(() => {
    const p = new URLSearchParams();
    if (reference.kind === 'busca') {
      p.set('lat', String(reference.lat));
      p.set('lng', String(reference.lng));
      p.set('local', fallback.label);
    }
    p.set('raio', filters.radius ? String(filters.radius) : 'todos');
    if (filters.priceMaxCents) p.set('preco', String(filters.priceMaxCents));
    if (filters.categories.length > 0) p.set('tipos', filters.categories.join(','));
    if (filters.availableNow) p.set('disp', '1');
    try {
      window.history.replaceState(null, '', `/mapa?${p.toString()}`);
    } catch {
      // Sem permissão para mexer no histórico: a página continua funcionando.
    }
  }, [filters, reference, fallback.label]);

  const aproximar = useCallback((c: ExploreCluster) => {
    const m = mapRef.current;
    if (!m) return;
    const [w, s, e, n] = c.bounds;
    const duration = REDUZIR_MOVIMENTO() ? 0 : 450;
    if (e - w < 1e-6 && n - s < 1e-6) {
      m.easeTo({ center: [c.lng, c.lat], zoom: Math.min(m.getZoom() + 3, 19), duration });
    } else {
      m.fitBounds([[w, s], [e, n]], { padding: 90, maxZoom: 18, duration });
    }
  }, []);

  const limparFiltros = useCallback(() => {
    setFilters({ ...NO_FILTERS, radius: DEFAULT_RADIUS_M });
  }, []);

  const listHref = useMemo(() => {
    const p = new URLSearchParams();
    p.set('lat', String(reference.lat));
    p.set('lng', String(reference.lng));
    if (filters.radius) p.set('raio', String(filters.radius));
    if (filters.priceMaxCents) p.set('precoMax', String(filters.priceMaxCents / 100));
    if (filters.categories.length > 0) p.set('tipos', typesOfCategories(filters.categories).join(','));
    if (filters.availableNow) p.set('disponivel', '1');
    return `/espacos?${p.toString()}`;
  }, [reference, filters]);

  const nFiltros = activeFilterCount(filters, DEFAULT_RADIUS_M);
  const painel = (
    <ExploreFiltersPanel
      filters={filters}
      onChange={setFilters}
      onClear={limparFiltros}
      referenceLabel={rotuloReferencia}
      usingGps={reference.kind === 'gps'}
      onLocate={localizar}
      locating={localizando}
      geoMessage={geoMsg}
      total={data?.total ?? null}
      outsideShown={data?.outsideShown ?? 0}
      reachShown={data?.reachShown ?? 0}
      onClose={() => setPainelAberto(false)}
      listHref={listHref}
    />
  );

  const vazio = data != null && !loading && data.total === 0 && data.outsideShown === 0 && data.reachShown === 0;

  return (
    <div className="relative size-full overflow-hidden bg-[var(--surface-sunken)]" data-testid="explorar-mapa">
      <div ref={containerRef} data-testid="mapa-exploracao" className="absolute inset-0 w-full h-full" />

      {!map && !tileError && (
        <div className="absolute inset-0 grid place-items-center bg-[var(--surface-sunken)]">
          <LoaderCircle className="size-5 animate-spin text-[var(--content-muted)]" aria-hidden />
          <span className="sr-only">Carregando mapa</span>
        </div>
      )}

      {/* Filtros: coluna fixa no computador, folha de baixo no celular. */}
      <aside
        className="hidden lg:block absolute left-4 top-4 bottom-4 z-10 w-[22rem] overflow-y-auto rounded-[var(--radius-card)] border bg-[var(--surface)] shadow-[var(--shadow-overlay)] p-4"
        aria-label="Filtros do mapa"
      >
        {painel}
      </aside>

      {painelAberto && (
        <>
          <button
            type="button" aria-label="Fechar filtros" onClick={() => setPainelAberto(false)}
            className="lg:hidden absolute inset-0 z-20 bg-black/35"
          />
          <aside
            className="lg:hidden absolute inset-x-0 bottom-0 z-30 max-h-[85%] overflow-y-auto rounded-t-2xl border-t bg-[var(--surface)] shadow-[var(--shadow-overlay)] p-4 pb-6"
            aria-label="Filtros do mapa"
          >
            {painel}
          </aside>
        </>
      )}

      {/* Barra do celular: filtros e contagem. */}
      <div className="lg:hidden absolute left-3 top-3 right-16 z-10 flex items-center gap-2">
        <button
          type="button" onClick={() => setPainelAberto(true)} data-testid="abrir-filtros"
          className="inline-flex items-center gap-2 h-10 px-3.5 rounded-[var(--radius-pill)] border bg-[var(--surface)] shadow-[var(--shadow-raised)] text-[0.875rem] font-medium"
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          Filtros
          {nFiltros > 0 && (
            <span className="min-w-5 h-5 px-1 grid place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-content)] text-[0.6875rem] tabular-nums">
              {nFiltros}
            </span>
          )}
        </button>
        <p
          className="inline-flex items-center gap-1.5 h-10 px-3 rounded-[var(--radius-pill)] border bg-[var(--surface)] shadow-[var(--shadow-raised)] text-[0.8125rem] text-[var(--content-muted)] min-w-0"
          role="status" aria-live="polite" data-testid="contagem-barra"
        >
          {loading && <LoaderCircle className="size-3.5 animate-spin shrink-0" aria-hidden />}
          <span className="truncate">
            {data == null ? 'Carregando…' : `${data.total} ${data.total === 1 ? 'espaço' : 'espaços'}${filters.radius ? ` a até ${filters.radius / 1000} km` : ''}`}
          </span>
        </p>
      </div>

      {/* Controles à direita, abaixo do zoom do mapa. */}
      <div className="absolute right-3 top-[5.5rem] z-10 flex flex-col gap-2">
        <button
          type="button" onClick={localizar} aria-label="Ir para a minha localização" title="Minha localização"
          data-testid="minha-localizacao" disabled={localizando}
          className="size-10 grid place-items-center rounded-[var(--radius-field)] border bg-[var(--surface)] shadow-[var(--shadow-raised)] hover:bg-[var(--surface-sunken)] disabled:opacity-60"
        >
          {localizando ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <LocateFixed className="size-5" aria-hidden />}
        </button>
        <button
          type="button"
          onClick={() => trocarBase(basemap === 'satellite' ? 'streets' : 'satellite')}
          disabled={!satelite}
          aria-label={satelite ? (basemap === 'satellite' ? 'Mostrar mapa de ruas' : 'Mostrar imagem aérea') : 'Imagem aérea indisponível'}
          title={satelite ? (basemap === 'satellite' ? 'Mapa de ruas' : 'Imagem aérea') : 'A imagem aérea ainda não está disponível'}
          data-testid="alternar-satelite"
          className="size-10 grid place-items-center rounded-[var(--radius-field)] border bg-[var(--surface)] shadow-[var(--shadow-raised)] hover:bg-[var(--surface-sunken)] disabled:opacity-50"
        >
          <Layers className="size-5" aria-hidden />
        </button>
      </div>

      {/* Avisos */}
      <div className="absolute z-10 inset-x-3 top-16 lg:left-[23.5rem] lg:right-16 lg:top-4 space-y-2 pointer-events-none">
        {notice && (
          <p role="status" className="pointer-events-auto rounded-[var(--radius-field)] border bg-[var(--surface)] px-3 py-2 text-[0.8125rem] shadow-[var(--shadow-raised)]">
            {notice}
          </p>
        )}
        {reference.kind === 'padrao' && (
          <p role="status" className="pointer-events-auto rounded-[var(--radius-field)] border bg-[var(--surface)] px-3 py-2 text-[0.8125rem] text-[var(--content-muted)] shadow-[var(--shadow-raised)]" data-testid="aviso-regiao-padrao">
            Mostrando {fallback.label}. Permita a localização ou busque um bairro, cidade ou CEP para ver perto de você.
          </p>
        )}
        {geoMsg && painelAberto === false && (
          <p role="alert" className="pointer-events-auto rounded-[var(--radius-field)] border bg-[var(--surface)] px-3 py-2 text-[0.8125rem] text-[var(--color-caution)] shadow-[var(--shadow-raised)]">
            {geoMsg}
          </p>
        )}
        {!satelite && (
          <p className="pointer-events-auto hidden rounded-[var(--radius-field)] border bg-[var(--surface)] px-3 py-1.5 text-[0.75rem] text-[var(--content-muted)] shadow-[var(--shadow-raised)] lg:block" data-testid="aviso-sem-satelite">
            Imagem aérea ainda não disponível: o mapa mostra o desenho das ruas.
          </p>
        )}
        {loadError && (
          <p role="alert" className="pointer-events-auto flex items-center justify-between gap-3 rounded-[var(--radius-field)] border border-[var(--color-critical)] bg-[var(--surface)] px-3 py-2 text-[0.8125rem] shadow-[var(--shadow-raised)]">
            Não foi possível carregar os espaços desta área.
            <button type="button" onClick={() => void carregar()} className="font-medium underline underline-offset-4">Tentar de novo</button>
          </p>
        )}
        {tileError && (
          <p role="status" className="pointer-events-auto rounded-[var(--radius-field)] border bg-[var(--surface)] px-3 py-2 text-[0.8125rem] text-[var(--content-muted)] shadow-[var(--shadow-raised)]">
            Parte do mapa não carregou. Os espaços continuam disponíveis em lista.
          </p>
        )}
        {vazio && !loadError && (
          <p role="status" className="pointer-events-auto rounded-[var(--radius-field)] border bg-[var(--surface)] px-3 py-2 text-[0.8125rem] shadow-[var(--shadow-raised)]" data-testid="mapa-vazio">
            Nenhum espaço nesta área com esses filtros. Afaste o mapa, aumente a distância ou limpe os filtros.
          </p>
        )}
      </div>

      {/* Prévia do espaço tocado */}
      {selecionado && (
        <div className="absolute z-20 inset-x-3 bottom-3 sm:left-auto sm:right-auto sm:w-[26rem] sm:left-3 lg:left-[23.5rem]">
          <ExplorePreview
            pin={selecionado}
            preview={previa}
            previewFailed={previaFalhou}
            reference={reference}
            referenceLabel={rotuloReferencia}
            onClose={() => setSelecionado(null)}
          />
        </div>
      )}

      {/* Marcadores (cada um é um botão do React dentro de um elemento do MapLibre). */}
      {map && (
        <>
          <Marcador map={map} lat={reference.lat} lng={reference.lng}>
            <div className="myplace-ref-point" role="img" aria-label={reference.kind === 'gps' ? 'Sua localização aproximada' : `Centro da busca: ${fallback.label}`} />
          </Marcador>
          {data?.clusters.map((c) => (
            <Marcador key={`g:${c.lat.toFixed(4)}:${c.lng.toFixed(4)}:${c.count}`} map={map} lat={c.lat} lng={c.lng}>
              <ClusterView cluster={c} onZoom={() => aproximar(c)} />
            </Marcador>
          ))}
          {data?.pins.map((p) => (
            <Marcador key={p.id} map={map} lat={p.lat} lng={p.lng} elevado={selecionado?.id === p.id}>
              <PinView pin={p} selecionado={selecionado?.id === p.id} onSelect={() => setSelecionado(p)} />
            </Marcador>
          ))}
        </>
      )}
    </div>
  );
}

/**
 * Um marcador do MapLibre cujo conteúdo é desenhado pelo React (portal). Chave
 * estável = o marcador sobrevive às atualizações de dados; só entra e sai quem
 * de fato entrou ou saiu da resposta.
 */
function Marcador({
  map, lat, lng, elevado = false, children,
}: { map: MapLibreMap; lat: number; lng: number; elevado?: boolean; children: React.ReactNode }) {
  const [el] = useState(() => document.createElement('div'));
  const marcadorRef = useRef<Marker | null>(null);

  useEffect(() => {
    const marcador = new Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map);
    marcadorRef.current = marcador;
    return () => {
      marcador.remove();
      marcadorRef.current = null;
    };
    // A posição é atualizada pelo efeito abaixo; recriar o marcador a cada mudança piscaria.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, el]);

  useEffect(() => {
    marcadorRef.current?.setLngLat([lng, lat]);
  }, [lat, lng]);

  useEffect(() => {
    // O selecionado fica por cima dos vizinhos.
    const alvo = marcadorRef.current?.getElement();
    if (alvo) alvo.style.zIndex = elevado ? '10' : '';
  }, [elevado]);

  return createPortal(children, el);
}

/** Marcador de um espaço: ícone da categoria + valor mensal. Destaque em azul cheio; fora do raio, borda tracejada. */
function PinView({ pin, selecionado, onSelect }: { pin: ExplorePin; selecionado: boolean; onSelect: () => void }) {
  const preco = pin.priceMonthlyCents != null ? formatBRLShort(pin.priceMonthlyCents) : 'Ver';
  const destaque = pin.promotion != null;
  return (
    <button
      type="button"
      data-marcador
      data-testid="pino-espaco"
      data-categoria={pin.category}
      data-fora-do-raio={pin.outside || undefined}
      aria-label={`${categoryLabel(pin.category)}: ${pin.title}, ${preco} por mês${destaque ? ', em destaque' : ''}${pin.outside ? ', fora do raio escolhido' : ''}`}
      aria-pressed={selecionado}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className={cn(
        'relative flex items-center gap-1.5 rounded-full border-2 pl-1 pr-2.5 py-1 text-[0.75rem] font-semibold tabular-nums leading-none',
        'shadow-[0_1px_5px_rgb(0_0_0/0.4)] transition-transform duration-150 before:absolute before:-inset-2 before:content-[""]',
        selecionado
          ? 'scale-110 bg-[#14213d] text-white border-white'
          : destaque
            ? 'bg-[var(--accent)] text-[var(--accent-content)] border-white'
            : 'bg-white text-[#14213d] border-white',
        pin.outside && !selecionado && 'border-dashed !border-[var(--accent)]',
      )}
    >
      <span
        className={cn(
          'grid size-5 place-items-center rounded-full',
          selecionado ? 'bg-white text-[#14213d]' : destaque ? 'bg-white text-[var(--accent)]' : 'bg-[var(--accent)] text-[var(--accent-content)]',
        )}
      >
        <CategoryIcon category={pin.category} className="size-3" />
      </span>
      <span>{preco}</span>
    </button>
  );
}

/** Círculo com a contagem de espaços do grupo; tocar aproxima o mapa. */
function ClusterView({ cluster, onZoom }: { cluster: ExploreCluster; onZoom: () => void }) {
  const n = cluster.count;
  return (
    <button
      type="button"
      data-marcador
      data-testid="grupo-mapa"
      aria-label={`${n} espaços nesta região. Toque para aproximar.`}
      onClick={(e) => {
        e.stopPropagation();
        onZoom();
      }}
      className={cn(
        'relative grid place-items-center rounded-full border-2 border-white bg-[var(--accent)] text-[var(--accent-content)] font-semibold tabular-nums',
        'shadow-[0_1px_6px_rgb(0_0_0/0.4)] before:absolute before:-inset-1.5 before:content-[""]',
        n < 10 ? 'size-9 text-[0.8125rem]' : n < 100 ? 'size-11 text-[0.875rem]' : 'size-14 text-[0.9375rem]',
      )}
    >
      {n}
    </button>
  );
}
