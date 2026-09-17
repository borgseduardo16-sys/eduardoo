'use client';

import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl';
import { MapPin } from 'lucide-react';
import { getTileSource } from '@/lib/maps/config';
import { cn } from '@/lib/utils';
import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * Mapa da região aproximada de um anúncio.
 *
 * Desenha um CÍRCULO sombreado, não um pino — e essa escolha é o ponto do
 * componente. Pino comunica "é exatamente aqui"; a coordenada que temos aqui
 * é deslocada de propósito, então um pino prometeria uma precisão que o dado
 * não tem, e deixaria quem procura irritado ao chegar no lugar errado.
 *
 * Círculo comunica "em algum ponto desta área", que é a verdade. É o mesmo
 * padrão que o Airbnb usa para listagem antes da reserva.
 *
 * O raio desenhado é maior que o deslocamento real: um círculo justo demais
 * permitiria estreitar a busca cruzando o desenho com o ponto central.
 */

/** Aproxima um círculo geográfico por polígono. 64 lados já parece liso. */
function circlePolygon(lat: number, lng: number, meters: number, steps = 64) {
  const coords: [number, number][] = [];
  const latRad = (lat * Math.PI) / 180;
  // Graus por metro: a longitude "encolhe" conforme se afasta do equador.
  const dLat = meters / 111_320;
  const dLng = meters / (111_320 * Math.cos(latRad));

  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    coords.push([lng + dLng * Math.cos(theta), lat + dLat * Math.sin(theta)]);
  }
  return coords;
}

export function AreaMap({
  lat,
  lng,
  radiusMeters = 500,
  className,
}: {
  lat: number;
  lng: number;
  radiusMeters?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const source = getTileSource();
    const map = new MapLibreMap({
      container: containerRef.current,
      style: source.style as never,
      center: [lng, lat],
      zoom: 14,
      attributionControl: { compact: true },
      // Sem rotação: não acrescenta nada aqui e atrapalha no toque.
      pitchWithRotate: false,
      dragRotate: false,
    });

    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      map.addSource('area', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [circlePolygon(lat, lng, radiusMeters)] },
        },
      });

      map.addLayer({
        id: 'area-fill',
        type: 'fill',
        source: 'area',
        paint: { 'fill-color': '#2f6f6a', 'fill-opacity': 0.18 },
      });
      map.addLayer({
        id: 'area-line',
        type: 'line',
        source: 'area',
        paint: { 'line-color': '#2f6f6a', 'line-width': 2, 'line-opacity': 0.55 },
      });

      setReady(true);
    });

    map.on('error', () => setTileError(true));
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lng, radiusMeters]);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="relative">
        <div
          ref={containerRef}
          className="h-64 sm:h-72 w-full rounded-[var(--radius-card)] overflow-hidden border bg-[var(--surface-sunken)]"
        />
        {!ready && (
          <div className="absolute inset-0 grid place-items-center rounded-[var(--radius-card)] bg-[var(--surface-sunken)] pointer-events-none">
            {tileError ? (
              <p className="text-[0.875rem] text-[var(--content-muted)] px-6 text-center">
                O mapa não carregou. O bairro e a cidade estão logo acima.
              </p>
            ) : (
              <span className="sr-only">Carregando mapa</span>
            )}
          </div>
        )}
      </div>

      <p className="flex gap-2 items-start text-[0.75rem] text-[var(--content-subtle)] leading-relaxed">
        <MapPin className="size-3.5 shrink-0 mt-px" aria-hidden />
        Área aproximada. O endereço exato é revelado depois que o proprietário aceitar a
        reserva.
      </p>
    </div>
  );
}
