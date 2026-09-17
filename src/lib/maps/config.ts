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
  provider: 'openstreetmap' | 'maptiler' | 'personalizado';
};

/** Monta um estilo MapLibre de tiles raster a partir de um template de URL. */
function rasterStyle(template: string, attribution: string): Record<string, unknown> {
  return {
    version: 8,
    sources: {
      base: {
        type: 'raster',
        tiles: [template],
        tileSize: 256,
        maxzoom: 19,
        attribution,
      },
    },
    layers: [{ id: 'base', type: 'raster', source: 'base', minzoom: 0, maxzoom: 22 }],
  };
}

/** Colatina/ES. Serve de centro quando ainda nao ha coordenada. */
export const DEFAULT_CENTER = { lat: -19.5386, lng: -40.6295 };
export const DEFAULT_ZOOM = 13;
/** Zoom usado quando ja existe um ponto marcado. */
export const PIN_ZOOM = 16;

export function getTileSource(): MapTileSource {
  /*
   * Fonte propria, informada como template `{z}/{x}/{y}`. Tem prioridade
   * porque e a escolha mais explicita: serve para apontar o mapa a um
   * servidor de tiles nosso (self-host) sem mexer no codigo, e e o que os
   * testes automatizados usam para exercitar o mapa de verdade sem depender
   * de um servico de terceiro.
   */
  const proprio = process.env.NEXT_PUBLIC_TILE_URL;
  if (proprio) {
    const attribution = process.env.NEXT_PUBLIC_TILE_ATTRIBUTION ?? '';
    return { provider: 'personalizado', attribution, style: rasterStyle(proprio, attribution) };
  }

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
    style: rasterStyle('https://tile.openstreetmap.org/{z}/{x}/{y}.png', '© OpenStreetMap'),
  };
}

/**
 * true quando o mapa esta nos tiles publicos do OpenStreetMap, que a politica
 * de uso deles nao cobre para volume de produto. A pagina de status usa isto
 * para dizer a verdade sobre em que pe o mapa esta.
 */
export function isUsingFreeTiles(): boolean {
  return !process.env.NEXT_PUBLIC_MAPTILER_KEY && !process.env.NEXT_PUBLIC_TILE_URL;
}
