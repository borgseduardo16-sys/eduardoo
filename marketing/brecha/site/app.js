// Brecha · app (sem build: JS puro)
const $app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
const date = (t) => new Date(t * 1000).toLocaleDateString('pt-BR');
const NICHOS = { culinaria: 'Culinária', saude: 'Saúde e bem-estar', beleza: 'Beleza', estudos: 'Estudos e concursos', financas: 'Finanças e renda extra', maternidade: 'Mães e crianças', pets: 'Pets', casa: 'Casa e organização', fitness: 'Fitness', religiao: 'Religião e fé', artesanato: 'Artesanato', tecnologia: 'Tecnologia', relacionamentos: 'Relacionamentos', moda: 'Moda', outros: 'Outros' };
const FORMATOS = { ebook: 'Ebook', planilha: 'Planilha', kit: 'Kit', curso: 'Curso', desafio: 'Desafio', template: 'Template', servico: 'Serviço', outro: 'Produto digital' };
const PLANOS = [
  { id: 'inicial', nome: 'Inicial', preco: '14,90', ideias: 4, por: '3,73', itens: ['4 ideias completas', 'Roteiro de vídeo ou imagem', 'Orçamento diário sugerido'], off: ['Plano de divulgação de 7 dias', 'Calculadora de lucro'] },
  { id: 'pro', nome: 'Pro', preco: '29,90', ideias: 12, por: '2,49', hl: true, itens: ['10 ideias + 2 de bônus', 'Roteiro de vídeo ou imagem', 'Orçamento diário sugerido', 'Plano de divulgação de 7 dias', 'Calculadora de lucro'] },
  { id: 'elite', nome: 'Elite', preco: '49,90', ideias: 25, por: '2,00', itens: ['25 ideias', 'Tudo do Pro', 'Ideias novas antes de todo mundo', '3 ideias exclusivas, só suas'] },
];
let ME = null, CONFIG = null;

// ---------------- tema
const theme = { get: () => { try { return localStorage.getItem('br_theme'); } catch { return null; } },
  set: (v) => { try { localStorage.setItem('br_theme', v); } catch { /* sem storage */ } } };
function applyTheme() { const t = theme.get(); if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
function toggleTheme() {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  theme.set(dark ? 'light' : 'dark'); applyTheme();
}
applyTheme();

// ---------------- api
async function api(path, opts = {}) {
  const r = await fetch(path, { method: opts.method || 'GET', headers: opts.body ? { 'Content-Type': 'application/json' } : {}, body: opts.body ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : undefined, credentials: 'same-origin' });
  let data = {}; try { data = await r.json(); } catch { /* sem corpo */ }
  if (!r.ok) { const e = new Error(data.error || 'Algo deu errado. Tente de novo.'); e.status = r.status; e.code = data.code; throw e; }
  return data;
}
async function loadMe() { try { ME = await api('/api/me'); } catch { ME = null; } return ME; }
async function loadConfig() { if (!CONFIG) { try { CONFIG = await api('/api/config'); } catch { CONFIG = { checkout: {} }; } } return CONFIG; }

// ---------------- layout
const LOGO = '<svg viewBox="0 0 32 32"><path d="M9 23 L16 9 L23 23" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
function header() {
  const right = ME
    ? `${ME.admin ? '<a class="btn ghost hide-sm" href="/admin" data-link>Painel</a>' : ''}<a class="btn ghost" href="/app" data-link>Minhas ideias</a>`
    : `<a class="btn ghost hide-sm" href="/entrar" data-link>Entrar</a><a class="btn" href="/criar-conta" data-link>Criar conta</a>`;
  return `<header class="top"><div class="w"><a class="logo" href="/" data-link><i>${LOGO}</i>Brecha</a><nav class="nav"><button class="icon-btn" id="theme" aria-label="Alternar modo escuro">${MOON}</button>${right}</nav></div></header>`;
}
function render(html) {
  $app.innerHTML = header() + html;
  document.getElementById('theme').onclick = toggleTheme;
  window.scrollTo(0, 0);
}
function go(path) { history.pushState({}, '', path); route(); }
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (a && !e.metaKey && !e.ctrlKey) { e.preventDefault(); go(a.getAttribute('href')); }
});
window.addEventListener('popstate', route);
const loading = (t = 'Carregando...') => `<div class="loading"><div class="spin"></div><span class="muted">${t}</span></div>`;
const msg = (t, kind = 'err') => (t ? `<div class="msg ${kind}" role="alert">${esc(t)}</div>` : '');

function plansHtml(cta = 'buy') {
  const co = CONFIG?.checkout || {};
  return `<div class="plans">${PLANOS.map((p) => `<div class="card plan ${p.hl ? 'hl' : ''}">${p.hl ? '<span class="badge">Mais escolhido</span>' : ''}
    <h3>${p.nome}</h3><div class="price">R$ ${p.preco} <small>· ${p.ideias} ideias</small></div><div class="muted small">R$ ${p.por} por ideia · créditos não vencem</div>
    <ul>${p.itens.map((i) => `<li>${i}</li>`).join('')}${(p.off || []).map((i) => `<li class="off">${i}</li>`).join('')}</ul>
    ${cta === 'buy' ? (co[p.id] ? `<a class="btn ${p.hl ? '' : 'ghost'} full" href="${esc(co[p.id])}" target="_blank" rel="noopener">Quero o ${p.nome}</a>` : '<button class="btn ghost full" disabled>Em breve</button>') : `<a class="btn ${p.hl ? '' : 'ghost'} full" href="/criar-conta" data-link>Começar</a>`}
  </div>`).join('')}</div>`;
}

// ---------------- páginas públicas
function landing() {
  render(`<main>
  <section class="hero"><div class="w"><span class="tag">Ideias de produto com pouca concorrência</span>
    <h1>Pare de vender o que <span>todo mundo já vende.</span></h1>
    <p class="lead">A Brecha te entrega ideias de produtos digitais com potencial de venda e pouca concorrência, com preço sugerido, roteiro do anúncio e onde divulgar.</p>
    <div class="cta-row"><a class="btn big" href="${ME ? '/app/gerar' : '/criar-conta'}" data-link>${ME ? 'Gerar uma ideia' : 'Criar minha conta'}</a><a class="btn big ghost" href="#planos">Ver planos</a></div></div></section>
  <section class="block"><div class="w"><h2>O problema de copiar o que está no topo</h2>
    <div class="compare">
      <div class="card"><b>🚗 Abrir outra loja de carro na mesma rua</b><p>Produto que está no topo já tem dezenas de vendedores, com mais experiência e mais clientes. Você chega por último e briga por preço.</p></div>
      <div class="card"><b>🏍️ Abrir a loja de moto que ninguém abriu</b><p>Um produto com demanda, mas com poucos anúncios rodando. Mesmo público, sem a mesma briga. É isso que a Brecha procura pra você.</p></div>
    </div></div></section>
  <section class="block"><div class="w"><h2>Como funciona</h2><div class="grid3">
    <div class="card"><div class="num">1</div><h3>Responda 3 perguntas</h3><p>O que você curte, quanto pode investir e se quer aparecer nos vídeos.</p></div>
    <div class="card"><div class="num">2</div><h3>Receba a sua ideia</h3><p>Nicho, público, por que tem potencial, quantos anúncios existem hoje e o preço sugerido.</p></div>
    <div class="card"><div class="num">3</div><h3>Saia com o plano pronto</h3><p>Roteiro do criativo, onde divulgar e quanto gastar por dia, se quiser anunciar.</p></div>
  </div></div></section>
  <section class="block" id="planos"><div class="w"><h2>Planos</h2><p class="muted" style="margin-top:6px">Pagamento único. Os créditos não vencem.</p>${plansHtml(ME ? 'buy' : 'start')}</div></section>
  <section class="block faq"><div class="w narrow"><h2 style="margin-bottom:8px">Perguntas</h2>
    <details><summary>De onde vêm as ideias?</summary><p>De pesquisa na biblioteca de anúncios: buscamos produtos com demanda e poucos anunciantes. Cada ideia mostra quantos anúncios ativos foram encontrados e a data da pesquisa.</p></details>
    <details><summary>Preciso saber criar produto?</summary><p>Não. A ideia vem com o que incluir no produto, o formato recomendado e um roteiro para divulgar.</p></details>
    <details><summary>A Brecha garante vendas?</summary><p>Não existe garantia de vendas. A Brecha te entrega a ideia e o plano; o resultado depende de você colocar em prática.</p></details>
    <details><summary>Como pago?</summary><p>Pelo checkout seguro, com Pix ou cartão. Use o mesmo e-mail da sua conta na compra: os créditos entram sozinhos.</p></details>
  </div></section></main>
  <footer class="foot"><div class="w">© Brecha · Ideias de produtos digitais. Não prometemos ganhos.</div></footer>`);
}

function authPage(kind) {
  const isNew = kind === 'new';
  render(`<main class="auth"><h2>${isNew ? 'Criar conta' : 'Entrar'}</h2><p class="muted" style="margin:6px 0 20px">${isNew ? 'Use o mesmo e-mail que você vai usar na compra.' : 'Bem-vindo de volta.'}</p>
    <div id="m"></div><form id="f" novalidate>
    <div class="field"><label for="e">E-mail</label><input id="e" type="email" autocomplete="email" required></div>
    <div class="field"><label for="p">Senha</label><input id="p" type="password" autocomplete="${isNew ? 'new-password' : 'current-password'}" minlength="8" required>${isNew ? '<small class="muted">Pelo menos 8 caracteres.</small>' : ''}</div>
    <button class="btn full big" type="submit">${isNew ? 'Criar conta' : 'Entrar'}</button></form>
    <p class="muted small" style="margin-top:16px">${isNew ? 'Já tem conta? <a href="/entrar" data-link>Entrar</a>' : 'Não tem conta? <a href="/criar-conta" data-link>Criar conta</a><br>Esqueceu a senha? Fale com o suporte para receber um link de nova senha.'}</p></main>`);
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault(); const b = e.submitter; b.disabled = true;
    try { await api(isNew ? '/api/register' : '/api/login', { method: 'POST', body: { email: document.getElementById('e').value, password: document.getElementById('p').value } }); await loadMe(); go(ME?.admin ? '/admin' : '/app'); }
    catch (x) { document.getElementById('m').innerHTML = msg(x.message); b.disabled = false; }
  };
}
function resetPage() {
  const t = new URLSearchParams(location.search).get('t') || '';
  render(`<main class="auth"><h2>Nova senha</h2><div id="m" style="margin-top:14px"></div><form id="f">
    <div class="field"><label for="p">Nova senha</label><input id="p" type="password" autocomplete="new-password" minlength="8" required></div>
    <button class="btn full big" type="submit">Salvar senha</button></form></main>`);
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/api/reset', { method: 'POST', body: { token: t, password: document.getElementById('p').value } }); document.getElementById('m').innerHTML = msg('Senha alterada. Agora é só entrar.', 'ok'); setTimeout(() => go('/entrar'), 1200); }
    catch (x) { document.getElementById('m').innerHTML = msg(x.message); }
  };
}

// ---------------- app
function saldoTxt() { return ME.admin ? 'ilimitado (admin)' : `${ME.credits} ${ME.credits === 1 ? 'ideia' : 'ideias'}`; }
function home() {
  render(`<main class="page"><div class="w narrow">
    <div class="bar"><div><div class="muted small">Seu saldo</div><div class="saldo"><b>${saldoTxt()}</b>${ME.exclusivas ? `<span class="pill blue">+${ME.exclusivas} exclusivas</span>` : ''}</div></div>
      <div class="chips"><a class="btn" href="/app/gerar" data-link>Gerar ideia</a><a class="btn ghost" href="/app/planos" data-link>Comprar ideias</a></div></div>
    <h3 style="margin-bottom:10px">Minhas ideias</h3>
    ${ME.ideias.length ? `<div class="list">${ME.ideias.map((i) => `<a class="item" href="/app/ideia/${i.id}" data-link><span><b>${esc(i.titulo)}</b><br><small>${esc(NICHOS[i.nicho] || i.nicho)} · ${date(i.created_at)}</small></span>${i.exclusive ? '<span class="pill blue">Exclusiva</span>' : '<span class="pill">Ver</span>'}</a>`).join('')}</div>`
      : `<div class="card"><p>Você ainda não gerou nenhuma ideia. ${ME.credits || ME.admin ? 'Bora gerar a primeira?' : 'Escolha um plano para começar.'}</p></div>`}
    <p class="muted small" style="margin-top:22px">Conta: ${esc(ME.email)} · <a href="#" id="out">Sair</a></p>
  </div></main>`);
  document.getElementById('out').onclick = async (e) => { e.preventDefault(); await api('/api/logout', { method: 'POST' }).catch(() => {}); ME = null; go('/'); };
}
async function plansPage() {
  await loadConfig();
  render(`<main class="page"><div class="w"><h2>Escolha seu plano</h2>
    <p class="muted" style="margin-top:6px">Na compra, use o e-mail <b>${esc(ME.email)}</b>. Os créditos entram sozinhos na sua conta em instantes.</p>
    ${plansHtml('buy')}<p class="muted small" style="margin-top:18px">Já pagou e o saldo não mudou? Espere 1 minuto e <a href="/app" data-link>atualize</a>.</p></div></main>`);
}

function chipsHtml(sel = []) {
  return `<div class="chips" id="cats">${Object.entries(NICHOS).map(([k, v]) => `<button type="button" class="chip" data-v="${k}" aria-pressed="${sel.includes(k)}">${v}</button>`).join('')}</div>`;
}
function bindChips(root, single) {
  root.querySelectorAll('.chip').forEach((c) => c.onclick = () => {
    if (single) root.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', 'false'));
    c.setAttribute('aria-pressed', String(single ? true : c.getAttribute('aria-pressed') !== 'true'));
  });
}
const picked = (root) => [...root.querySelectorAll('.chip[aria-pressed=true]')].map((c) => c.dataset.v);

async function runGenerate(body, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Procurando sua brecha...'; }
  try {
    const r = await api('/api/generate', { method: 'POST', body });
    await loadMe(); go(`/app/ideia/${r.id}${r.outro_nicho ? '?outro=1' : ''}`);
  } catch (x) {
    if (x.code === 'no_credits') return go('/app/planos');
    alert(x.message); if (btn) { btn.disabled = false; btn.textContent = 'Gerar minha ideia'; }
  }
}
function wizard() {
  if (!ME.admin && ME.credits < 1) return go('/app/planos');
  render(`<main class="page"><div class="w narrow"><h2>Vamos achar sua brecha</h2><p class="muted" style="margin:6px 0 24px">3 perguntas rápidas. Saldo: ${saldoTxt()}.</p>
    <div class="step"><h3>1. Quais assuntos você curte?</h3><p>Escolha um ou mais.</p>${chipsHtml()}</div>
    <div class="step"><h3>2. Quanto pode investir por dia em anúncio?</h3><p>Se não quiser gastar nada, tudo bem: a ideia vem com plano orgânico.</p>
      <div class="chips" id="budget"><button type="button" class="chip" data-v="0" aria-pressed="true">Nada, só orgânico</button><button type="button" class="chip" data-v="20" aria-pressed="false">Até R$ 20</button><button type="button" class="chip" data-v="50" aria-pressed="false">Até R$ 50</button><button type="button" class="chip" data-v="50+" aria-pressed="false">Mais de R$ 50</button></div></div>
    <div class="step"><h3>3. Você quer aparecer nos vídeos?</h3><p>Ajustamos o roteiro pra você.</p>
      <div class="chips" id="face"><button type="button" class="chip" data-v="sim" aria-pressed="false">Sim</button><button type="button" class="chip" data-v="nao" aria-pressed="false">Não</button><button type="button" class="chip" data-v="tanto" aria-pressed="true">Tanto faz</button></div></div>
    <button class="btn big full" id="go">Gerar minha ideia</button><p class="muted small" style="margin-top:10px;text-align:center">Usa 1 crédito.</p></div></main>`);
  const cats = document.getElementById('cats'), bud = document.getElementById('budget'), face = document.getElementById('face');
  bindChips(cats); bindChips(bud, true); bindChips(face, true);
  document.getElementById('go').onclick = (e) => runGenerate({ cats: picked(cats), budget: picked(bud)[0], face: picked(face)[0] }, e.currentTarget);
}

async function ideaPage(id) {
  render(loading('Abrindo sua ideia...'));
  let r; try { r = await api(`/api/ideia/${id}`); } catch (x) { return render(`<main class="page"><div class="w narrow">${msg(x.message)}<a class="btn ghost" href="/app" data-link>Voltar</a></div></main>`); }
  const d = r.idea, pro = !!r.plano7, outro = new URLSearchParams(location.search).get('outro');
  const lockBox = (title, inner) => `<div class="card sec locked"><h3>${title}</h3><div class="blur">${inner}</div><div class="over"><div><b>Disponível no plano Pro</b><br><a class="btn" style="margin-top:10px" href="/app/planos" data-link>Ver planos</a></div></div></div>`;
  const plano7 = pro ? `<div class="card sec"><h3>Plano de divulgação de 7 dias</h3><ol>${r.plano7.map((t, i) => `<li><b>Dia ${i + 1}:</b> ${esc(t)}</li>`).join('')}</ol></div>`
    : lockBox('Plano de divulgação de 7 dias', '<ol><li>Dia 1: monte o produto com os itens da lista</li><li>Dia 2: cadastre e prepare o criativo</li><li>Dia 3: publique nos grupos</li><li>Dia 4: grave o vídeo</li></ol>');
  const calc = pro ? `<div class="card sec"><h3>Calculadora de lucro</h3><div class="calc">
      <div class="field"><label>Preço de venda</label><input id="cp" inputmode="decimal" value="${String(d.preco_sugerido).replace('.', ',')}"></div>
      <div class="field"><label>Taxa da plataforma (%)</label><input id="ct" inputmode="decimal" value="10"></div>
      <div class="field"><label>Vendas por dia</label><input id="cv" inputmode="numeric" value="5"></div>
      <div class="field"><label>Anúncio por dia (R$)</label><input id="ca" inputmode="decimal" value="${r.orcamento.diario || 0}"></div></div>
      <p id="cr" style="font-weight:700"></p><p class="muted small">Simulação. Os números reais dependem das suas vendas.</p></div>`
    : lockBox('Calculadora de lucro', '<p>Preço R$ 19,90 · 5 vendas por dia · lucro do mês R$ ...</p>');
  render(`<main class="page idea"><div class="w narrow">
    <a href="/app" data-link class="small">← Minhas ideias</a>
    ${outro ? msg('Não havia ideia nova nos assuntos escolhidos agora, então trouxemos a melhor disponível em outro nicho.', 'ok') : ''}
    <div class="chips" style="margin-top:14px"><span class="pill blue">${esc(NICHOS[d.nicho] || d.nicho)}</span><span class="pill">${esc(FORMATOS[d.formato] || 'Produto digital')}</span>${r.exclusiva ? '<span class="pill ok">Exclusiva: só você recebeu</span>' : ''}</div>
    <h1>${esc(d.titulo)}</h1><p class="muted">${esc(d.publico)}</p>
    <div class="stats">
      <div class="stat"><small>Anúncios ativos encontrados</small><b>${esc(d.anuncios_ativos)}</b><small>pesquisa de ${esc(d.data_pesquisa.split('-').reverse().join('/'))}</small></div>
      <div class="stat"><small>Preço sugerido</small><b>${money(d.preco_sugerido)}</b></div>
      <div class="stat"><small>Orçamento por dia</small><b>${r.orcamento.diario ? money(r.orcamento.diario) : 'R$ 0 (orgânico)'}</b></div>
    </div>
    <div class="card sec"><h3>Por que tem potencial</h3><p style="color:var(--ink)">${esc(d.por_que)}</p></div>
    <div class="card sec"><h3>O que colocar no produto</h3><ul>${d.o_que_incluir.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
    <div class="card sec"><h3>Onde divulgar</h3><div class="chips">${d.canais.map((c) => `<span class="pill">${esc(c)}</span>`).join('')}</div></div>
    <div class="card sec"><h3>Criativo recomendado: ${d.criativo === 'video' ? 'vídeo curto' : 'imagem'}</h3><p style="color:var(--ink)">${esc(d.dica_criativo || (d.criativo === 'video' ? 'Vídeo curto, direto, mostrando o produto por dentro.' : 'Uma imagem limpa, com o nome do produto, o benefício principal e o preço. Pouco texto.'))}</p></div>
    <div class="card sec"><h3>Roteiro · ${esc(r.roteiro_tipo)}</h3><div class="script">${esc(r.roteiro)}</div></div>
    <div class="card sec"><h3>Quanto gastar com anúncio</h3><p style="color:var(--ink)">${esc(r.orcamento.texto)}</p></div>
    ${plano7}${calc}
    <div class="again"><h3>Não gostou da ideia? Gere outra agora</h3><p class="muted" style="margin:4px 0 12px">O que você está imaginando?</p>${chipsHtml(r.answers.cats || [])}
      <button class="btn full" id="again" style="margin-top:14px">${ME.admin || ME.credits > 0 ? 'Gerar outra ideia (1 crédito)' : 'Comprar mais ideias'}</button></div>
  </div></main>`);
  const cats = document.getElementById('cats'); bindChips(cats);
  document.getElementById('again').onclick = (e) => (ME.admin || ME.credits > 0) ? runGenerate({ cats: picked(cats), budget: r.answers.budget, face: r.answers.face }, e.currentTarget) : go('/app/planos');
  if (pro) {
    const num = (id) => Number(String(document.getElementById(id).value).replace(',', '.')) || 0;
    const upd = () => { const p = num('cp'), t = num('ct'), v = num('cv'), a = num('ca'); const dia = p * (1 - t / 100) * v - a; document.getElementById('cr').textContent = `Lucro por dia: ${money(dia)} · em 30 dias: ${money(dia * 30)}`; };
    ['cp', 'ct', 'cv', 'ca'].forEach((i) => document.getElementById(i).oninput = upd); upd();
  }
}

// ---------------- admin
const EXEMPLO = [{ titulo: 'Kit de lancheira saudável para mães que trabalham fora', nicho: 'maternidade', publico: 'Mães de crianças de 3 a 10 anos que trabalham fora e não têm tempo de pensar no lanche da escola', por_que: 'Busca alta por lanche escolar e poucos anunciantes vendendo cardápio pronto com lista de compras.', anuncios_ativos: 7, data_pesquisa: '2026-11-10', formato: 'kit', o_que_incluir: ['30 lanches para 6 semanas', 'Lista de compras por semana', 'Etiquetas para potes'], preco_sugerido: 19.9, canais: ['Grupos de mães no Facebook', 'Instagram Reels'], criativo: 'video', dica_criativo: 'Vídeo de 15 segundos montando uma lancheira colorida.', roteiro_com_rosto: 'Gancho: "Seu filho volta com o lanche intacto?"...', roteiro_sem_rosto: 'Mostre as mãos montando a lancheira...', base: 'lancheira-escolar' }];
async function adminPage(tab = 'geral') {
  render(loading());
  const tabs = [['geral', 'Visão geral'], ['importar', 'Alimentar ideias'], ['ideias', 'Ideias'], ['clientes', 'Clientes'], ['cakto', 'Cakto']];
  const shell = (inner) => render(`<main class="page"><div class="w"><div class="bar"><h2>Painel</h2><a class="btn ghost" href="/app" data-link>Usar o app</a></div>
    <div class="tabs" role="tablist">${tabs.map(([k, v]) => `<button class="tab" role="tab" data-t="${k}" aria-selected="${k === tab}">${v}</button>`).join('')}</div><div id="adm">${inner}</div></div></main>`);
  const bindTabs = () => document.querySelectorAll('.tab').forEach((b) => b.onclick = () => adminPage(b.dataset.t));
  try {
    if (tab === 'geral' || tab === 'cakto') {
      const o = await api('/api/admin/overview');
      if (tab === 'cakto') {
        shell(`<div class="card"><h3>Últimos avisos da Cakto</h3><div class="tw"><table><tr><th>Quando</th><th>Evento</th><th>E-mail</th><th>Resultado</th></tr>${o.webhook.map((w) => `<tr><td>${new Date(w.at * 1000).toLocaleString('pt-BR')}</td><td>${esc(w.event)}</td><td>${esc(w.email)}</td><td>${w.ok ? '' : '⚠️ '}${esc(w.note)}</td></tr>`).join('') || '<tr><td colspan=4 class="muted">Nenhum aviso ainda.</td></tr>'}</table></div></div>`);
        return bindTabs();
      }
      shell(`${o.alerta ? `<div class="alert">⚠️ Hora de alimentar: restam ${o.novas} ideias novas${o.dias_restantes !== null ? `, o que dá para uns ${o.dias_restantes} dias no ritmo atual` : ''}.</div>` : ''}
        <div class="stats"><div class="stat"><small>Ideias novas (nunca entregues)</small><b>${o.novas}</b></div><div class="stat"><small>Ideias no banco</small><b>${o.total}</b></div>
        <div class="stat"><small>Entregas nos últimos 7 dias</small><b>${o.entregas_7d}</b><small>${o.por_dia} por dia</small></div><div class="stat"><small>Estoque dura</small><b>${o.dias_restantes === null ? '—' : o.dias_restantes + ' dias'}</b></div>
        <div class="stat"><small>Contas</small><b>${o.usuarios}</b></div><div class="stat"><small>Vendas aprovadas</small><b>${o.vendas}</b></div></div>
        <div class="card"><h3>Estoque por nicho</h3><div class="tw"><table><tr><th>Nicho</th><th>Total</th><th>Novas</th></tr>${o.por_nicho.map((n) => `<tr><td>${esc(NICHOS[n.nicho] || n.nicho)}</td><td>${n.total}</td><td>${n.novas}</td></tr>`).join('') || '<tr><td colspan=3 class="muted">Banco vazio. Use "Alimentar ideias".</td></tr>'}</table></div></div>
        <div class="card sec"><h3>Alerta de estoque</h3><p>Avisar quando restarem menos de <input id="lim" style="width:90px;min-height:38px;padding:6px 10px;border-radius:10px;border:1px solid var(--line);background:var(--card)" value="${o.limite}"> ideias novas. <button class="btn ghost" id="slim">Salvar</button></p></div>`);
      bindTabs();
      document.getElementById('slim').onclick = async () => { await api('/api/admin/settings', { method: 'POST', body: { alerta_estoque: document.getElementById('lim').value } }); adminPage('geral'); };
    } else if (tab === 'importar') {
      shell(`<div class="card"><h3>Alimentar o banco de ideias</h3><p>Cole aqui o lote em JSON (uma lista de ideias). Cada item precisa de: titulo, nicho, publico, por_que, anuncios_ativos, data_pesquisa (AAAA-MM-DD), formato, o_que_incluir (lista), preco_sugerido, canais (lista), criativo (video ou imagem), dica_criativo e pelo menos um roteiro (roteiro_com_rosto e/ou roteiro_sem_rosto). Nichos aceitos: ${Object.keys(NICHOS).join(', ')}.</p>
        <div id="m" style="margin-top:12px"></div><textarea id="j" placeholder='[ { "titulo": "...", ... } ]'></textarea>
        <div class="chips" style="margin-top:12px"><button class="btn" id="imp">Importar</button><button class="btn ghost" id="ex">Ver exemplo</button></div></div>`);
      bindTabs();
      document.getElementById('ex').onclick = () => { document.getElementById('j').value = JSON.stringify(EXEMPLO, null, 2); };
      document.getElementById('imp').onclick = async (e) => {
        e.currentTarget.disabled = true;
        try {
          const r = await api('/api/admin/import', { method: 'POST', body: document.getElementById('j').value });
          document.getElementById('m').innerHTML = msg(`${r.importadas} ideias importadas.${r.recusadas.length ? ` ${r.recusadas.length} recusadas: ` + r.recusadas.map((x) => `#${x.item} (${x.titulo || 'sem título'}): falta ${x.falta.join(', ')}`).join(' · ') : ''}`, r.recusadas.length ? 'err' : 'ok');
          if (r.importadas) document.getElementById('j').value = '';
        } catch (x) { document.getElementById('m').innerHTML = msg(x.message); }
        e.currentTarget.disabled = false;
      };
    } else if (tab === 'ideias') {
      const r = await api('/api/admin/ideas');
      shell(`<div class="card"><div class="tw"><table><tr><th>#</th><th>Ideia</th><th>Nicho</th><th>Anúncios</th><th>Entregas</th><th></th></tr>${r.ideas.map((i) => `<tr><td>${i.id}</td><td>${esc(i.titulo)}${i.locked ? ' <span class="pill">fora de circulação</span>' : ''}</td><td>${esc(NICHOS[i.nicho] || i.nicho)}</td><td>${esc(i.anuncios)}</td><td>${i.deliveries}</td><td><button class="btn ghost" data-del="${i.id}" style="min-height:34px">Remover</button></td></tr>`).join('') || '<tr><td colspan=6 class="muted">Nenhuma ideia.</td></tr>'}</table></div></div>`);
      bindTabs();
      document.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (confirm('Remover esta ideia? Se já foi entregue, ela só sai de circulação.')) { await api(`/api/admin/ideas/${b.dataset.del}`, { method: 'DELETE' }); adminPage('ideias'); } });
    } else if (tab === 'clientes') {
      const r = await api('/api/admin/users');
      shell(`<div class="card"><h3>Dar créditos / plano</h3><div id="m" style="margin-top:10px"></div><div class="calc">
        <div class="field"><label>E-mail</label><input id="ce"></div><div class="field"><label>Plano</label><select id="cp"><option value="">— créditos avulsos —</option><option value="inicial">Inicial (4)</option><option value="pro">Pro (12)</option><option value="elite">Elite (25 + 3 exclusivas)</option></select></div>
        <div class="field"><label>Créditos avulsos</label><input id="cn" inputmode="numeric" placeholder="ex.: 2"></div></div>
        <div class="chips"><button class="btn" id="give">Liberar</button><button class="btn ghost" id="rl">Gerar link de nova senha</button></div></div>
        <div class="card sec"><div class="tw"><table><tr><th>E-mail</th><th>Plano</th><th>Saldo</th><th>Ideias geradas</th><th>Desde</th></tr>${r.users.map((u) => `<tr><td>${esc(u.email)}</td><td>${esc(u.tier)}</td><td>${u.credits}${u.exclusive_left ? ` (+${u.exclusive_left} excl.)` : ''}</td><td>${u.ideias}</td><td>${date(u.created_at)}</td></tr>`).join('') || '<tr><td colspan=5 class="muted">Nenhuma conta.</td></tr>'}</table></div></div>`);
      bindTabs();
      const m = document.getElementById('m');
      document.getElementById('give').onclick = async () => { try { await api('/api/admin/credits', { method: 'POST', body: { email: document.getElementById('ce').value, plan: document.getElementById('cp').value, credits: document.getElementById('cn').value } }); adminPage('clientes'); } catch (x) { m.innerHTML = msg(x.message); } };
      document.getElementById('rl').onclick = async () => { try { const r2 = await api('/api/admin/reset-link', { method: 'POST', body: { email: document.getElementById('ce').value } }); const link = location.origin + r2.path; try { await navigator.clipboard.writeText(link); } catch { /* sem clipboard */ } m.innerHTML = msg(`Link (vale 24 h, já copiado): ${link}`, 'ok'); } catch (x) { m.innerHTML = msg(x.message); } };
    }
  } catch (x) { render(`<main class="page"><div class="w narrow">${msg(x.message)}</div></main>`); }
}

// ---------------- roteador
async function route() {
  const p = location.pathname;
  if (ME === null && !route.loaded) { route.loaded = true; await loadMe(); }
  if (p === '/' || p === '') { await loadConfig(); return landing(); }
  if (p === '/entrar') return ME ? go('/app') : authPage('login');
  if (p === '/criar-conta') return ME ? go('/app') : authPage('new');
  if (p === '/redefinir') return resetPage();
  if (!ME) return go('/entrar');
  if (p === '/app') { await loadMe(); return home(); }
  if (p === '/app/gerar') return wizard();
  if (p === '/app/planos') return plansPage();
  const m = p.match(/^\/app\/ideia\/(\d+)$/); if (m) return ideaPage(m[1]);
  if (p === '/admin') return ME.admin ? adminPage() : go('/app');
  go('/');
}
route();
