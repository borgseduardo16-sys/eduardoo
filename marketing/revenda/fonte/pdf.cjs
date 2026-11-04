// HTML -> PDF (A4) e capturas de algumas paginas para conferencia
const { chromium } = require(process.argv[2] + '/playwright-core');
(async () => {
  const [, , , html, pdf, shots] = process.argv;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage(); await p.goto('file://' + html); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
  await p.pdf({ path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true });
  if (shots) {
    await p.setViewportSize({ width: 794, height: 1123 });
    const n = await p.$$eval('section.p', (s) => s.length);
    for (const i of shots.split(',').map(Number).filter((i) => i < n)) await (await p.$$('section.p'))[i].screenshot({ path: `${html}.${i}.png` });
  }
  await b.close();
})();
