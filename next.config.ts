import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs/config';

/*
 * Origens externas que a pagina de verdade precisa contatar: Supabase
 * (auth, storage das fotos, realtime do chat) e a fonte de tiles do mapa
 * (OpenStreetMap por padrao, MapTiler ou um servidor propio via
 * NEXT_PUBLIC_TILE_URL — inclusive o dublê usado pelos testes, que sobe em
 * http://127.0.0.1:<porta aleatoria>). Nenhuma delas e fixa o bastante para
 * virar um dominio unico no CSP, entao a politica abaixo restringe o que da
 * para restringir sem depender de terceiro (scripts, plugins, iframes,
 * formularios) e libera http(s)/ws(s) para imagem e rede — restringir esses
 * dois exigiria hardcodar o projeto Supabase e quebraria o dublê de teste.
 */
function origemOuVazia(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

const supabaseOrigin = origemOuVazia(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseWsOrigin = supabaseOrigin.replace(/^http/, 'ws');
const isDev = process.env.NODE_ENV === 'development';

/*
 * MapLibre GL (o motor do mapa, `src/lib/maps/config.ts`) compila as
 * expressoes de estilo com `new Function(...)` — confirmado ao rodar a
 * suite de integracao de verdade contra esta politica, que travou o mapa com
 * "Refused to evaluate a string as JavaScript" ate este ajuste. Por isso
 * SO as paginas que realmente desenham um mapa (resultado de busca, detalhe
 * do anuncio, escolha de localizacao ao anunciar) recebem `unsafe-eval` no
 * script-src — o resto do site, PAGAMENTO incluso, fica na politica estrita.
 */
function cspFor(comEval: boolean): string {
  return `
    default-src 'self';
    script-src 'self' 'unsafe-inline'${isDev || comEval ? " 'unsafe-eval'" : ''};
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob: https: http:;
    connect-src 'self' https: http: wss: ws: ${supabaseOrigin} ${supabaseWsOrigin};
    worker-src 'self' blob:;
    font-src 'self' data:;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
  `.replace(/\s{2,}/g, ' ').trim();
}

const cspHeader = cspFor(false);
const cspHeaderComMapa = cspFor(true);

/** Rotas que montam o mapa (MapLibre GL) e por isso precisam do CSP relaxado. */
const ROTAS_COM_MAPA = ['/espacos', '/espacos/:slug*', '/anunciar/:id/localizacao'];

const nextConfig: NextConfig = {
  /*
   * Pasta de saida da compilacao.
   *
   * Configuravel para que o teste de integracao possa compilar numa pasta
   * propria (`.next-teste`) sem apagar a compilacao de desenvolvimento — os
   * dois usam variaveis de ambiente diferentes, e misturar as duas saidas
   * geraria um bundle com a URL errada dentro.
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',

  /*
   * Cabecalhos de seguranca, em todas as rotas.
   *
   * `frame-ancestors 'none'` + `X-Frame-Options: DENY` (redundante de
   * proposito, para navegador antigo que so entende o segundo) impedem que o
   * site seja carregado dentro de um <iframe> de terceiro — a base de um
   * ataque de clickjacking (cobrir a pagina real com uma invisivel para
   * roubar o clique num botao de "confirmar pagamento", por exemplo).
   * `X-Content-Type-Options: nosniff` impede o navegador de tentar adivinhar
   * o tipo de um arquivo enviado pelo usuario (foto de anuncio) e executa-lo
   * como outra coisa. HSTS so tem efeito servido por HTTPS — inofensivo em
   * desenvolvimento.
   */
  async headers() {
    const outros = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), payment=(), usb=(), geolocation=(self)',
      },
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains',
      },
    ];

    return [
      {
        source: '/:path*',
        headers: [{ key: 'Content-Security-Policy', value: cspHeader }, ...outros],
      },
      // Sobrescreve so o CSP nas rotas com mapa — a ultima que casar vence.
      ...ROTAS_COM_MAPA.map((source) => ({
        source,
        headers: [{ key: 'Content-Security-Policy', value: cspHeaderComMapa }],
      })),
    ];
  },
};

/*
 * O upload de source map so acontece com SENTRY_AUTH_TOKEN/ORG/PROJECT
 * definidos — sem eles o plugin so avisa e segue o build normalmente (nao
 * quebra `pnpm build` sem credencial, mesmo padrao das outras integracoes).
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
});
