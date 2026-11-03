const { chromium } = require(process.argv[2] + '/playwright-core'); const D = process.argv[3];
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await p.goto('file://' + D + '/gfx.html'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
  for (let i = 0; i < 11; i++) await (await p.$('#c' + i)).screenshot({ path: `${D}/g/cap${i}.png`, omitBackground: true });
  await (await p.$('#end916')).screenshot({ path: `${D}/g/end916.png` });
  await (await p.$('#end45')).screenshot({ path: `${D}/g/end45.png` });
  await b.close();
})();
