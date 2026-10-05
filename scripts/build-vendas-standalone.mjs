/**
 * Gera `standalone/pagina-de-vendas.html`: a página /whatsapp-business num ÚNICO
 * arquivo (HTML + CSS + JS + fonte + cena 3D embutidos), com todas as animações.
 *
 *   pnpm build:vendas
 *
 * Como funciona (a página continua sendo o MESMO código de src/app/whatsapp-business):
 *   1. esbuild empacota o React da página em um bundle de navegador e outro de servidor
 *      (este só para pré-renderizar o HTML inicial, que o navegador "hidrata").
 *   2. A cena 3D (Three.js) vai num bundle à parte, guardada num <script type="text/plain">
 *      e só interpretada (via Blob) quando o hero liga o 3D — o primeiro desenho não espera por ela.
 *   3. O Tailwind compila só as classes usadas e a fonte Plus Jakarta Sans entra em base64.
 */
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..');
const sa = (...p) => path.join(raiz, 'standalone', ...p);
const tmp = sa('.build');
await mkdir(tmp, { recursive: true });

const comum = {
  bundle: true,
  minify: true,
  jsx: 'automatic',
  tsconfig: path.join(raiz, 'tsconfig.json'),
  loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'none',
  logLevel: 'warning',
};

/** Troca next/dynamic, next/navigation e a cena 3D pelos equivalentes do HTML único. */
const trocasNext = {
  name: 'trocas-next',
  setup(b) {
    b.onResolve({ filter: /^next\/dynamic$/ }, () => ({ path: sa('shims/dynamic.tsx') }));
    b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: sa('shims/navigation.ts') }));
    b.onResolve({ filter: /(^|\/)scene-canvas$/ }, () => ({ path: sa('shims/scene-stub.ts') }));
  },
};

// 1) Navegador (principal)
const principal = await build({
  ...comum,
  entryPoints: [sa('entry.tsx')],
  format: 'iife',
  target: 'es2020',
  platform: 'browser',
  write: false,
  plugins: [trocasNext],
});

// 2) Cena 3D (ESM, carregada por Blob; reaproveita React e GSAP do principal)
const cena = await build({
  ...comum,
  entryPoints: [path.join(raiz, 'src/components/vendas/scene-canvas.tsx')],
  format: 'esm',
  target: 'es2020',
  platform: 'browser',
  write: false,
  alias: {
    react: sa('shims/globals-react.ts'),
    'react/jsx-runtime': sa('shims/globals-jsx.ts'),
    gsap: sa('shims/globals-gsap.ts'),
    'gsap/ScrollTrigger': sa('shims/globals-scrolltrigger.ts'),
  },
});

// 3) Servidor: pré-renderiza o HTML inicial
const ssrArquivo = path.join(tmp, 'ssr.cjs');
await build({
  ...comum,
  entryPoints: [sa('entry-ssr.tsx')],
  format: 'cjs',
  platform: 'node',
  outfile: ssrArquivo,
  plugins: [trocasNext],
  minify: false,
});
const { renderizar } = createRequire(import.meta.url)(ssrArquivo);
const html = renderizar();

// 4) CSS (Tailwind) + fonte
const cssEntrada = sa('styles.css');
const css = (
  await postcss([tailwind({ optimize: { minify: true } })]).process(await readFile(cssEntrada, 'utf8'), {
    from: cssEntrada,
  })
).css;
const fonte = (await readFile(sa('assets/plus-jakarta-sans-latin.woff2'))).toString('base64');
const fontFace =
  `@font-face{font-family:"Plus Jakarta Sans";font-style:normal;font-weight:200 800;font-display:swap;` +
  `src:url(data:font/woff2;base64,${fonte}) format("woff2");` +
  `unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}`;

// 5) Metadados: lidos de page.tsx para não duplicar texto
const pageSrc = await readFile(path.join(raiz, 'src/app/whatsapp-business/page.tsx'), 'utf8');
const produto = (await readFile(path.join(raiz, 'src/components/vendas/config.ts'), 'utf8')).match(
  /PRODUTO = '([^']+)'/,
)[1];
const descricao = pageSrc.match(/description:\s*\n?\s*'([^']+)'/)[1];
const titulo = `${produto} — aprenda a atender e vender melhor pelo WhatsApp`;

const seguroEmScript = (js, nome) => {
  if (/<\/script/i.test(js)) throw new Error(`${nome} contém "</script" — não dá para embutir em <script>.`);
  return js;
};
const cenaJs = seguroEmScript(cena.outputFiles[0].text, 'cena 3D');
const principalJs = seguroEmScript(principal.outputFiles[0].text, 'bundle principal');
const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const modelo = await readFile(sa('template.html'), 'utf8');
// `split/join` (e não replace) para o `$` do código/CSS não virar padrão de substituição.
const saida = modelo
  .split('__TITLE__').join(escAttr(titulo))
  .split('__DESCRIPTION__').join(escAttr(descricao))
  .split('__CSS__').join(fontFace + css)
  .split('__HTML__').join(html)
  .split('__CENA__').join(cenaJs)
  .split('__JS__').join(principalJs);

const destino = sa('pagina-de-vendas.html');
await writeFile(destino, saida);
const kb = (n) => `${(n / 1024).toFixed(0)} kB`;
console.log(`✔ ${path.relative(raiz, destino)} — ${kb(Buffer.byteLength(saida))} (JS ${kb(principalJs.length)}, 3D ${kb(cenaJs.length)}, CSS ${kb(css.length)}, HTML ${kb(html.length)})`);
