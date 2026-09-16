import { customType } from 'drizzle-orm/pg-core';
import { sql, type SQL } from 'drizzle-orm';

export type LatLng = { lat: number; lng: number };

/**
 * Le um ponto no formato EWKB hexadecimal, que e como o Postgres devolve
 * colunas PostGIS pelo protocolo binario.
 *
 * Layout: [1 byte endianness][4 bytes tipo][4 bytes SRID, se sinalizado]
 *         [8 bytes double X][8 bytes double Y]
 * O bit 0x20000000 no tipo indica que o SRID vem junto.
 */
function parseEwkbPoint(hex: string): LatLng {
  const bytes = Buffer.from(hex, 'hex');
  if (bytes.length < 21) {
    throw new Error(`EWKB invalido para ponto: ${hex.slice(0, 32)}`);
  }
  const littleEndian = bytes.readUInt8(0) === 1;
  const readU32 = (o: number) => (littleEndian ? bytes.readUInt32LE(o) : bytes.readUInt32BE(o));
  const readF64 = (o: number) => (littleEndian ? bytes.readDoubleLE(o) : bytes.readDoubleBE(o));

  const geomType = readU32(1);
  const hasSrid = (geomType & 0x20000000) !== 0;
  let offset = 5;
  if (hasSrid) offset += 4;

  // PostGIS guarda (X, Y) = (longitude, latitude).
  const lng = readF64(offset);
  const lat = readF64(offset + 8);
  return { lat, lng };
}

/**
 * Coordenada de um espaco: `geometry(Point, 4326)` — WGS84, o mesmo sistema
 * do GPS do celular.
 *
 * Para medir distancia em METROS usamos o cast `::geography` nas consultas, e
 * a migracao cria indices GIST sobre exatamente esse cast, entao a busca por
 * raio continua indexada em vez de varrer a tabela.
 *
 * A ordem (longitude, latitude) do PostGIS aparece so aqui e nos helpers
 * abaixo — trocar os dois joga o Brasil no oceano Indico.
 */
export const pointColumn = customType<{
  data: LatLng;
  driverData: string;
  config: never;
}>({
  dataType: () => 'geometry(Point,4326)',
  toDriver: (value: LatLng) => `SRID=4326;POINT(${value.lng} ${value.lat})`,
  fromDriver: (value: string) => parseEwkbPoint(value),
});

/** Ponto literal em SQL, ja como geography (metros). */
export function geogPoint({ lat, lng }: LatLng): SQL {
  return sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
}

/**
 * Filtro "dentro de N metros". Escrito para casar com o indice GIST criado
 * sobre (coluna::geography) — ver a migracao 0001.
 */
export function withinMeters(column: SQL | unknown, center: LatLng, meters: number): SQL {
  return sql`ST_DWithin(${column}::geography, ${geogPoint(center)}, ${meters})`;
}

/** Distancia em metros entre a coluna e um ponto. */
export function distanceMeters(column: SQL | unknown, center: LatLng): SQL<number> {
  return sql<number>`ST_Distance(${column}::geography, ${geogPoint(center)})`;
}

export function latOf(column: SQL | unknown): SQL<number> {
  return sql<number>`ST_Y(${column})`;
}

export function lngOf(column: SQL | unknown): SQL<number> {
  return sql<number>`ST_X(${column})`;
}

export { parseEwkbPoint };
