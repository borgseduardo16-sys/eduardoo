/**
 * Configuracao do mapa.
 *
 * ESCOLHA: MapLibre GL (biblioteca) + fonte de tiles trocavel.
 *
 * MapLibre e open source e nao amarra a plataforma a um fornecedor — trocar de
 * provedor de tiles e trocar uma URL, nao reescrever a tela do mapa.
 *
 * A fonte de tiles tem dois modos:
 *
 *   SEM CHAVE (padrao) — tiles do OpenStreetMap. Funciona na hora, sem conta
 *     nem cartao. A politica de uso do OSM e para trafego moderado e pede
 *     atribuicao visivel; serve para desenvolvimento e para os primeiros
 *     usuarios, NAO para um produto com volume.
 *
 *   COM CHAVE MapTiler — define NEXT_PUBLIC_MAPTILER_KEY e o mapa passa
 *     sozinho a usar tiles vetoriais do MapTiler: mais nitidos, mais rapidos
 *     e com direito de uso comercial. Nada mais no codigo muda.
 *
 * A chave do MapTiler e PUBLICA por natureza (vai para o navegador em toda
 * requisicao de tile). O que a protege nao e segredo, e a restricao de dominio
 * no painel deles — sem isso, qualquer site pode gastar a sua cota.
 */

export type MapTileSource = {
  /** Estilo no formato do MapLibre. */
  style: string | Record<string, unknown>;
  attribution: string;
  provider: 'openstreetmap' | 'maptiler';
};

/** Colatina/ES. Serve de centro quando ainda nao ha coordenada. */
export const DEFAULT_CENTER = { lat: -19.5386, lng: -40.6295 };
export const DEFAULT_ZOOM = 13;
/** Zoom usado quando ja existe um ponto marcado. */
export const PIN_ZOOM = 16;

export function getTileSource(): MapTileSource {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;

  if (key) {
    return {
      style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${key}`,
      attribution: '© MapTiler © OpenStreetMap',
      provider: 'maptiler',
    };
  }

  return {
    provider: 'openstreetmap',
    attribution: '© OpenStreetMap',
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          maxzoom: 19,
          attribution: '© OpenStreetMap',
        },
      },
      layers: [{ id: 'osm', type: 'raster', source: 'osm', minzoom: 0, maxzoom: 22 }],
    },
  };
}

/** true quando o mapa esta na fonte gratuita, que nao serve para producao. */
export function isUsingFreeTiles(): boolean {
  return !process.env.NEXT_PUBLIC_MAPTILER_KEY;
}
