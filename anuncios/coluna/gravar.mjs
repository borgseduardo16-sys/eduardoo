/*
 * Grava o anúncio: abre render.html (servido localmente), aplica o roteiro e o overlay de texto,
 * e tira um print por quadro (render determinístico). Depois o ffmpeg junta com a narração.
 *   node gravar.mjs quadros <fps> [inicio] [fim]   → PNGs em ./quadros
 *   node gravar.mjs still <t1,t2,...>             → stills em ./stills
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname);
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.css': 'text/css' };
const srv = createServer((req, res) => {
  try {
    const f = path.join(raiz, decodeURIComponent(req.url.split('?')[0]));
    const corpo = readFileSync(f);
    res.writeHead(200, { 'content-type': tipos[path.extname(f)] ?? 'application/octet-stream' });
    res.end(corpo);
  } catch {
    res.writeHead(404); res.end();
  }
}).listen(0);
const porta = srv.address().port;

const [modo = 'still', arg = '3', ini, fim] = process.argv.slice(2);
const roteiro = JSON.parse(readFileSync(path.join(raiz, 'roteiro.json'), 'utf8'));
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
p.on('pageerror', (e) => console.error('ERRO', e));
p.on('console', (m) => m.type() === 'error' && console.error('console', m.text()));
await p.addInitScript((r) => (window.ROTEIRO = r), roteiro);
await p.goto(`http://127.0.0.1:${porta}/render.html`);
await p.evaluate(() => window.pronto);

const tirar = async (t, arquivo) => {
  await p.evaluate((t) => window.quadro(t), t);
  await p.screenshot({ path: arquivo, type: 'png' });
};

if (modo === 'still') {
  mkdirSync(path.join(raiz, 'stills'), { recursive: true });
  for (const t of arg.split(',').map(Number)) {
    const t0 = Date.now();
    await tirar(t, path.join(raiz, 'stills', `t${t.toFixed(2)}.png`));
    console.log(`t=${t} ${(Date.now() - t0)}ms`);
  }
} else {
  const fps = Number(arg);
  mkdirSync(path.join(raiz, 'quadros'), { recursive: true });
  const a = Math.round(Number(ini ?? 0) * fps);
  const z = Math.round(Number(fim ?? roteiro.duracao) * fps);
  const t0 = Date.now();
  for (let i = a; i < z; i++) {
    await tirar(i / fps, path.join(raiz, 'quadros', `${String(i).padStart(5, '0')}.png`));
    if (i % 24 === 0) console.log(`quadro ${i}/${z} — ${((Date.now() - t0) / 1000 / (i - a + 1)).toFixed(2)} s/quadro`);
  }
}
await b.close();
srv.close();
