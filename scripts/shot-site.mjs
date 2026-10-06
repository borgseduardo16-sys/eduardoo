/**
 * Captura telas de um site gerado (HTML único) em desktop e celular, rolando por TODAS as seções,
 * e acusa erro de console, rolagem horizontal e requisições externas.
 *
 *   node scripts/shot-site.mjs sites/<nome>/dist/<nome>.html <pasta-de-saida>
 *
 * Usa o Chromium pré-instalado (/opt/pw-browsers/chromium); o WebGL roda por software (swiftshader).
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const [arquivo, saida = 'shots'] = process.argv.slice(2);
if (!arquivo) {
  console.error('Uso: node scripts/shot-site.mjs <arquivo.html> [pasta-de-saida]');
  process.exit(1);
}
await mkdir(saida, { recursive: true });
const url = 'file://' + path.resolve(arquivo);
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const perfis = [
  ['desk', { width: 1366, height: 800 }, {}],
  ['mob', { width: 390, height: 800 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
];
let falhou = false;
for (const [nome, vp, opts] of perfis) {
  const ctx = await b.newContext({ viewport: vp, ...opts });
  const p = await ctx.newPage();
  const erros = [];
  const externas = [];
  p.on('pageerror', (e) => erros.push(`pageerror: ${e}`));
  p.on('console', (m) => {
    if (['error', 'warning'].includes(m.type()) && !/GL Driver|GPU stall/.test(m.text())) erros.push(m.text().slice(0, 300));
  });
  p.on('request', (r) => {
    const u = r.url();
    if (!/^(file|data|blob):/.test(u)) externas.push(u);
  });
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(5000);
  await p.screenshot({ path: path.join(saida, `${nome}-00-topo.png`) });
  // todas as seções com id, em 3 pontos de cada (início, meio, fim da rolagem delas)
  const secoes = await p.evaluate(() => [...document.querySelectorAll('main section[id]')].map((s) => s.id));
  let n = 1;
  for (const id of secoes) {
    for (const f of [0, 0.5, 1]) {
      await p.evaluate(([id, f]) => {
        const e = document.getElementById(id);
        const top = e.getBoundingClientRect().top + scrollY;
        window.scrollTo(0, top + Math.max(0, e.offsetHeight - innerHeight) * f);
      }, [id, f]);
      await p.waitForTimeout(2200);
      await p.screenshot({ path: path.join(saida, `${nome}-${String(n++).padStart(2, '0')}-${id}-${Math.round(f * 100)}.png`) });
    }
  }
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  const canvas = await p.locator('canvas').count();
  console.log(`${nome}: seções=${secoes.length} canvas=${canvas} overflowX=${overflow} externas=${externas.length} erros=${erros.length}`);
  if (overflow || externas.length || erros.length) {
    falhou = true;
    console.log({ externas, erros });
  }
  await ctx.close();
}
await b.close();
process.exit(falhou ? 1 : 0);
