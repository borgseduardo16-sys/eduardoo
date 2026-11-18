// Gera a pasta site/ (o que sobe na Cloudflare Pages): app, worker de legendas e fontes.
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

rmSync('site/assets', { recursive: true, force: true });
mkdirSync('site/assets', { recursive: true });
mkdirSync('site/fonts', { recursive: true });

const common = { bundle: true, format: 'esm', target: ['es2022'], minify: true, legalComments: 'none', logLevel: 'info' };
await build({ ...common, entryPoints: ['src/ui/main.js'], outfile: 'site/assets/app.js' });
await build({ ...common, entryPoints: ['src/engine/asr-worker.js'], outfile: 'site/assets/asr-worker.js' });
await build({ ...common, entryPoints: ['src/ui/app.css'], outfile: 'site/assets/app.css', loader: { '.woff2': 'file' }, external: ['/fonts/*'] });

const fonts = [
  ['@fontsource/montserrat/files/montserrat-latin-900-normal.woff2', 'montserrat-900.woff2'],
  ['@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-500-normal.woff2', 'jakarta-500.woff2'],
  ['@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-600-normal.woff2', 'jakarta-600.woff2'],
  ['@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-700-normal.woff2', 'jakarta-700.woff2'],
  ['@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-800-normal.woff2', 'jakarta-800.woff2'],
  ['@fontsource/poppins/files/poppins-latin-800-normal.woff2', 'poppins-800.woff2'],
  ['@fontsource/anton/files/anton-latin-400-normal.woff2', 'anton-400.woff2'],
  ['@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2', 'bebas-400.woff2'],
];
for (const [from, to] of fonts) cpSync('node_modules/' + from, 'site/fonts/' + to);
console.log('ok');
