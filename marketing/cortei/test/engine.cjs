// Teste do motor: abre o vídeo de teste, analisa, monta o clipe e exporta. Uso: node engine.cjs <playwright> <video> <saida>
const { chromium } = require(process.argv[2] + '/playwright-core');
const fs = require('fs');
const [, , , VIDEO, OUT] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage();
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.text().slice(0, 300)); });
  p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)));
  await p.goto('http://127.0.0.1:8930/t/engine.html');
  await p.setInputFiles('#f', VIDEO);
  const run = (fn, arg) => p.evaluate(fn, arg);
  console.log('open', JSON.stringify(await run(() => T.open(document.getElementById('f').files[0]))));
  console.log('analyze', JSON.stringify(await run(() => T.analyze())));
  const c = await run(() => T.candidates(15)); console.log('cand', JSON.stringify(c.map((x) => [x.start.toFixed(2), x.score.toFixed(3)])));
  const cutSeg = await run(() => T.segments(0, true)); console.log('seg(cut)', JSON.stringify(cutSeg.tl.segments.map((g) => [g.s.toFixed(2), g.e.toFixed(2)])), 'outDur', cutSeg.tl.outDur.toFixed(2), 'ev', JSON.stringify(cutSeg.ev), 'sfx', JSON.stringify(cutSeg.sfx));
  console.log('a16k', JSON.stringify(await run(() => T.audio16k())));
  const words = [{ text: 'Esse', start: 0.5, end: 0.8 }, { text: 'é', start: 0.8, end: 0.95 }, { text: 'um', start: 0.95, end: 1.1 }, { text: 'teste', start: 1.1, end: 1.6 }, { text: 'de', start: 1.7, end: 1.85 }, { text: 'legenda', start: 1.85, end: 2.4 }, { text: 'animada.', start: 2.4, end: 3.0 }];
  for (let i = 12; i < 60; i++) words.push({ text: ['olha', 'isso', 'aqui', 'agora', 'mano'][i % 5], start: i * 0.25, end: i * 0.25 + 0.22 });
  const r = await run((w) => T.export({ aspect: '9:16', quality: 720, framing: 'blur', title: 'Título de teste do clipe', words: w, style: 'impacto' }), words);
  console.log('export', JSON.stringify(r));
  fs.writeFileSync(OUT + '.' + r.ext, Buffer.from(await run(() => T.blobBase64()), 'base64'));
  await b.close();
})().catch((e) => { console.error('FALHOU', e); process.exit(1); });
