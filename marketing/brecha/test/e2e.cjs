// teste ponta a ponta do Brecha (banco local de teste; as ideias daqui sao so para teste)
const { chromium } = require(process.argv[2] + '/playwright-core');
const OUT = process.argv[3]; const B = 'http://127.0.0.1:8790';
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) process.exitCode = 1; };
const hook = (event, email, product, id) => fetch(B + '/api/webhook/cakto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: 'segredo-teste', event, data: { id, customer: { email }, product: { name: product } } }) }).then((r) => r.status);
const ideia = (i, nicho) => ({ titulo: `Ideia de teste ${i} (${nicho})`, nicho, publico: 'Público de teste', por_que: 'Motivo de teste', anuncios_ativos: 5 + i, data_pesquisa: '2026-11-10', formato: 'ebook', o_que_incluir: ['Item 1', 'Item 2'], preco_sugerido: 19.9, canais: ['Grupos do Facebook', 'TikTok'], criativo: i % 2 ? 'video' : 'imagem', dica_criativo: 'Dica de teste', roteiro_com_rosto: 'Roteiro COM rosto', roteiro_sem_rosto: 'Roteiro SEM rosto', base: 'teste' });
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const mk = async () => { const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); return [c, await c.newPage()]; };
  // admin alimenta
  const [ca, a] = await mk();
  await a.goto(B + '/criar-conta'); await a.fill('#e', 'admin@teste.com'); await a.fill('#p', 'senhaadmin1'); await a.click('button[type=submit]'); await a.waitForURL('**/admin');
  await a.click('[data-t=importar]'); await a.waitForSelector('#j');
  const lote = [...Array(6)].map((_, i) => ideia(i + 1, ['maternidade', 'culinaria', 'estudos'][i % 3])); lote.push({ titulo: 'Sem nicho' });
  await a.fill('#j', JSON.stringify(lote)); await a.click('#imp'); await a.waitForSelector('#m .msg');
  const im = await a.textContent('#m'); ok(/6 ideias importadas/.test(im) && /1 recusadas/.test(im), 'importacao: 6 aceitas, 1 recusada -> ' + im.slice(0, 90));
  await a.screenshot({ path: OUT + '/admin-import.png', fullPage: true });
  // cliente sem credito
  const [cc, c] = await mk();
  await c.goto(B + '/'); await c.screenshot({ path: OUT + '/landing.png', fullPage: true });
  await c.goto(B + '/criar-conta'); await c.fill('#e', 'cliente@teste.com'); await c.fill('#p', 'senhacliente1'); await c.click('button[type=submit]'); await c.waitForURL('**/app');
  await c.goto(B + '/app/gerar'); await c.waitForURL('**/app/planos'); ok(true, 'sem credito vai para planos');
  await c.screenshot({ path: OUT + '/planos.png', fullPage: true });
  ok(await hook('purchase_approved', 'cliente@teste.com', 'Brecha Pro', 'ped-1') === 200, 'webhook compra Pro');
  ok(await hook('purchase_approved', 'cliente@teste.com', 'Brecha Pro', 'ped-1') === 200, 'webhook repetido nao duplica');
  ok(await hook('purchase_approved', 'x@teste.com', 'Brecha Pro', 'ped-x').then(() => 0) === 0, 'compra de quem ainda nao tem conta (guardada)');
  const bad = await fetch(B + '/api/webhook/cakto', { method: 'POST', body: JSON.stringify({ secret: 'errado', event: 'purchase_approved', data: { customer: { email: 'h@h.com' }, product: { name: 'Brecha Elite' } } }) });
  ok(bad.status === 401, 'webhook com chave errada recusado');
  await c.goto(B + '/app'); await c.waitForSelector('.saldo'); ok((await c.textContent('.saldo')).includes('12 ideias'), 'saldo Pro = 12');
  // gerar
  await c.goto(B + '/app/gerar'); await c.click('#cats [data-v=maternidade]'); await c.click('#face [data-v=nao]'); await c.click('#budget [data-v="20"]');
  await c.click('#go'); await c.waitForURL('**/app/ideia/**'); await c.waitForSelector('.idea h1');
  ok((await c.textContent('.idea h1')).includes('maternidade'), 'ideia no nicho escolhido');
  ok((await c.textContent('.script')).includes('SEM rosto'), 'roteiro sem rosto para quem nao quer aparecer');
  ok(await c.$('#cr') !== null && (await c.textContent('main')).includes('Dia 7'), 'Pro ve plano de 7 dias e calculadora');
  ok((await c.textContent('main')).includes('R$ 20,00'), 'orcamento diario sugerido');
  await c.screenshot({ path: OUT + '/ideia.png', fullPage: true });
  const first = c.url();
  await c.click('#again'); await c.waitForURL((u) => u.href !== first); await c.waitForSelector('.idea h1');
  ok(c.url() !== first, 'gerar outra traz ideia diferente');
  await c.goto(B + '/app'); await c.waitForSelector('.saldo'); ok((await c.textContent('.saldo')).includes('10 ideias'), 'saldo caiu para 10');
  ok((await c.$$('.item')).length === 2, '2 ideias na lista');
  // inicial ve bloqueado
  const [ci, ini] = await mk();
  await hook('purchase_approved', 'ini@teste.com', 'Brecha Inicial', 'ped-2');
  await ini.goto(B + '/criar-conta'); await ini.fill('#e', 'ini@teste.com'); await ini.fill('#p', 'senhainicial1'); await ini.click('button[type=submit]'); await ini.waitForURL('**/app');
  ok((await ini.textContent('.saldo')).includes('4 ideias'), 'compra antes do cadastro: Inicial = 4 ao criar conta');
  await ini.goto(B + '/app/gerar'); await ini.click('#go'); await ini.waitForSelector('.idea h1');
  ok((await ini.$$('.locked')).length === 2, 'Inicial ve plano de 7 dias e calculadora bloqueados');
  // reembolso
  await hook('refund', 'ini@teste.com', 'Brecha Inicial', 'ped-2');
  await ini.goto(B + '/app'); await ini.waitForSelector('.saldo'); ok((await ini.textContent('.saldo')).includes('0 ideias'), 'reembolso zera creditos restantes');
  // elite + exclusiva
  const [ce, el] = await mk();
  await el.goto(B + '/criar-conta'); await el.fill('#e', 'elite@teste.com'); await el.fill('#p', 'senhaelite12'); await el.click('button[type=submit]'); await el.waitForURL('**/app');
  await hook('purchase_approved', 'elite@teste.com', 'Brecha Elite', 'ped-3');
  await el.goto(B + '/app'); await el.waitForSelector('.saldo'); ok((await el.textContent('.saldo')).includes('25 ideias') && (await el.textContent('.saldo')).includes('+3'), 'Elite = 25 + 3 exclusivas');
  await el.goto(B + '/app/gerar'); await el.click('#go'); await el.waitForSelector('.idea h1');
  ok((await el.textContent('main')).includes('Exclusiva'), 'primeira ideia do Elite e exclusiva');
  // admin painel
  await a.goto(B + '/admin'); await a.waitForSelector('.stats');
  const geral = await a.textContent('#adm'); ok(/Ideias no banco\s*6/.test(geral.replace(/\s+/g, ' ')), 'painel mostra 6 ideias');
  await a.screenshot({ path: OUT + '/admin.png', fullPage: true });
  await a.click('[data-t=cakto]'); await a.waitForSelector('table'); ok((await a.textContent('table')).includes('chave secreta invalida'), 'log da Cakto mostra recusa');
  // seguranca: cliente nao acessa admin
  const r = await c.evaluate(() => fetch('/api/admin/overview').then((x) => x.status)); ok(r === 403, 'cliente nao acessa API admin');
  const r2 = await c.evaluate(() => fetch('/api/ideia/999').then((x) => x.status)); ok(r2 === 404, 'nao abre ideia de outra pessoa');
  // modo escuro
  await c.goto(B + '/app'); await c.click('#theme'); await c.waitForTimeout(200); await c.screenshot({ path: OUT + '/dark.png' });
  const ov = await c.evaluate(() => document.documentElement.scrollWidth - innerWidth); ok(ov <= 0, 'sem rolagem lateral no celular');
  await b.close();
})();
