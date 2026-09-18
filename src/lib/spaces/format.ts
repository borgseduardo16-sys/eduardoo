/**
 * Formata distância para leitura, a partir do valor em metros que o banco
 * calculou com `ST_Distance` sobre `approx_location` (ver queries.ts).
 *
 * Duas casas viram uma só acima de 10 km — "12,4 km" tem uma precisão que
 * "perto de 12 km" já entrega, e três algarismos significativos bastam para
 * decidir se vale a viagem.
 */
export function formatDistance(meters: number): string {
  if (meters < 950) return `${Math.round(meters / 50) * 50} m`;
  const km = meters / 1000;
  return `${km.toFixed(km < 10 ? 1 : 0).replace('.', ',')} km`;
}
