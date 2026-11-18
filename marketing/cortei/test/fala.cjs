// Teste de ponta a ponta: dois vídeos em sequência, ouvir a fala (modelo local), cortar erros, legendas e exportar.
// Depois envia o vídeo exportado de volta ao app e transcreve de novo, para conferir que os erros saíram.
// Uso: MODELS_DIR=... node test/serve.mjs 8930  e  node test/fala.cjs <playwright> <video1> <video2> <pasta-saida>
const { chromium } = require(process.argv[2] + '/playwright-core');
const fs = require('fs');
const [, , , V1, V2, OUT] = process.argv;
const URL = 'http://127.0.0.1:8930/?asrmodel=local&asr=wasm&m=' + (process.env.M || 'base');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') { errs.push(m.text()); console.log('[console]', m.text().slice(0, 300)); } });
  p.on('pageerror', (e) => { errs.push(String(e)); console.log('[pageerror]', String(e).slice(0, 400)); });
  await p.goto(URL);
  await p.click('[data-mode="full"]');
  await p.setInputFiles('#file', [V1, V2]);
  await p.waitForSelector('#setup:not([hidden])');
  console.log('lista:', await p.$$eval('#clipList li', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim())), '·', await p.textContent('#totalMeta'));
  // troca a ordem e volta, para testar os botões
  await p.click('[data-down="0"]'); console.log('depois de descer o 1º:', await p.$$eval('#clipList b', (els) => els.map((e) => e.textContent)));
  await p.click('[data-up="1"]');
  await p.screenshot({ path: `${OUT}/f-1-setup.png` });
  await p.click('#btnFind');
  await p.waitForSelector('#editor:not([hidden])', { timeout: 120000 });
  console.log('antes:', await p.textContent('#cutInfo'));
  const t0 = Date.now();
  await p.click('#btnAsr');
  await p.waitForFunction(() => !window.__cortei.asr.busy && window.__cortei.asr.used !== undefined && document.getElementById('asrProg').hidden && (window.__cortei.asr.words.length || !document.getElementById('asrErr').hidden), null, { timeout: 300000, polling: 500 });
  await p.waitForTimeout(1500);
  await p.waitForFunction(() => !window.__cortei.asr.busy, null, { timeout: 300000 });
  console.log('transcrição em', ((Date.now() - t0) / 1000).toFixed(1), 's · erro:', await p.textContent('#asrErr'));
  console.log('palavras:', await p.evaluate(() => window.__cortei.asr.words.map((w) => `${w.text}@${w.start.toFixed(2)}`).join(' ')));
  console.log('aproximado:', await p.evaluate(() => window.__cortei.asr.approx));
  console.log('erros:', await p.textContent('#fixInfo'));
  console.log('lista de erros:', await p.$$eval('#fixList li', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim())));
  console.log('depois:', await p.textContent('#cutInfo'));
  console.log('legendas:', await p.evaluate(() => window.__cortei.cap.words.map((w) => w.text).join(' ')));
  await p.screenshot({ path: `${OUT}/f-2-editor.png`, fullPage: true });
  // desmarca e marca um erro
  const n0 = await p.evaluate(() => window.__cortei.tl.outDur);
  if (await p.$('#fixList input')) {
    await p.click('#fixList input >> nth=0'); const n1 = await p.evaluate(() => window.__cortei.tl.outDur);
    await p.click('#fixList input >> nth=0'); const n2 = await p.evaluate(() => window.__cortei.tl.outDur);
    console.log('duração com/sem/com o 1º corte:', n0.toFixed(2), n1.toFixed(2), n2.toFixed(2));
  }
  // prévia atravessando os dois vídeos
  await p.click('#btnPlay'); await p.waitForTimeout(4000); await p.click('#btnPlay');
  console.log('prévia:', await p.textContent('#clock'));
  await p.click('#styChips [data-v="impacto"]'); await p.click('#fontChips [data-v="anton"]');
  await p.fill('#scrub', '3'); await p.dispatchEvent('#scrub', 'input'); await p.waitForTimeout(800);
  await (await p.$('#pv')).screenshot({ path: `${OUT}/f-3-legenda.png` });
  await p.click('#btnExport');
  await p.waitForSelector('#done:not([hidden])', { timeout: 300000 });
  console.log('exportado:', await p.textContent('#doneMeta'));
  const res = await p.evaluate(async () => { const r = window.__cortei.result; const buf = new Uint8Array(await r.blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode.apply(null, buf.subarray(i, i + 32768)); return { ext: r.ext, data: btoa(s) }; });
  const outFile = `${OUT}/f-resultado.${res.ext}`;
  fs.writeFileSync(outFile, Buffer.from(res.data, 'base64'));
  // confere: transcreve o resultado (sem cortar nada)
  const q = await ctx.newPage();
  await q.goto(URL); await q.click('[data-mode="full"]'); await q.setInputFiles('#file', outFile);
  await q.waitForSelector('#setup:not([hidden])'); await q.click('#btnFind'); await q.waitForSelector('#editor:not([hidden])', { timeout: 120000 });
  await q.evaluate(() => { document.getElementById('optFix').click(); });
  await q.click('#btnAsr'); await q.waitForTimeout(1000);
  await q.waitForFunction(() => !window.__cortei.asr.busy, null, { timeout: 300000, polling: 500 });
  console.log('fala no vídeo final:', await q.evaluate(() => window.__cortei.asr.words.map((w) => w.text).join(' ')));
  console.log(errs.length ? `ERROS: ${errs.length}` : 'sem erros no console');
  await b.close();
})().catch((e) => { console.error('FALHOU', e); process.exit(1); });
