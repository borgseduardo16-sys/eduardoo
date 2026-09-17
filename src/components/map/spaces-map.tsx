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
 * Mapa do marketplace.
 *
 * Os marcadores saem do banco: cada um e um anuncio `published`, na coordenada
 * APROXIMADA (`approx_location`, deslocada ~200-400m por trigger). O ponto
 * exato nao chega ao navegador — a consulta publica nem o seleciona.
 *
 * Por isso os marcadores nao ficam mais precisos ao dar zoom: a imprecisao e
 * proposital. Quem reserva recebe o endereco exato depois.
 *
 * O mapa so monta quando a pessoa abre. Num celular, carregar tiles de um
 * mapa que ninguem pediu gasta dado de graca.
 */
export function SpacesMap({ spaces }: { spaces: MapSpace[] }) {
  const [aberto, setAberto] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);

  const [ready, setReady] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const comCoordenada = spaces.filter(
    (s) => Number.isFinite(s.lat) && Number.isFinite(s.lng),
  );

  useEffect(() => {
    if (!aberto || !containerRef.current || mapRef.current) return;

    const source = getTileSource();
    const map = new MapLibreMap({
      container: containerRef.current,
      style: source.style as never,
      center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });

    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => setReady(true));
    map.on('error', () => setTileError(true));

    mapRef.current = map;

    return () => {
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [aberto]);

  // Marcadores + enquadramento.
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
          // Nos montamos o conteudo como no, e nao como string de HTML:
          // titulo de anuncio e texto de usuario e nao deve virar markup.
          .setDOMContent(popupContent(s))
          .addTo(map);
      });

      marcadores.push(marker);
    }

    if (comCoordenada.length === 1) {
      const so = comCoordenada[0]!;
      map.jumpTo({ center: [so.lng, so.lat], zoom: 14 });
    } else if (comCoordenada.length > 1) {
      const bounds = new LngLatBounds();
      for (const s of comCoordenada) bounds.extend([s.lng, s.lat]);
      map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 0 });
    }

    return () => {
      for (const m of marcadores) m.remove();
    };
    // `comCoordenada` e derivado de `spaces` em cada render; a dependencia
    // real e a lista de anuncios.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, spaces]);

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

  if (comCoordenada.length === 0) return null;

  if (!aberto) {
    return (
      <Button
        type="button"
        variant="secondary"
        onClick={() => setAberto(true)}
        data-testid="abrir-mapa"
        className="w-full sm:w-auto"
      >
        <MapIcon className="size-4" aria-hidden />
        Ver no mapa ({comCoordenada.length})
      </Button>
    );
  }

  return (
    <section aria-label="Mapa dos espaços" className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.8125rem] text-[var(--content-muted)]">
          Cada marcador mostra a <strong className="font-medium">região</strong> do espaço, não o
          endereço. O endereço exato é combinado após a reserva.
        </p>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="shrink-0 inline-flex items-center gap-1 text-[0.8125rem] text-[var(--content-muted)] hover:text-[var(--content)]"
        >
          <X className="size-3.5" aria-hidden />
          Fechar mapa
        </button>
      </div>

      <div className="relative">
        <div
          ref={containerRef}
          data-testid="mapa-espacos"
          className="h-[22rem] sm:h-[26rem] w-full rounded-[var(--radius-card)] overflow-hidden border bg-[var(--surface-sunken)]"
        />

        {!ready && !tileError && (
          <div className="absolute inset-0 grid place-items-center rounded-[var(--radius-card)] bg-[var(--surface-sunken)]">
            <LoaderCircle className="size-5 animate-spin text-[var(--content-muted)]" aria-hidden />
            <span className="sr-only">Carregando mapa</span>
          </div>
        )}

        {tileError && (
          <div className="absolute inset-x-0 bottom-0 m-3 p-3 rounded-[var(--radius-field)] bg-[var(--surface)] border text-[0.8125rem] text-[var(--content-muted)]">
            Parte do mapa não carregou. A lista abaixo continua completa.
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
      </div>

      {geoError && (
        <p role="alert" className="text-[0.8125rem] text-[var(--color-caution)]">{geoError}</p>
      )}
    </section>
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
