import { setWorkerUrl } from 'maplibre-gl';

/**
 * Onde o site serve o worker do MapLibre (copiado de node_modules para
 * `public/maplibre/` por scripts/copy-maplibre-worker.mjs).
 *
 * O padrão da biblioteca não funciona dentro do bundle do Next: ela monta o
 * endereço do worker a partir de `import.meta.url`, que ali não é http(s), e
 * acaba criando um worker com o endereço da própria página. Sem worker, camadas
 * GeoJSON não desenham e estilos vetoriais (MapTiler) ficam em branco.
 */
export const MAPLIBRE_WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';

let configurado = false;

/** Chamar antes de criar qualquer mapa (o MapLibre lê isto uma vez, ao criar o primeiro). */
export function prepararMapLibre(): void {
  if (configurado) return;
  setWorkerUrl(MAPLIBRE_WORKER_URL);
  configurado = true;
}
