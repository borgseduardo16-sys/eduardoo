const { chromium } = require(process.argv[2] + '/playwright-core'); const D = process.argv[3];
(async () => { const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1080, height: 3300 } }); await p.goto('file://' + D + '/img3.html'); await p.evaluate(() => document.fonts.ready); await p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalHeight > 0)); await p.waitForTimeout(800);
  await (await p.$('#f')).screenshot({ path: D + '/../ads/criativo3-feed-4x5.jpg', type: 'jpeg', quality: 93 });
  await (await p.$('#s')).screenshot({ path: D + '/../ads/criativo3-story-9x16.jpg', type: 'jpeg', quality: 93 }); await b.close(); })();
