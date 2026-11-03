const { chromium } = require(process.argv[2] + '/playwright-core'); const D = process.argv[3];
(async () => { const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1170, height: 2532 } }); await p.goto('file://' + D + '/sent.html'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  await (await p.$('#s')).screenshot({ path: D + '/app/sent.png' }); await b.close(); })();
