// Testes extras da interface: referências de estilo, música, cancelar exportação, 1080p, formato quadrado.
// Uso: node extras.cjs <playwright> <video> <video-referencia> <musica> <pasta-saida>
const { chromium } = require(process.argv[2] + '/playwright-core');
const fs = require('fs');
const [, , , VIDEO, REF, MUSIC, OUT] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') { errs.push(m.text()); console.log('[console]', m.text().slice(0, 300)); } });
  p.on('pageerror', (e) => { errs.push(String(e)); console.log('[pageerror]', String(e).slice(0, 400)); });
  const tap = (sel) => p.$eval(sel, (e) => { e.scrollIntoView({ block: 'center' }); e.click(); });
  await p.goto('http://127.0.0.1:8930/');
  // 1) referências
  await p.click('#refBox summary');
  await p.setInputFiles('#refFiles', [REF]);
  await p.waitForFunction(() => /Aprendido|Não consegui/.test(document.getElementById('refInfo').textContent), null, { timeout: 120000 });
  console.log('referência:', await p.textContent('#refInfo'));
  console.log('estilo:', JSON.stringify(await p.evaluate(() => window.__cortei.style)));
  await p.screenshot({ path: `${OUT}/x-1-referencia.png` });
  await p.reload();
  console.log('depois de recarregar:', await p.evaluate(() => !!window.__cortei.style), '·', await p.textContent('#refPill'));
  // 2) vídeo + tempo personalizado
  await p.setInputFiles('#file', VIDEO);
  await p.waitForSelector('#setup:not([hidden])');
  await p.fill('#durCustom', '22'); await p.dispatchEvent('#durCustom', 'change');
  await p.click('#btnFind'); await p.waitForSelector('#editor:not([hidden])', { timeout: 120000 }); await p.waitForTimeout(1200);
  console.log('cutInfo (22 s, com estilo):', await p.textContent('#cutInfo'));
  await p.screenshot({ path: `${OUT}/x-2-editor-topo.png` });
  await p.evaluate(() => window.scrollTo(0, 700)); await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/x-3-editor-rolado.png` });
  // 3) música
  await p.setInputFiles('#music', MUSIC);
  await p.waitForFunction(() => !document.getElementById('musicVolBox').hidden, null, { timeout: 30000 });
  console.log('música:', await p.textContent('#musicInfo'));
  // 4) legendas falsas, só para conferir o editor de palavras e o desenho
  await p.evaluate(() => {
    const S = window.__cortei; const w = []; const t = ['olha', 'só', 'o', 'que', 'aconteceu', 'aqui', 'agora'];
    for (let i = 0; i < 40; i++) w.push({ text: t[i % t.length], start: 0.4 + i * 0.3, end: 0.65 + i * 0.3 });
    window.__fake = w;
  });
  // 5) cancelar exportação
  await tap('#qChips [data-v="1080"]'); await tap('#aspChips2 [data-v="1:1"]');
  await tap('#btnExport'); await p.waitForSelector('#exporting:not([hidden])'); await p.waitForTimeout(2500);
  await p.click('#btnCancel'); await p.waitForSelector('#exporting[hidden]', { state: 'attached', timeout: 20000 });
  console.log('cancelar: ok · tela do editor visível:', await p.evaluate(() => !document.getElementById('editor').hidden));
  // 6) exportar de verdade em 1080p quadrado com música
  await tap('#btnExport');
  await p.waitForSelector('#done:not([hidden])', { timeout: 600000 });
  console.log('pronto:', await p.textContent('#doneMeta'));
  console.log('botão salvar visível:', await p.evaluate(() => !document.getElementById('btnSave').hidden));
  const b64 = await p.evaluate(async () => { const r = window.__cortei.result; const buf = new Uint8Array(await r.blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode.apply(null, buf.subarray(i, i + 32768)); return { ext: r.ext, data: btoa(s) }; });
  fs.writeFileSync(`${OUT}/x-1080-quadrado.${b64.ext}`, Buffer.from(b64.data, 'base64'));
  // 7) voltar ao ritmo padrão
  await p.click('#btnNew'); await p.click('#refBox summary').catch(() => {}); await p.click('#refClear');
  console.log('ritmo padrão de volta:', await p.evaluate(() => window.__cortei.style === null), '·', await p.textContent('#refInfo'));
  console.log(errs.length ? `ERROS: ${errs.length}` : 'sem erros no console');
  await b.close();
})().catch((e) => { console.error('FALHOU', e); process.exit(1); });
