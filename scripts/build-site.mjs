/**
 * Gera `sites/<nome>/dist/<nome>.html`: um site cinematográfico (kit em sites/_kit) num ÚNICO arquivo,
 * com 3D, animações, fontes e CSS embutidos e nenhuma requisição externa.
 *
 *   pnpm site <nome>          (ex.: pnpm site meridian)
 *
 * Estrutura de um site:  sites/<nome>/{App.tsx, scene.ts (opcional), styles.css, meta.json}
 * meta.json: { title, description, themeColor, fonts: ["fraunces","unbounded"], noindex?: true }
 */
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const nome = process.argv[2];
if (!nome) {
  console.error('Uso: pnpm site <nome>   (pasta em sites/<nome>)');
  process.exit(1);
}
const raiz = path.resolve(import.meta.dirname, '..');
const dir = path.join(raiz, 'sites', nome);
const kit = path.join(raiz, 'sites', '_kit');
const tmp = path.join(dir, '.build');
const existe = (p) => access(p).then(() => true, () => false);
if (!(await existe(path.join(dir, 'App.tsx')))) {
  console.error(`sites/${nome}/App.tsx não existe.`);
  process.exit(1);
}
await mkdir(tmp, { recursive: true });
await mkdir(path.join(dir, 'dist'), { recursive: true });

const meta = JSON.parse(await readFile(path.join(dir, 'meta.json'), 'utf8'));
const temCena = await existe(path.join(dir, 'scene.ts'));

// Entradas geradas (ficam em .build, fora do git)
await writeFile(
  path.join(tmp, 'entry.tsx'),
  `import { hydrateRoot } from 'react-dom/client';
import App from '../App';
import { initScroll } from '../../_kit/scroll';
window.__cenaKit = () => {
  const codigo = document.getElementById('k-cena')?.textContent ?? '';
  const url = URL.createObjectURL(new Blob([codigo], { type: 'text/javascript' }));
  return import(/* webpackIgnore: true */ url);
};
hydrateRoot(document.getElementById('root')!, <App />);
initScroll();
`,
);
await writeFile(
  path.join(tmp, 'entry-ssr.tsx'),
  `import { renderToString } from 'react-dom/server';
import App from '../App';
export const renderizar = () => renderToString(<App />);
`,
);

const comum = {
  bundle: true, minify: true, jsx: 'automatic', tsconfig: path.join(raiz, 'tsconfig.json'),
  loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'none', logLevel: 'warning', write: false,
};

const principal = await build({ ...comum, entryPoints: [path.join(tmp, 'entry.tsx')], format: 'iife', target: 'es2020', platform: 'browser' });
const cena = temCena
  ? await build({ ...comum, entryPoints: [path.join(dir, 'scene.ts')], format: 'esm', target: 'es2020', platform: 'browser' })
  : null;

const ssrArquivo = path.join(tmp, 'ssr.cjs');
await build({ ...comum, write: true, minify: false, entryPoints: [path.join(tmp, 'entry-ssr.tsx')], format: 'cjs', platform: 'node', outfile: ssrArquivo });
const html = createRequire(import.meta.url)(ssrArquivo).renderizar();

const cssEntrada = path.join(dir, 'styles.css');
const css = (await postcss([tailwind({ optimize: { minify: true } })]).process(await readFile(cssEntrada, 'utf8'), { from: cssEntrada })).css;

// Fontes (latin) em base64
const FONTES = {
  fraunces: [
    ['Fraunces', 'normal', '300 700', 'fraunces-normal-latin.woff2'],
    ['Fraunces', 'italic', '300 700', 'fraunces-italic-latin.woff2'],
  ],
  unbounded: [['Unbounded', 'normal', '300 900', 'unbounded-normal-latin.woff2']],
  'plus-jakarta': [['Plus Jakarta Sans', 'normal', '200 800', path.join('..', '..', '..', 'standalone', 'assets', 'plus-jakarta-sans-latin.woff2')]],
};
const RANGE = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
let faces = '';
for (const f of ['plus-jakarta', ...(meta.fonts ?? [])]) {
  for (const [fam, estilo, peso, arq] of FONTES[f] ?? []) {
    const b64 = (await readFile(path.join(kit, 'fonts', arq))).toString('base64');
    faces += `@font-face{font-family:"${fam}";font-style:${estilo};font-weight:${peso};font-display:swap;src:url(data:font/woff2;base64,${b64}) format("woff2");unicode-range:${RANGE}}`;
  }
}

const seguro = (js, n) => {
  if (/<\/script/i.test(js)) throw new Error(`${n} contém "</script".`);
  return js;
};
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const saida = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<title>${esc(meta.title)}</title>
<meta name="description" content="${esc(meta.description)}">
<meta name="theme-color" content="${esc(meta.themeColor ?? '#000000')}">
<meta property="og:title" content="${esc(meta.title)}">
<meta property="og:description" content="${esc(meta.description)}">
<meta property="og:type" content="website">${meta.noindex ? '\n<meta name="robots" content="noindex,nofollow">' : ''}
<style>${faces}${css}</style>
</head>
<body>
<a href="#conteudo" style="position:absolute;left:-9999px" onfocus="this.style.left='12px';this.style.top='12px';this.style.zIndex=99;this.style.background='#fff';this.style.color='#000';this.style.padding='8px 14px'">Pular para o conteúdo</a>
<div id="root">${html}</div>
${cena ? `<script id="k-cena" type="text/plain">${seguro(cena.outputFiles[0].text, 'cena 3D')}</script>\n` : ''}<script>${seguro(principal.outputFiles[0].text, 'bundle principal')}</script>
</body>
</html>
`;
const destino = path.join(dir, 'dist', `${nome}.html`);
await writeFile(destino, saida);
const kb = (n) => `${(n / 1024).toFixed(0)} kB`;
console.log(`✔ ${path.relative(raiz, destino)} — ${kb(Buffer.byteLength(saida))} (JS ${kb(principal.outputFiles[0].text.length)}, 3D ${cena ? kb(cena.outputFiles[0].text.length) : '—'}, CSS ${kb(css.length)}, fontes ${kb(faces.length)})`);
