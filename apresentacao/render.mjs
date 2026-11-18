import { chromium } from '/home/user/eduardoo/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const [l, out, so] = process.argv.slice(2); // so = "a,b,c" segundos para testar
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await p.goto(`file://${process.cwd()}/editor.html?l=${l}`);
const dur = await p.evaluate(() => window.DURACAO);
const tempos = so ? so.split(',').map(Number) : Array.from({ length: Math.round(dur * 30) }, (_, i) => i / 30);
let i = 0;
for (const t of tempos) {
  await p.evaluate((t) => window.render(t), t);
  await p.screenshot({ path: `${out}/${String(i++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 93 });
}
await b.close();
console.log('dur', dur.toFixed(2), 'quadros', i);
