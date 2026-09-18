'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Map as MapLibreMap,
  LngLatBounds,
  Marker,
  NavigationControl,
  Popup,
} from 'maplibre-gl';
import { LoaderCircle, LocateFixed, Map as MapIcon, X } from 'lucide-react';
import { getTileSource, DEFAULT_CENTER, DEFAULT_ZOOM } from '@/lib/maps/config';
import { formatBRL } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import 'maplibre-gl/dist/maplibre-gl.css';

export type MapSpace = {
  id: string;
  slug: string;
  title: string;
  typeLabel: string;
  priceMonthlyCents: number;
  district: string | null;
  city: string | null;
  /** Ponto APROXIMADO, vindo de `approx_location`. Nunca o exato. */
  lat: number;
  lng: number;
};

/**
 * O motor do mapa: inicializa, desenha marcadores, abre balão ao clicar.
 *
 * NÃO decide sozinho quando aparecer — isso é responsabilidade de quem
 * renderiza (`ResultsMap` no desktop sempre montado; `MobileMapToggle` no
 * celular, só quando a pessoa pede). Essa separação existe porque o
 * comportamento certo é DIFERENTE nos dois casos: no desktop o mapa é parte
 * fixa da tela de resultados (como Zillow/Airbnb); no celular, carregar
 * tiles de um mapa que ninguém pediu gasta dado de graça, então ele só
 * nasce quando a pessoa toca em "Ver mapa".
 *
 * Os marcadores saem do banco: cada um é um anúncio `published`, na
 * coordenada APROXIMADA (`approx_location`, deslocada ~200-400m por
 * trigger). O ponto exato nunca chega ao navegador — a consulta pública nem
 * o seleciona. Por isso os marcadores não ficam mais precisos ao dar zoom:
 * a imprecisão é proposital.
 */
export function ResultsMap({
  spaces,
  referencePoint,
  className,
}: {
  spaces: MapSpace[];
  /**
   * Onde a pessoa buscou (GPS, CEP ou endereço geocodificado). Mostrado como
   * um ponto distinto dos anúncios. Ausente quando a busca foi só por texto
   * (cidade/bairro batendo direto no banco) — nesse caso não existe um ponto
   * exato para desenhar, só resultados.
   */
  referencePoint?: { lat: number; lng: number } | null;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const refMarkerRef = useRef<Marker | null>(null);

  const [ready, setReady] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const comCoordenada = spaces.filter(
    (s) => Number.isFinite(s.lat) && Number.isFinite(s.lng),
  );

  // Inicializa o mapa uma vez, no primeiro render em que existe container.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const source = getTileSource();
    const centro = referencePoint ?? DEFAULT_CENTER;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: source.style as never,
      center: [centro.lng, centro.lat],
      zoom: referencePoint ? 13 : DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });

    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => setReady(true));
    map.on('error', () => setTileError(true));

    mapRef.current = map;

    return () => {
      popupRef.current?.remove();
      popupRef.current = null;
      refMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // Só na montagem: o centro inicial não deve reagir a re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marcadores dos anúncios + enquadramento.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const marcadores: Marker[] = [];

    for (const s of comCoordenada) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'myplace-map-pin';
      el.setAttribute('aria-label', `${s.title} — ${formatBRL(s.priceMonthlyCents)} por mês`);
      el.textContent = formatBRL(s.priceMonthlyCents).replace(/\s/g, ' ');

      const marker = new Marker({ element: el, anchor: 'bottom' })
        .setLngLat([s.lng, s.lat])
        .addTo(map);

      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        popupRef.current?.remove();
        popupRef.current = new Popup({
          offset: 18,
          closeButton: true,
          maxWidth: '260px',
          className: 'myplace-popup',
        })
          .setLngLat([s.lng, s.lat])
          // Montado como nó, e nao como string de HTML: titulo de anuncio e
          // texto de usuario e nao deve virar markup.
          .setDOMContent(popupContent(s))
          .addTo(map);
      });

      marcadores.push(marker);
    }

    // O enquadramento so olha para os anuncios quando NAO ha um ponto de
    // referencia: se a pessoa buscou "perto de mim", o mapa fica centrado
    // nela, nao nos resultados — senao o ponto buscado sai da tela quando
    // o resultado mais proximo esta a 4 km de distancia.
    if (!referencePoint) {
      if (comCoordenada.length === 1) {
        const so = comCoordenada[0]!;
        map.jumpTo({ center: [so.lng, so.lat], zoom: 14 });
      } else if (comCoordenada.length > 1) {
        const bounds = new LngLatBounds();
        for (const s of comCoordenada) bounds.extend([s.lng, s.lat]);
        map.fitBounds(bounds, { padding: 56, maxZoom: 15, duration: 0 });
      }
    }

    return () => {
      for (const m of marcadores) m.remove();
    };
    // `comCoordenada` e derivado de `spaces` em cada render; a dependencia
    // real e a lista de anuncios.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, spaces, referencePoint]);

  // Ponto de referencia da busca — visualmente diferente dos precos.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    refMarkerRef.current?.remove();
    refMarkerRef.current = null;

    if (!referencePoint) return;

    const el = document.createElement('div');
    el.className = 'myplace-ref-point';
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'Local buscado');
    refMarkerRef.current = new Marker({ element: el, anchor: 'center' })
      .setLngLat([referencePoint.lng, referencePoint.lat])
      .addTo(map);

    map.easeTo({ center: [referencePoint.lng, referencePoint.lat], zoom: 13, duration: 500 });
  }, [ready, referencePoint]);

  function usarGps() {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGeoError('Este navegador não oferece localização.');
      return;
    }
    setLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        mapRef.current?.easeTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 13,
          duration: 700,
        });
      },
      (err) => {
        setLocating(false);
        const msgs: Record<number, string> = {
          1: 'Você não permitiu o acesso à localização. Use o mapa para navegar.',
          2: 'Não conseguimos determinar sua posição. Use o mapa para navegar.',
          3: 'A localização demorou demais. Use o mapa para navegar.',
        };
        setGeoError(msgs[err.code] ?? 'Não foi possível obter sua localização.');
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className={cn('relative flex flex-col gap-2', className)}>
      <div className="relative flex-1 min-h-0">
        <div
          ref={containerRef}
          data-testid="mapa-espacos"
          /*
           * `w-full h-full`, e nao so `absolute inset-0`: o proprio CSS do
           * maplibre-gl define `.maplibregl-map { position: relative }`, e
           * essa regra concorre com o `.absolute` do Tailwind pela mesma
           * propriedade — quem carrega por ultimo no HTML vence, o que ja
           * observamos na pratica vencer para o maplibre e colapsar este
           * container pra altura 0. `w-full h-full` funciona nos dois casos
           * (`position: absolute` ou `relative`), porque o pai imediato e um
           * item flex com altura resolvida — nao depende de vencer a guerra
           * de especificidade contra uma biblioteca externa.
           */
          className="absolute inset-0 w-full h-full rounded-[var(--radius-card)] overflow-hidden border bg-[var(--surface-sunken)]"
        />

        {!ready && !tileError && (
          <div className="absolute inset-0 grid place-items-center rounded-[var(--radius-card)] bg-[var(--surface-sunken)]">
            <LoaderCircle className="size-5 animate-spin text-[var(--content-muted)]" aria-hidden />
            <span className="sr-only">Carregando mapa</span>
          </div>
        )}

        {tileError && (
          <div className="absolute inset-x-0 bottom-0 m-3 p-3 rounded-[var(--radius-field)] bg-[var(--surface)] border text-[0.8125rem] text-[var(--content-muted)]">
            Parte do mapa não carregou. A lista continua completa.
          </div>
        )}

        {ready && (
          <div className="absolute left-3 bottom-3">
            <Button type="button" variant="secondary" size="sm" onClick={usarGps} loading={locating}>
              {!locating && <LocateFixed className="size-4" aria-hidden />}
              {locating ? 'Localizando…' : 'Perto de mim'}
            </Button>
          </div>
        )}

        {ready && comCoordenada.length > 0 && (
          <p className="absolute right-3 bottom-3 max-w-[13rem] px-2.5 py-1.5 rounded-[var(--radius-field)] bg-[var(--surface)]/95 border text-[0.6875rem] leading-snug text-[var(--content-muted)]">
            Marcadores mostram a região do espaço, não o endereço exato.
          </p>
        )}
      </div>

      {geoError && (
        <p role="alert" className="text-[0.8125rem] text-[var(--color-caution)]">{geoError}</p>
      )}
    </div>
  );
}

/**
 * Alternância Lista/Mapa do celular.
 *
 * O mapa só monta quando a pessoa toca em "Ver mapa": nasce dentro de um
 * overlay em tela cheia, e some (desmonta de verdade, não só CSS `hidden`)
 * ao fechar — para não gastar tile de mapa que ninguém pediu.
 */
export function MobileMapToggle({
  spaces,
  referencePoint,
}: {
  spaces: MapSpace[];
  referencePoint?: { lat: number; lng: number } | null;
}) {
  const [aberto, setAberto] = useState(false);
  const comCoordenada = spaces.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));

  if (comCoordenada.length === 0) return null;

  return (
    <div className="lg:hidden">
      {!aberto && (
        <button
          type="button"
          onClick={() => setAberto(true)}
          data-testid="abrir-mapa"
          className={cn(
            'fixed bottom-5 left-1/2 -translate-x-1/2 z-40',
            'inline-flex items-center gap-2 h-11 px-5 rounded-[var(--radius-pill)]',
            'bg-[var(--content)] text-[var(--surface)] shadow-[var(--shadow-raised)]',
            'font-medium text-[0.875rem]',
          )}
        >
          <MapIcon className="size-4" aria-hidden />
          Ver mapa
        </button>
      )}

      {aberto && (
        <div
          data-testid="mapa-mobile-overlay"
          className="fixed inset-0 z-50 flex flex-col bg-[var(--surface)]"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <p className="text-[0.8125rem] text-[var(--content-muted)]">
              {comCoordenada.length} {comCoordenada.length === 1 ? 'espaço' : 'espaços'} no mapa
            </p>
            <button
              type="button"
              onClick={() => setAberto(false)}
              data-testid="fechar-mapa-mobile"
              className="inline-flex items-center gap-1.5 text-[0.875rem] font-medium"
            >
              <X className="size-4" aria-hidden />
              Ver lista
            </button>
          </div>
          <ResultsMap
            spaces={spaces}
            referencePoint={referencePoint}
            className="flex-1 [&>div]:rounded-none [&>div>div]:rounded-none [&>div>div]:border-0"
          />
        </div>
      )}
    </div>
  );
}

/** Conteúdo do balão de um marcador. Só texto e um link para o anúncio. */
function popupContent(s: MapSpace): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'space-y-1';

  const tipo = document.createElement('p');
  tipo.className = 'text-[0.6875rem] font-medium uppercase tracking-wide text-[var(--accent)]';
  tipo.textContent = s.typeLabel;

  const titulo = document.createElement('p');
  titulo.className = 'font-medium leading-snug text-[0.875rem]';
  titulo.textContent = s.title;

  const local = document.createElement('p');
  local.className = 'text-[0.8125rem] text-[var(--content-muted)]';
  local.textContent = [s.district, s.city].filter(Boolean).join(', ');

  const preco = document.createElement('p');
  preco.className = 'text-[0.875rem]';
  const valor = document.createElement('span');
  valor.className = 'font-semibold tabular-nums';
  valor.textContent = formatBRL(s.priceMonthlyCents);
  preco.append(valor, document.createTextNode(' /mês'));

  const link = document.createElement('a');
  link.href = `/espacos/${s.slug}`;
  link.className =
    'inline-block mt-1 text-[0.8125rem] text-[var(--accent)] underline underline-offset-4';
  link.textContent = 'Ver anúncio';
  link.setAttribute('data-testid', 'popup-ver-anuncio');

  wrap.append(tipo, titulo, local, preco, link);
  return wrap;
}
