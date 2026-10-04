/**
 * Copia o worker do MapLibre para `public/maplibre/`, de onde o site o serve.
 *
 * Por quê: o MapLibre descobre onde está o worker a partir de `import.meta.url`
 * do próprio arquivo — e, dentro do bundle do Next, isso não é um endereço
 * http(s). O resultado é um worker criado com o endereço da PÁGINA, que nunca
 * carrega: camadas GeoJSON (o círculo do raio no mapa) ficam sem desenhar e,
 * pior, estilos vetoriais (MapTiler, a opção recomendada para produção) saem
 * em branco. `setWorkerUrl()` (src/lib/maps/worker.ts) aponta para esta cópia.
 *
 * O worker importa `./maplibre-gl-shared.mjs`, então os DOIS arquivos precisam
 * ficar na mesma pasta. A cópia sai sempre da versão instalada, e a pasta de
 * destino não é versionada (é gerada). Roda em `postinstall`, `dev` e `build`.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';

const origem = new URL('../node_modules/maplibre-gl/dist/', import.meta.url);
const destino = new URL('../public/maplibre/', import.meta.url);
const ARQUIVOS = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

if (!existsSync(new URL(ARQUIVOS[0], origem))) {
  console.warn('copy-maplibre-worker: maplibre-gl ainda não está instalado; nada a copiar.');
  process.exit(0);
}

mkdirSync(destino, { recursive: true });
for (const arquivo of ARQUIVOS) cpSync(new URL(arquivo, origem), new URL(arquivo, destino));
console.log(`copy-maplibre-worker: ${ARQUIVOS.join(' e ')} copiados para public/maplibre/`);
