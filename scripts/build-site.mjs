/**
 * Gera `sites/<nome>/dist/<nome>.html`: um site cinematográfico (kit em sites/_kit) num ÚNICO arquivo,
 * com 3D, animações, fontes e CSS embutidos e nenhuma requisição externa.
 *
 *   pnpm site <nome>          (ex.: pnpm site meridian)
 *
 * Estrutura de um site:  sites/<nome>/{App.tsx, scene.ts (opcional), styles.css, meta.json}
 * meta.json: { title, description, themeColor, fonts: ["fraunces","unbounded"], noindex?: true,
 *              videos?: { <id>: { modo: "loop"|"scrub", descricao, quadros?, inicio?, duracao?, largura? } } }
 *
 * Vídeos REAIS: coloque o arquivo em sites/<nome>/videos/<id>.(mp4|mov|webm|m4v). O ffmpeg converte:
 *   loop  → MP4 H.264 sem áudio (≤ 12 s, ≤ 1600 px)      → <LoopVideo id="…"/>
 *   scrub → N quadros WebP (padrão 120, ≤ 1440 px)        → <ScrubVideo id="…"/> (rolagem controla o vídeo)
 * Se faltar algum vídeo listado em meta.videos, o build PARA e diz o que falta (nada de site "fingindo").
 *
 * Fotos REAIS: meta.imagens = { <id>: { arquivo: "img/x.jpg", largura?: 1600, qualidade?: 74 } } → WebP embutido
 * uma única vez no CSS; use <Foto id="…" alt="…"/> (sites/_kit/ui.tsx) quantas vezes quiser.
 */
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { readFile, writeFile, mkdir, access, readdir, stat, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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


// ---------------------------------------------------------------- vídeos reais
const videosMeta = meta.videos ?? {};
// H.264 (padrão) toca em Chrome, Safari, Edge e Firefox. KIT_VIDEO_CODEC=vp9 só para testar no Chromium
// open-source deste ambiente, que não tem H.264.
const CODEC = process.env.KIT_VIDEO_CODEC === 'vp9' ? 'vp9' : 'h264';
const pastaVideos = path.join(dir, 'videos');
const arquivosVideo = (await existe(pastaVideos)) ? await readdir(pastaVideos) : [];
const faltando = [];
let midiaTags = '';
let posters = '';
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
const duracaoDe = (arq) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', arq]).toString().trim());

for (const [id, cfg] of Object.entries(videosMeta)) {
  const nomeArq = arquivosVideo.find((a) => a.replace(/\.[^.]+$/, '') === id && /\.(mp4|mov|webm|m4v|mkv)$/i.test(a));
  if (!nomeArq) {
    faltando.push(`  - videos/${id}.mp4  (${cfg.modo})  ${cfg.descricao ?? ''}`);
    continue;
  }
  const entrada = path.join(pastaVideos, nomeArq);
  const st = await stat(entrada);
  const chave = createHash('sha1').update(JSON.stringify([nomeArq, st.size, st.mtimeMs, cfg, CODEC])).digest('hex').slice(0, 12);
  const pasta = path.join(tmp, 'midia', `${id}-${chave}`);
  const inicio = String(cfg.inicio ?? 0);
  const total = duracaoDe(entrada);
  const dur = Math.max(0.5, Math.min(cfg.duracao ?? (cfg.modo === 'loop' ? 12 : total), total - Number(inicio)));
  if (!(await existe(path.join(pasta, 'ok')))) {
    // descarta conversões antigas DESTE vídeo (outra versão do arquivo ou outra configuração)
    const base = path.join(tmp, 'midia');
    if (await existe(base)) for (const d of await readdir(base)) if (d.startsWith(`${id}-`)) await rm(path.join(base, d), { recursive: true, force: true });
    await mkdir(pasta, { recursive: true });
    const larg = cfg.largura ?? (cfg.modo === 'loop' ? 1600 : 1440);
    ff(['-ss', inicio, '-i', entrada, '-frames:v', '1', '-vf', `scale='min(1280,iw)':-2:flags=lanczos`, '-c:v', 'libwebp', '-quality', '55', path.join(pasta, 'poster.webp')]);
    if (cfg.modo === 'loop') {
      const vf = `scale='min(${larg},iw)':-2:flags=lanczos,fps=30,format=yuv420p`;
      if (CODEC === 'vp9')
        ff(['-ss', inicio, '-t', String(dur), '-i', entrada, '-an', '-vf', vf, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36', '-row-mt', '1', path.join(pasta, 'video.webm')]);
      else
        ff(['-ss', inicio, '-t', String(dur), '-i', entrada, '-an', '-vf', vf,
          '-c:v', 'libx264', '-preset', 'slow', '-crf', String(cfg.crf ?? 26), '-profile:v', 'high', '-movflags', '+faststart', path.join(pasta, 'video.mp4')]);
    } else {
      const n = cfg.quadros ?? 120;
      await mkdir(path.join(pasta, 'q'), { recursive: true });
      ff(['-ss', inicio, '-t', String(dur), '-i', entrada, '-an', '-vf', `fps=${n}/${dur},scale='min(${larg},iw)':-2:flags=lanczos`,
        '-c:v', 'libwebp', '-quality', String(cfg.qualidade ?? 62), '-compression_level', '5', path.join(pasta, 'q', '%04d.webp')]);
    }
    await writeFile(path.join(pasta, 'ok'), '');
  }
  const posterB64 = (await readFile(path.join(pasta, 'poster.webp'))).toString('base64');
  posters += `[data-midia-poster="${id}"]{background-image:url(data:image/webp;base64,${posterB64})}`;
  let corpo;
  if (cfg.modo === 'loop') {
    corpo = (await readFile(path.join(pasta, CODEC === 'vp9' ? 'video.webm' : 'video.mp4'))).toString('base64');
  } else {
    const qs = (await readdir(path.join(pasta, 'q'))).filter((f) => f.endsWith('.webp')).sort();
    corpo = (await Promise.all(qs.map((f) => readFile(path.join(pasta, 'q', f))))).map((b) => b.toString('base64')).join('|');
  }
  const mime = cfg.modo === 'loop' ? (CODEC === 'vp9' ? 'video/webm' : 'video/mp4') : 'image/webp';
  midiaTags += `<script type="text/plain" id="k-midia-${id}" data-modo="${cfg.modo}" data-mime="${mime}">${corpo}</script>\n`;
  console.log(`  · ${id} (${cfg.modo}) — ${(corpo.length / 1024 / 1024).toFixed(1)} MB`);
}

// ----------------------------------------------------------------- fotos reais
let fotosCss = '';
for (const [id, cfg] of Object.entries(meta.imagens ?? {})) {
  const entrada = path.join(dir, cfg.arquivo);
  if (!(await existe(entrada))) {
    faltando.push(`  - ${cfg.arquivo}  (foto "${id}")`);
    continue;
  }
  const st = await stat(entrada);
  const chave = createHash('sha1').update(JSON.stringify([cfg, st.size, st.mtimeMs])).digest('hex').slice(0, 12);
  const saidaImg = path.join(tmp, 'fotos', `${id}-${chave}.webp`);
  if (!(await existe(saidaImg))) {
    await mkdir(path.join(tmp, 'fotos'), { recursive: true });
    ff(['-i', entrada, '-vf', `scale='min(${cfg.largura ?? 1600},iw)':-2:flags=lanczos`, '-c:v', 'libwebp', '-quality', String(cfg.qualidade ?? 74), saidaImg]);
  }
  const b64 = (await readFile(saidaImg)).toString('base64');
  fotosCss += `[data-img="${id}"]{background-image:url(data:image/webp;base64,${b64})}`;
  console.log(`  · foto ${id} — ${(b64.length / 1024).toFixed(0)} kB`);
}
if (faltando.length) {
  console.error(`\n✖ Faltam arquivos de mídia real em sites/${nome}/ — o site não é gerado sem eles:\n${faltando.join('\n')}\n`);
  process.exit(2);
}

const seguro = (js, n) => {
  if (/<\/script/i.test(js)) throw new Error(`${n} contém "</script".`);
  return js;
};
// Ícone da aba embutido (evita o 404 de /favicon.ico): inicial do site sobre a cor do tema.
const corIcone = meta.faviconCor ?? '#f0a43a';
const letra = (meta.faviconLetra ?? meta.title ?? '?').trim()[0].toUpperCase();
const favicon = 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${meta.themeColor ?? '#000'}"/><text x="32" y="44" text-anchor="middle" font-family="Georgia,serif" font-size="38" fill="${corIcone}">${letra}</text></svg>`,
);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const saida = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<title>${esc(meta.title)}</title>
<meta name="description" content="${esc(meta.description)}">
<meta name="theme-color" content="${esc(meta.themeColor ?? '#000000')}">
<link rel="icon" href="${favicon}">
<script>(function(d){var c=d.documentElement.classList;c.add('js');try{if(matchMedia('(max-width:767px)').matches)c.add('lite')}catch(e){}})(document)</script>
<meta property="og:title" content="${esc(meta.title)}">
<meta property="og:description" content="${esc(meta.description)}">
<meta property="og:type" content="website">${meta.noindex ? '\n<meta name="robots" content="noindex,nofollow">' : ''}
<style>${faces}${posters}${fotosCss}${css}</style>
</head>
<body>
<a href="#conteudo" style="position:absolute;left:-9999px" onfocus="this.style.left='12px';this.style.top='12px';this.style.zIndex=99;this.style.background='#fff';this.style.color='#000';this.style.padding='8px 14px'">Pular para o conteúdo</a>
<div id="root">${html}</div>
${midiaTags}${cena ? `<script id="k-cena" type="text/plain">${seguro(cena.outputFiles[0].text, 'cena 3D')}</script>\n` : ''}<script>${seguro(principal.outputFiles[0].text, 'bundle principal')}</script>
</body>
</html>
`;
const destino = path.join(dir, 'dist', `${nome}.html`);
await writeFile(destino, saida);
// Cópia como index.html: hospedagens (Netlify Drop, Vercel, Hostinger) abrem o index.html na raiz do site.
await mkdir(path.join(dir, 'dist', 'site'), { recursive: true });
await writeFile(path.join(dir, 'dist', 'site', 'index.html'), saida);
try {
  execFileSync('zip', ['-j', '-q', '-o', path.join(dir, 'dist', `${nome}-netlify.zip`), path.join(dir, 'dist', 'site', 'index.html')]);
} catch {
  /* sem zip no sistema: a pasta dist/site já serve para arrastar no Netlify Drop */
}
const kb = (n) => `${(n / 1024).toFixed(0)} kB`;
console.log(`✔ ${path.relative(raiz, destino)} — ${kb(Buffer.byteLength(saida))} (JS ${kb(principal.outputFiles[0].text.length)}, 3D ${cena ? kb(cena.outputFiles[0].text.length) : '—'}, CSS ${kb(css.length)}, fontes ${kb(faces.length)})`);
