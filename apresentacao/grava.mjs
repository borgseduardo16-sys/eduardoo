// Grava um site real (layout "md", animações ligadas) via screencast do Chromium, em 1080x1920.
// uso: node grava.mjs <site> <saida_dir> '<json de ações>'
// ações: ["espera",s] | ["rola",s,pxPorSeg] | ["ir",seletor] | ["clica",textoOuSeletor] | ["y",px]
import { chromium } from '/home/user/eduardoo/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const [site, out, acoesJson, locale = 'pt-PT'] = process.argv.slice(2);
const acoes = JSON.parse(acoesJson);
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 800, height: 1422 }, deviceScaleFactor: 1.35, locale });
const p = await ctx.newPage();
await p.addInitScript(() => {
  const s = document.createElement('style');
  s.textContent = 'a.fixed.bottom-5.right-5{display:none!important}';
  document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s));
});
const cdp = await ctx.newCDPSession(p);
const frames = [];
let gravando = false;
cdp.on('Page.screencastFrame', async (f) => {
  if (gravando) frames.push({ t: f.metadata.timestamp, data: f.data });
  try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
});
const html = `file:///home/user/eduardoo/sites/${site}/dist/${site}.html`;
const desdeInicio = acoes[0]?.[0] === 'carrega';
if (!desdeInicio) { await p.goto(html, { waitUntil: 'load' }); }
await p.mouse.move(400, 700);
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });
for (const a of acoes) {
  if (a[0] === 'carrega') { gravando = true; await p.goto(html, { waitUntil: 'load' }); }
  else if (a[0] === 'grava') gravando = true;
  else if (a[0] === 'espera') await p.waitForTimeout(a[1] * 1000);
  else if (a[0] === 'y') { await p.evaluate((y) => window.scrollTo(0, y), a[1]); await p.waitForTimeout(400); }
  else if (a[0] === 'ir') { await p.evaluate((s) => { const e = document.querySelector(s); window.scrollTo(0, e.getBoundingClientRect().top + scrollY + (0)); }, a[1]); await p.waitForTimeout(600); }
  else if (a[0] === 'clica') { const l = a[1].startsWith('sel:') ? p.locator(a[1].slice(4)).first() : p.getByText(a[1], { exact: false }).first(); await l.click(); }
  else if (a[0] === 'desliza') {
    // desliza de onde está (ou de a[3]) até a[2] (px ou '#id'), em a[1] segundos, com easing suave
    await p.evaluate(([dur, alvo, de]) => new Promise((ok) => {
      const y1 = typeof alvo === 'string' ? (() => { const [sel, off] = alvo.split('@'); const e = document.querySelector(sel); return e.getBoundingClientRect().top + scrollY + Number(off || 0) * (e.offsetHeight - innerHeight); })() : alvo;
      const y0 = de ?? scrollY; const t0 = performance.now();
      const ease = (x) => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
      const passo = (t) => { const k = Math.min(1, (t - t0) / (dur * 1000)); window.scrollTo(0, y0 + (y1 - y0) * ease(k)); k < 1 ? requestAnimationFrame(passo) : ok(); };
      requestAnimationFrame(passo);
    }), [a[1], a[2], a[3] ?? null]);
  }
  else if (a[0] === 'rola') {
    const fim = Date.now() + a[1] * 1000; let ult = Date.now();
    while (Date.now() < fim) { await p.waitForTimeout(16); const agora = Date.now(); await p.mouse.wheel(0, a[2] * (agora - ult) / 1000); ult = agora; }
  }
}
await cdp.send('Page.stopScreencast');
await b.close();
let lista = '';
frames.forEach((f, i) => {
  const nome = `f${String(i).padStart(5, '0')}.jpg`;
  fs.writeFileSync(`${out}/${nome}`, Buffer.from(f.data, 'base64'));
  const d = i < frames.length - 1 ? frames[i + 1].t - f.t : 1 / 30;
  lista += `file '${nome}'\nduration ${Math.max(d, 0.001).toFixed(4)}\n`;
});
fs.writeFileSync(`${out}/lista.txt`, lista);
const dur = frames.at(-1).t - frames[0].t;
console.log(`${out}: frames=${frames.length} dur=${dur.toFixed(1)}s fps≈${(frames.length / dur).toFixed(1)}`);
