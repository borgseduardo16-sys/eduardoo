/**
 * Contas de geografia do mapa — módulo puro (servidor e navegador).
 *
 * Só serve à EXIBIÇÃO (distância mostrada na prévia, círculo do raio). Quem
 * decide o que está dentro do raio é o banco (PostGIS), com a mesma referência.
 */

const RAIO_TERRA_M = 6_371_008.8;
const rad = (g: number) => (g * Math.PI) / 180;

export type LatLngLike = { lat: number; lng: number };

/** Distância em metros pelo círculo máximo (haversine). Erro de ~0,3% — de sobra para "a 1,2 km". */
export function haversineMeters(a: LatLngLike, b: LatLngLike): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "850 m", "1,2 km", "12 km" — arredondado para o que a pessoa consegue usar. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.max(50, Math.round(meters / 50) * 50)} m`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)} km`;
}

/** Ponto a `meters` de `centro`, na direção `graus` (0 = norte, sentido horário). */
function deslocar(centro: LatLngLike, meters: number, graus: number): LatLngLike {
  const d = meters / RAIO_TERRA_M;
  const rumo = rad(graus);
  const lat1 = rad(centro.lat);
  const lng1 = rad(centro.lng);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(rumo));
  const lng2 = lng1 + Math.atan2(Math.sin(rumo) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

/** Polígono GeoJSON (anel fechado) de um círculo de `meters` em volta de `centro`. */
export function circlePolygon(centro: LatLngLike, meters: number, passos = 72): [number, number][] {
  const anel: [number, number][] = [];
  for (let i = 0; i < passos; i++) {
    const p = deslocar(centro, meters, (360 * i) / passos);
    anel.push([p.lng, p.lat]);
  }
  anel.push(anel[0]!);
  return anel;
}

/** Retângulo [oeste, sul, leste, norte] que contém o círculo — para enquadrar o mapa no raio. */
export function circleBounds(centro: LatLngLike, meters: number): [number, number, number, number] {
  const norte = deslocar(centro, meters, 0);
  const sul = deslocar(centro, meters, 180);
  const leste = deslocar(centro, meters, 90);
  const oeste = deslocar(centro, meters, 270);
  return [oeste.lng, sul.lat, leste.lng, norte.lat];
}
