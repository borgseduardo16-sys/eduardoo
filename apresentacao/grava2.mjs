// Gravação QUADRO A QUADRO (30 fps exatos): o relógio da página é falso e avança 1/30 s por quadro;
// animações CSS/WAAPI ficam pausadas e são posicionadas no mesmo tempo. Resultado sem travamentos.
// uso: node grava2.mjs <site> <pasta_saida> '<ações>' [locale]
// ações: ["carrega"] | ["espera",s] | ["desliza",s,alvo,de?] (alvo: px ou "#id@fração") | ["y",px] | ["clica","sel:..."] | ["grava"]
import { chromium } from '/home/user/eduardoo/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const [site, out, acoesJson, locale = 'pt-PT'] = process.argv.slice(2);
const acoes = JSON.parse(acoesJson);
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 800, height: 1422 }, deviceScaleFactor: 1.35, locale });
const p = await ctx.newPage();
await p.addInitScript(() => {
  document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = 'a.fixed.bottom-5.right-5{display:none!important}'; document.head.appendChild(s); });
  window.__sync = () => {
    const agora = performance.now();
    for (const a of document.getAnimations()) {
      if (a.__b === undefined) { a.__b = agora - (Number(a.currentTime) || 0); a.pause(); }
      a.currentTime = agora - a.__b;
    }
  };
});
await p.clock.install({ time: new Date('2026-11-18T10:00:00Z') });
await p.clock.pauseAt(new Date('2026-11-18T10:00:01Z'));
const html = `file:///home/user/eduardoo/sites/${site}/dist/${site}.html`;
const FPS = 30, DT = 1000 / FPS;
let gravando = false, n = 0, y = 0;
const quadro = async () => {
  await p.clock.runFor(DT);
  await p.evaluate(() => window.__sync && window.__sync());
  if (gravando) await p.screenshot({ path: `${out}/${String(++n).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
};
const alvoY = (alvo) => p.evaluate((alvo) => {
  if (typeof alvo === 'number') return alvo;
  const [sel, off] = alvo.split('@'); const e = document.querySelector(sel);
  return e.getBoundingClientRect().top + scrollY + Number(off || 0) * (e.offsetHeight - innerHeight);
}, alvo);
const ease = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const carregar = async () => { await p.goto(html, { waitUntil: 'load' }); y = 0; };
if (acoes[0]?.[0] !== 'carrega') { await carregar(); for (let i = 0; i < 20; i++) await quadro(); }
for (const a of acoes) {
  if (a[0] === 'carrega') { gravando = true; await carregar(); }
  else if (a[0] === 'grava') gravando = true;
  else if (a[0] === 'espera') { for (let i = 0; i < Math.round(a[1] * FPS); i++) await quadro(); }
  else if (a[0] === 'y') { y = a[1]; await p.evaluate((y) => window.scrollTo(0, y), y); for (let i = 0; i < 15; i++) { const g = gravando; gravando = false; await quadro(); gravando = g; } }
  else if (a[0] === 'clica') { await p.locator(a[1].slice(4)).first().click({ noWaitAfter: true }); }
  else if (a[0] === 'desliza') {
    const y0 = a[3] ?? y, y1 = await alvoY(a[2]); const N = Math.round(a[1] * FPS);
    for (let i = 1; i <= N; i++) { y = y0 + (y1 - y0) * ease(i / N); await p.evaluate((y) => window.scrollTo(0, y), y); await quadro(); }
  }
}
await b.close();
console.log(`${out}: ${n} quadros (${(n / FPS).toFixed(1)} s)`);
