// capturas da tela do app (celular) para o video
const { chromium } = require(process.argv[2] + '/playwright-core'); const OUT = process.argv[3]; const B = 'http://127.0.0.1:8788';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }); const p = await ctx.newPage();
  await p.goto(B + '/login'); await p.fill('input[name=email]', 'ui5@test.com'); await p.fill('input[name=password]', 'password123'); await p.click('button[type=submit]'); await p.waitForURL('**/app');
  const clean = () => p.evaluate(() => { const t = document.querySelector('.toasts'); if (t) t.style.display = 'none'; if (document.activeElement) document.activeElement.blur(); });
  await p.waitForTimeout(800); await clean(); await p.screenshot({ path: OUT + '/home.png' });
  const set = async (k, v) => { const el = await p.$(`[data-k=${k}]`); if (el) await el.fill(v); };
  const items = async (rows) => { for (let i = 0; i < rows.length; i++) { if (i) await p.click('[data-add=items]'); const rs = await p.$$('.it-row'); await (await rs[i].$('input[data-c=desc]')).fill(rows[i][0]); await (await rs[i].$('input[data-c=price]')).fill(rows[i][1]); } };
  const base = async () => { await set('client_name', 'Sarah Miller'); await set('client_phone', '(813) 555-0199'); await set('property_address', '1420 Oak St, Tampa, FL'); };
  const rows = [['Driveway cleaning (600 sq ft)', '120'], ['House soft wash (2,000 sq ft)', '300'], ['Oil stain pre-treatment', '25']];
  const docs = {
    estimate: async () => { await base(); await items(rows); },
    'residential-agreement': async () => { await base(); await set('services_desc', 'Driveway surface cleaning, house soft wash and oil stain pre-treatment.'); await set('price', '445'); },
    invoice: async () => { await base(); await items(rows); },
  };
  for (const [id, fill] of Object.entries(docs)) {
    await p.evaluate((id) => fetch('/api/drafts/' + id, { method: 'DELETE' }), id);
    await p.goto(B + '/app/doc/' + id); await p.waitForTimeout(700);
    await fill(); await p.waitForTimeout(900);
    await p.click('.seg button[data-pane=prev]'); await p.waitForTimeout(900); await clean();
    await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/${id}-top.png` });
    const sel = await p.evaluate(() => { const d = document.querySelector('.paper'); if (!d) return 'none'; const r = d.getBoundingClientRect(); scrollTo(0, scrollY + r.top - 10); return d.className; });
    console.log(id, sel);
    await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/${id}-doc.png` });
  }
  await b.close();
})();
