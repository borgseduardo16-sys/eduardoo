'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  type MapMouseEvent,
} from 'maplibre-gl';
import { LoaderCircle, LocateFixed, MapPin } from 'lucide-react';
import { getTileSource, DEFAULT_CENTER, DEFAULT_ZOOM, PIN_ZOOM } from '@/lib/maps/config';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import 'maplibre-gl/dist/maplibre-gl.css';

export type LatLng = { lat: number; lng: number };

/**
 * Seletor de localização no mapa.
 *
 * Três formas de marcar o ponto, porque nenhuma funciona sempre:
 *   1. GPS do navegador — precisa de permissão, e nem sempre é concedida
 *   2. Clique no mapa
 *   3. Arrastar o pino
 *
 * Quando o endereço muda (por CEP), o mapa recentraliza mas **não move o
 * pino sozinho**: CEP no Brasil pode cobrir uma rua inteira, e mover o pino
 * automaticamente daria a impressão de precisão que o dado não tem. Quem
 * confirma o ponto exato é a pessoa.
 */
export function LocationPicker({
  value,
  onChange,
  centerHint,
  className,
}: {
  value: LatLng | null;
  onChange: (next: LatLng) => void;
  /** Recentraliza o mapa sem mexer no pino (ex.: depois de buscar o CEP). */
  centerHint?: LatLng | null;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  /*
   * Guarda a versao mais recente de `onChange` para os handlers do mapa, que
   * sao registrados uma vez so na montagem. Sem isto, eles fechariam sobre o
   * `onChange` do primeiro render e parariam de refletir o estado atual.
   * A atribuicao vai em efeito porque escrever em ref durante o render e
   * efeito colateral em fase de render.
   */
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const [ready, setReady] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Inicializa o mapa uma vez só.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const source = getTileSource();
    const map = new MapLibreMap({
      container: containerRef.current,
      // O estilo e montado em runtime (OSM ou MapTiler), entao o tipo exato
      // so e conhecido ali — ver src/lib/maps/config.ts.
      style: source.style as never,
      center: [value?.lng ?? DEFAULT_CENTER.lng, value?.lat ?? DEFAULT_CENTER.lat],
      zoom: value ? PIN_ZOOM : DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });

    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => setReady(true));
    map.on('error', () => setTileError(true));
    map.on('click', (e: MapMouseEvent) =>
      onChangeRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng }),
    );

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Só na montagem: `value` entra pelo efeito seguinte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincroniza o pino com o valor vindo de fora.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    if (!markerRef.current) {
      const el = document.createElement('div');
      el.className = 'myplace-pin';
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', 'Local do espaço');

      const marker = new Marker({ element: el, draggable: true, anchor: 'bottom' })
        .setLngLat([value.lng, value.lat])
        .addTo(map);

      marker.on('dragend', () => {
        const p = marker.getLngLat();
        onChangeRef.current({ lat: p.lat, lng: p.lng });
      });

      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat([value.lng, value.lat]);
    }
  }, [value, ready]);

  // Recentraliza quando o endereço muda, sem tocar no pino.
  useEffect(() => {
    if (!centerHint || !mapRef.current || !ready) return;
    mapRef.current.easeTo({
      center: [centerHint.lng, centerHint.lat],
      zoom: PIN_ZOOM,
      duration: 700,
    });
  }, [centerHint, ready]);

  function usarGps() {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGeoError('Este navegador não oferece localização. Marque o ponto no mapa.');
      return;
    }
    setLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        onChangeRef.current(next);
        mapRef.current?.easeTo({ center: [next.lng, next.lat], zoom: PIN_ZOOM, duration: 700 });
      },
      (err) => {
        setLocating(false);
        const msgs: Record<number, string> = {
          1: 'Você não permitiu o acesso à localização. Marque o ponto tocando no mapa.',
          2: 'Não conseguimos determinar sua posição. Marque o ponto tocando no mapa.',
          3: 'A localização demorou demais. Marque o ponto tocando no mapa.',
        };
        setGeoError(msgs[err.code] ?? 'Não foi possível obter sua localização.');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="relative">
        <div
          ref={containerRef}
          className="h-72 sm:h-80 w-full rounded-[var(--radius-card)] overflow-hidden border bg-[var(--surface-sunken)]"
        />

        {!ready && !tileError && (
          <div className="absolute inset-0 grid place-items-center rounded-[var(--radius-card)] bg-[var(--surface-sunken)]">
            <LoaderCircle className="size-5 animate-spin text-[var(--content-muted)]" aria-hidden />
            <span className="sr-only">Carregando mapa</span>
          </div>
        )}

        {tileError && (
          <div className="absolute inset-0 grid place-items-center p-6 rounded-[var(--radius-card)] bg-[var(--surface-sunken)] text-center">
            <div className="space-y-2">
              <MapPin className="size-5 mx-auto text-[var(--content-muted)]" aria-hidden />
              <p className="text-[0.875rem] text-[var(--content-muted)] max-w-xs">
                O mapa não carregou. Você ainda pode usar o botão de localização abaixo para
                marcar o ponto.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={usarGps} loading={locating}>
          {!locating && <LocateFixed className="size-4" aria-hidden />}
          {locating ? 'Obtendo localização…' : 'Usar minha localização'}
        </Button>

        {value ? (
          <span className="text-[0.8125rem] text-[var(--color-positive)]">
            Ponto marcado
          </span>
        ) : (
          <span className="text-[0.8125rem] text-[var(--content-muted)]">
            Toque no mapa para marcar o local exato
          </span>
        )}
      </div>

      {geoError && <Alert tone="warning">{geoError}</Alert>}

      <p className="text-[0.75rem] text-[var(--content-subtle)] leading-relaxed">
        Marque o ponto exato do espaço. Ele fica guardado só para você e para quem alugar —
        no mapa público, mostramos uma posição aproximada da região.
      </p>
    </div>
  );
}
