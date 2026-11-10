// Brecha · servidor (Cloudflare Pages, modo avancado). Banco D1 no binding DB.
// Variaveis: CAKTO_SECRET, ADMIN_EMAIL, CHECKOUT_INICIAL, CHECKOUT_PRO, CHECKOUT_ELITE, SUPPORT_EMAIL (opcional)

const DAY = 86400, SESSION_DAYS = 30, MAX_FAILS = 8, PBKDF2_ITER = 100000;
const enc = new TextEncoder();
const now = () => Math.floor(Date.now() / 1000);
const norm = (e) => String(e || '').trim().toLowerCase();
const okEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(e);

// planos vendidos na Cakto
const PLANS = {
  inicial: { credits: 4, exclusives: 0, rank: 1 },
  pro: { credits: 12, exclusives: 0, rank: 2 },
  elite: { credits: 25, exclusives: 3, rank: 3 },
};
const NICHOS = ['culinaria', 'saude', 'beleza', 'estudos', 'financas', 'maternidade', 'pets', 'casa', 'fitness', 'religiao', 'artesanato', 'tecnologia', 'relacionamentos', 'moda', 'outros'];
const FORMATOS = ['ebook', 'planilha', 'kit', 'curso', 'desafio', 'template', 'servico', 'outro'];

function hex(buf) { return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
function randHex(n = 32) { return hex(crypto.getRandomValues(new Uint8Array(n))); }
async function sha256(s) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
async function hashPass(pass, saltHex) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256));
}
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEC_HEADERS, ...extra } });
}
const err = (msg, status = 400, code) => json({ error: msg, code }, status);
const cookie = (token, maxAge) => `br_s=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
function readCookie(req) { const m = (req.headers.get('Cookie') || '').match(/(?:^|;\s*)br_s=([a-f0-9]{64})/); return m ? m[1] : null; }
async function body(req) { try { return await req.json(); } catch { return {}; } }
const isAdmin = (env, email) => !!env.ADMIN_EMAIL && norm(env.ADMIN_EMAIL) === email;

async function setting(env, key, def) {
  const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return r ? r.value : def;
}

// ---------------------------------------------------------------- sessao
async function newSession(env, userId) {
  const token = randHex(32);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND created_at < ?').bind(userId, now() - SESSION_DAYS * DAY),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at) VALUES (?, ?, ?)').bind(await sha256(token), userId, now()),
  ]);
  return cookie(token, SESSION_DAYS * DAY);
}
async function currentUser(env, req) {
  const token = readCookie(req);
  if (!token) return null;
  const row = await env.DB.prepare('SELECT u.*, s.created_at AS s_at, s.token_hash FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?').bind(await sha256(token)).first();
  if (!row) return null;
  if (row.s_at < now() - SESSION_DAYS * DAY) { await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(row.token_hash).run(); return null; }
  row.admin = isAdmin(env, row.email);
  return row;
}

// ---------------------------------------------------------------- compras (Cakto)
function planFor(data) {
  const name = [data?.product?.name, data?.offer?.name, data?.product_name, data?.offer_name].filter(Boolean).join(' ').toLowerCase();
  if (/elite/.test(name)) return 'elite';
  if (/\bpro\b/.test(name)) return 'pro';
  if (/inicial|b[aá]sico|starter/.test(name)) return 'inicial';
  return null;
}
// aplica as compras aprovadas ainda nao creditadas desse e-mail (chamado na compra e no cadastro)
async function applyOrders(env, email) {
  const u = await env.DB.prepare('SELECT id, tier FROM users WHERE email = ?').bind(email).first();
  if (!u) return;
  const pend = await env.DB.prepare("SELECT * FROM orders WHERE email = ? AND status = 'approved' AND applied = 0").bind(email).all();
  for (const o of pend.results) {
    const tier = (PLANS[u.tier]?.rank || 0) >= PLANS[o.plan].rank ? u.tier : o.plan;
    u.tier = tier;
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET credits = credits + ?, exclusive_left = exclusive_left + ?, tier = ? WHERE id = ?').bind(o.credits, o.exclusives, tier, u.id),
      env.DB.prepare('UPDATE orders SET applied = 1 WHERE order_id = ?').bind(o.order_id),
    ]);
  }
}
async function cakto(env, req) {
  const raw = await req.text();
  let p = {}; try { p = JSON.parse(raw); } catch { /* corpo invalido */ }
  const secret = p.secret || req.headers.get('X-Cakto-Secret') || '';
  const event = String(p.event || p.type || '');
  const data = p.data || p;
  const email = norm(data?.customer?.email || data?.email || data?.buyer?.email);
  const log = (ok, note) => env.DB.prepare('INSERT INTO webhook_log (event, email, ok, note, body, at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(event, email, ok ? 1 : 0, note, raw.slice(0, 8000).replace(/"secret"\s*:\s*"[^"]*"/, '"secret":"***"'), now()).run();
  if (!env.CAKTO_SECRET || !same(String(secret), env.CAKTO_SECRET)) { await log(false, 'chave secreta invalida'); return err('unauthorized', 401); }
  if (!okEmail(email)) { await log(false, 'sem e-mail do cliente'); return json({ ok: true, ignored: true }); }
  const orderId = String(data?.id || data?.refId || data?.order_id || `${email}-${now()}`);
  if (event === 'purchase_approved') {
    const plan = planFor(data);
    if (!plan) { await log(false, 'produto nao reconhecido (o nome precisa ter Inicial, Pro ou Elite)'); return json({ ok: true, ignored: true }); }
    const exists = await env.DB.prepare('SELECT 1 FROM orders WHERE order_id = ?').bind(orderId).first();
    if (exists) { await log(true, 'pedido repetido, ignorado'); return json({ ok: true }); }
    await env.DB.prepare("INSERT INTO orders (order_id, email, plan, credits, exclusives, status, created_at) VALUES (?, ?, ?, ?, ?, 'approved', ?)")
      .bind(orderId, email, plan, PLANS[plan].credits, PLANS[plan].exclusives, now()).run();
    await applyOrders(env, email);
    await log(true, `liberado: ${plan} (+${PLANS[plan].credits} ideias)`);
  } else if (['refund', 'chargeback', 'purchase_refunded', 'purchase_chargeback'].includes(event)) {
    const o = await env.DB.prepare("SELECT * FROM orders WHERE order_id = ? OR (email = ? AND status = 'approved') ORDER BY (order_id = ?) DESC, created_at DESC").bind(orderId, email, orderId).first();
    if (o && o.status === 'approved') {
      const st = [env.DB.prepare("UPDATE orders SET status = 'refunded' WHERE order_id = ?").bind(o.order_id)];
      if (o.applied) st.push(env.DB.prepare('UPDATE users SET credits = MAX(0, credits - ?), exclusive_left = MAX(0, exclusive_left - ?) WHERE email = ?').bind(o.credits, o.exclusives, email));
      await env.DB.batch(st);
      await log(true, `creditos removidos (${event})`);
    } else await log(true, 'reembolso sem pedido correspondente');
  } else await log(true, 'evento ignorado');
  return json({ ok: true });
}

// ---------------------------------------------------------------- conta
async function register(env, req) {
  const b = await body(req), email = norm(b.email), pass = String(b.password || '');
  if (!okEmail(email)) return err('Digite um e-mail válido.');
  if (pass.length < 8) return err('A senha precisa ter pelo menos 8 caracteres.');
  if (await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) return err('Já existe uma conta com esse e-mail. Entre com a sua senha.', 409);
  const salt = randHex(16);
  const r = await env.DB.prepare('INSERT INTO users (email, pass_hash, pass_salt, created_at) VALUES (?, ?, ?, ?)').bind(email, await hashPass(pass, salt), salt, now()).run();
  await applyOrders(env, email);
  return json({ ok: true }, 200, { 'Set-Cookie': await newSession(env, r.meta.last_row_id) });
}
async function login(env, req) {
  const b = await body(req), email = norm(b.email), pass = String(b.password || ''), t = now();
  const fails = await env.DB.prepare('SELECT COUNT(*) n FROM login_events WHERE email = ? AND ok = 0 AND at > ?').bind(email, t - 900).first();
  if (fails.n >= MAX_FAILS) return err('Muitas tentativas. Espere 15 minutos e tente de novo.', 429);
  const u = await env.DB.prepare('SELECT id, pass_hash, pass_salt FROM users WHERE email = ?').bind(email).first();
  const good = !!u && same(await hashPass(pass, u.pass_salt), u.pass_hash);
  await env.DB.prepare('INSERT INTO login_events (email, ok, at) VALUES (?, ?, ?)').bind(email, good ? 1 : 0, t).run();
  if (!good) return err('E-mail ou senha incorretos.', 401);
  await applyOrders(env, email);
  return json({ ok: true }, 200, { 'Set-Cookie': await newSession(env, u.id) });
}
async function resetPassword(env, req) {
  const b = await body(req), token = String(b.token || ''), pass = String(b.password || '');
  if (pass.length < 8) return err('A senha precisa ter pelo menos 8 caracteres.');
  const row = await env.DB.prepare('SELECT user_id, expires_at, used FROM reset_tokens WHERE token_hash = ?').bind(await sha256(token)).first();
  if (!row || row.used || row.expires_at < now()) return err('Esse link é inválido ou expirou. Peça um novo ao suporte.');
  const salt = randHex(16);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?').bind(await hashPass(pass, salt), salt, row.user_id),
    env.DB.prepare('UPDATE reset_tokens SET used = 1 WHERE token_hash = ?').bind(await sha256(token)),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(row.user_id),
  ]);
  return json({ ok: true });
}

// ---------------------------------------------------------------- ideias
function cleanIdea(x) {
  const s = (v, n = 600) => String(v ?? '').trim().slice(0, n);
  const list = (v, n = 12) => (Array.isArray(v) ? v : String(v || '').split(/\n|;/)).map((i) => s(i, 200)).filter(Boolean).slice(0, n);
  const d = {
    titulo: s(x.titulo, 140), nicho: norm(x.nicho), publico: s(x.publico, 300), por_que: s(x.por_que, 900),
    anuncios_ativos: Math.max(0, Math.round(Number(x.anuncios_ativos) || 0)), data_pesquisa: s(x.data_pesquisa, 10),
    formato: norm(x.formato), o_que_incluir: list(x.o_que_incluir), preco_sugerido: Math.round((Number(String(x.preco_sugerido).replace(',', '.')) || 0) * 100) / 100,
    canais: list(x.canais, 6), criativo: norm(x.criativo) === 'video' ? 'video' : 'imagem', dica_criativo: s(x.dica_criativo, 700),
    roteiro_com_rosto: s(x.roteiro_com_rosto, 1500), roteiro_sem_rosto: s(x.roteiro_sem_rosto, 1500), base: s(x.base, 120),
  };
  const miss = [];
  if (!d.titulo) miss.push('titulo');
  if (!NICHOS.includes(d.nicho)) miss.push('nicho (use: ' + NICHOS.join(', ') + ')');
  if (!d.por_que) miss.push('por_que');
  if (!FORMATOS.includes(d.formato)) d.formato = 'outro';
  if (!d.o_que_incluir.length) miss.push('o_que_incluir');
  if (!(d.preco_sugerido > 0)) miss.push('preco_sugerido');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data_pesquisa)) miss.push('data_pesquisa (AAAA-MM-DD)');
  if (!d.roteiro_com_rosto && !d.roteiro_sem_rosto) miss.push('roteiro_com_rosto ou roteiro_sem_rosto');
  return { d, miss };
}
const money = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',');

// o que o app monta sozinho, por regra (sem IA)
function extras(d, answers, tier) {
  const preco = d.preco_sugerido || 19.9;
  const budget = String(answers.budget || '0');
  const max = { '0': 0, '20': 20, '50': 50, '50+': 80 }[budget] ?? 0;
  let orcamento;
  if (!max) {
    orcamento = { diario: 0, texto: `Comece 100% no orgânico, sem gastar com anúncio: poste todos os dias nos canais indicados. Quando fizer as primeiras vendas, separe parte do lucro para testar anúncio com uns R$ 10 por dia.` };
  } else {
    const diario = Math.max(10, Math.min(max, Math.round(preco)));
    orcamento = { diario, texto: `Teste por 5 dias com ${money(diario)} por dia (${money(diario * 5)} no total). Se o custo por venda ficar abaixo de ${money(preco * 0.6)}, aumente o orçamento em 20% a cada 3 dias. Se gastar ${money(preco)} sem nenhuma venda, troque o criativo antes de colocar mais dinheiro.` };
  }
  const face = answers.face === 'sim' ? 'com' : answers.face === 'nao' ? 'sem' : (d.roteiro_com_rosto ? 'com' : 'sem');
  const roteiro = face === 'com' ? (d.roteiro_com_rosto || d.roteiro_sem_rosto) : (d.roteiro_sem_rosto || d.roteiro_com_rosto);
  const out = { orcamento, roteiro, roteiro_tipo: face === 'com' && d.roteiro_com_rosto ? 'Aparecendo no vídeo' : 'Sem mostrar o rosto' };
  if ((PLANS[tier]?.rank || 0) >= 2) {
    const c1 = d.canais[0] || 'Grupos do Facebook', c2 = d.canais[1] || 'TikTok';
    out.plano7 = [
      `Monte o produto (${d.formato}) com os itens da lista "O que incluir".`,
      `Cadastre o produto numa plataforma de pagamento a ${money(preco)} e prepare o ${d.criativo === 'video' ? 'vídeo' : 'criativo em imagem'}.`,
      `Publique em ${c1}. Responda todo mundo que comentar.`,
      `Grave o vídeo do roteiro e publique em ${c2}.`,
      `Volte nos posts, responda dúvidas e mande o link para quem pediu.`,
      max ? `Suba um anúncio de teste com ${money(orcamento.diario)} por dia usando o criativo que mais teve resposta.` : `Publique de novo, com um título diferente, onde teve mais resposta.`,
      `Revise: qual canal trouxe mais conversa e venda? Repita o que funcionou e corte o resto.`,
    ];
    out.calculadora = true;
  }
  return out;
}

async function generate(env, user, b) {
  const cats = (Array.isArray(b.cats) ? b.cats : []).map(norm).filter((c) => NICHOS.includes(c)).slice(0, 8);
  const answers = { cats, budget: ['0', '20', '50', '50+'].includes(String(b.budget)) ? String(b.budget) : '0', face: ['sim', 'nao', 'tanto'].includes(b.face) ? b.face : 'tanto' };
  if (!user.admin && user.credits < 1) return err('Você não tem ideias disponíveis. Escolha um plano para continuar.', 402, 'no_credits');
  const exclusive = !user.admin && user.exclusive_left > 0;
  const fresh = now() - 2 * DAY;
  const elite = user.tier === 'elite' || user.admin;
  const pick = async (useCats, onlyNew) => {
    const where = ['locked = 0', 'id NOT IN (SELECT idea_id FROM deliveries WHERE user_id = ?)'];
    const args = [user.id];
    if (useCats && cats.length) { where.push(`nicho IN (${cats.map(() => '?').join(',')})`); args.push(...cats); }
    if (exclusive || onlyNew) where.push('deliveries = 0');
    if (!elite) { where.push('created_at < ?'); args.push(fresh); }
    return env.DB.prepare(`SELECT id, nicho, data FROM ideas WHERE ${where.join(' AND ')} ORDER BY deliveries ASC, RANDOM() LIMIT 1`).bind(...args).first();
  };
  // prioridade: ideia nunca entregue no nicho escolhido > nicho escolhido > qualquer nicho
  let idea = await pick(true, true) || await pick(true, false), outro = false;
  if (!idea) { idea = await pick(false, true) || await pick(false, false); outro = !!idea && cats.length > 0; }
  if (!idea && !elite) { // sem ideias antigas: libera as recem-chegadas
    const r = await env.DB.prepare('SELECT id, nicho, data FROM ideas WHERE locked = 0 AND id NOT IN (SELECT idea_id FROM deliveries WHERE user_id = ?) ORDER BY deliveries ASC, RANDOM() LIMIT 1').bind(user.id).first();
    idea = r; outro = !!r && cats.length > 0 && !cats.includes(r.nicho);
  }
  if (!idea) return err('Estamos atualizando o banco de ideias agora. Tente de novo em algumas horas, seu crédito não foi usado.', 503, 'no_ideas');
  const t = now();
  const st = [
    env.DB.prepare('INSERT INTO deliveries (user_id, idea_id, answers, exclusive, created_at) VALUES (?, ?, ?, ?, ?)').bind(user.id, idea.id, JSON.stringify(answers), exclusive ? 1 : 0, t),
    env.DB.prepare('UPDATE ideas SET deliveries = deliveries + 1, locked = CASE WHEN ? = 1 THEN 1 ELSE locked END WHERE id = ?').bind(exclusive ? 1 : 0, idea.id),
  ];
  if (!user.admin) st.push(env.DB.prepare('UPDATE users SET credits = credits - 1, exclusive_left = exclusive_left - ? WHERE id = ? AND credits >= 1').bind(exclusive ? 1 : 0, user.id));
  const res = await env.DB.batch(st);
  return json({ id: res[0].meta.last_row_id, outro_nicho: outro });
}

async function deliveryView(env, user, id) {
  const r = await env.DB.prepare('SELECT d.id, d.answers, d.exclusive, d.created_at, i.data FROM deliveries d JOIN ideas i ON i.id = d.idea_id WHERE d.id = ? AND d.user_id = ?').bind(id, user.id).first();
  if (!r) return err('Ideia não encontrada.', 404);
  const d = JSON.parse(r.data), answers = JSON.parse(r.answers);
  delete d.base;
  return json({ id: r.id, created_at: r.created_at, exclusiva: !!r.exclusive, idea: d, answers, ...extras(d, answers, user.admin ? 'elite' : user.tier) });
}

// ---------------------------------------------------------------- admin
async function admin(env, req, path, user) {
  if (!user || !user.admin) return err('Acesso restrito.', 403);
  const t = now();
  if (path === '/api/admin/overview' && req.method === 'GET') {
    const q = (s, ...a) => env.DB.prepare(s).bind(...a).first();
    const total = await q('SELECT COUNT(*) n FROM ideas');
    const novas = await q('SELECT COUNT(*) n FROM ideas WHERE deliveries = 0 AND locked = 0');
    const usadas = await q('SELECT COUNT(*) n FROM ideas WHERE deliveries > 0');
    const ent7 = await q('SELECT COUNT(*) n FROM deliveries WHERE created_at > ?', t - 7 * DAY);
    const entTot = await q('SELECT COUNT(*) n FROM deliveries');
    const users = await q('SELECT COUNT(*) n FROM users');
    const vendas = await q("SELECT COUNT(*) n FROM orders WHERE status = 'approved'");
    const porNicho = await env.DB.prepare('SELECT nicho, COUNT(*) total, SUM(CASE WHEN deliveries = 0 AND locked = 0 THEN 1 ELSE 0 END) novas FROM ideas GROUP BY nicho ORDER BY total DESC').all();
    const limite = Number(await setting(env, 'alerta_estoque', '50'));
    const porDia = ent7.n / 7;
    const dias = porDia > 0 ? Math.floor(novas.n / porDia) : null;
    const alerta = novas.n < limite || (dias !== null && dias < 3);
    const log = await env.DB.prepare('SELECT event, email, ok, note, at FROM webhook_log ORDER BY id DESC LIMIT 15').all();
    return json({ total: total.n, novas: novas.n, usadas: usadas.n, entregas_7d: ent7.n, entregas_total: entTot.n, usuarios: users.n, vendas: vendas.n,
      por_dia: Math.round(porDia * 10) / 10, dias_restantes: dias, alerta, limite, por_nicho: porNicho.results, webhook: log.results });
  }
  if (path === '/api/admin/import' && req.method === 'POST') {
    const raw = await req.text();
    if (raw.length > 3_000_000) return err('Lote grande demais. Envie no máximo uns 500 itens por vez.');
    let arr; try { arr = JSON.parse(raw); } catch { return err('O texto não é um JSON válido. Ele precisa começar com [ e terminar com ].'); }
    if (arr && Array.isArray(arr.ideias)) arr = arr.ideias;
    if (!Array.isArray(arr)) return err('Envie uma lista de ideias: [ {...}, {...} ]');
    const ok = [], bad = [];
    arr.forEach((x, i) => { const { d, miss } = cleanIdea(x || {}); if (miss.length) bad.push({ item: i + 1, titulo: d.titulo, falta: miss }); else ok.push(d); });
    for (let i = 0; i < ok.length; i += 50) {
      await env.DB.batch(ok.slice(i, i + 50).map((d) => env.DB.prepare('INSERT INTO ideas (base, nicho, data, created_at) VALUES (?, ?, ?, ?)').bind(d.base, d.nicho, JSON.stringify(d), t)));
    }
    return json({ importadas: ok.length, recusadas: bad });
  }
  if (path === '/api/admin/ideas' && req.method === 'GET') {
    const url = new URL(req.url), qs = `%${(url.searchParams.get('q') || '').slice(0, 60)}%`;
    const r = await env.DB.prepare(`SELECT id, nicho, deliveries, locked, created_at, json_extract(data, '$.titulo') titulo, json_extract(data, '$.anuncios_ativos') anuncios FROM ideas WHERE data LIKE ? ORDER BY id DESC LIMIT 200`).bind(qs).all();
    return json({ ideas: r.results });
  }
  const del = path.match(/^\/api\/admin\/ideas\/(\d+)$/);
  if (del && req.method === 'DELETE') {
    const used = await env.DB.prepare('SELECT deliveries FROM ideas WHERE id = ?').bind(del[1]).first();
    if (used && used.deliveries > 0) await env.DB.prepare('UPDATE ideas SET locked = 1 WHERE id = ?').bind(del[1]).run(); // ja entregue: so tira de circulacao
    else await env.DB.prepare('DELETE FROM ideas WHERE id = ?').bind(del[1]).run();
    return json({ ok: true });
  }
  if (path === '/api/admin/users' && req.method === 'GET') {
    const url = new URL(req.url), qs = `%${norm(url.searchParams.get('q') || '').slice(0, 80)}%`;
    const r = await env.DB.prepare('SELECT u.id, u.email, u.credits, u.exclusive_left, u.tier, u.created_at, (SELECT COUNT(*) FROM deliveries d WHERE d.user_id = u.id) ideias FROM users u WHERE u.email LIKE ? ORDER BY u.id DESC LIMIT 100').bind(qs).all();
    return json({ users: r.results });
  }
  if (path === '/api/admin/credits' && req.method === 'POST') {
    const b = await body(req), email = norm(b.email), n = Math.round(Number(b.credits) || 0), plan = PLANS[b.plan] ? b.plan : null;
    if (!okEmail(email) || (!n && !plan)) return err('Informe o e-mail e a quantidade (ou o plano).');
    if (plan) {
      await env.DB.prepare("INSERT INTO orders (order_id, email, plan, credits, exclusives, status, created_at) VALUES (?, ?, ?, ?, ?, 'approved', ?)")
        .bind(`manual-${randHex(6)}`, email, plan, PLANS[plan].credits, PLANS[plan].exclusives, t).run();
      await applyOrders(env, email);
    } else {
      const u = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
      if (!u) return err('Esse e-mail ainda não tem conta. Use a opção de plano (fica guardado até a pessoa criar a conta).');
      await env.DB.prepare('UPDATE users SET credits = MAX(0, credits + ?) WHERE id = ?').bind(n, u.id).run();
    }
    return json({ ok: true });
  }
  if (path === '/api/admin/reset-link' && req.method === 'POST') {
    const b = await body(req), u = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(norm(b.email)).first();
    if (!u) return err('Não existe conta com esse e-mail.');
    const token = randHex(24);
    await env.DB.prepare('INSERT INTO reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(await sha256(token), u.id, t + DAY).run();
    return json({ path: `/redefinir?t=${token}` });
  }
  if (path === '/api/admin/settings' && req.method === 'POST') {
    const b = await body(req), v = Math.max(0, Math.round(Number(b.alerta_estoque) || 0));
    await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('alerta_estoque', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(String(v)).run();
    return json({ ok: true });
  }
  return err('not found', 404);
}

// ---------------------------------------------------------------- rotas
async function api(env, req, url) {
  const path = url.pathname;
  if (path === '/api/webhook/cakto' && req.method === 'POST') return cakto(env, req);
  if (req.method !== 'GET') {
    const origin = req.headers.get('Origin');
    if (!origin || new URL(origin).host !== url.host) return err('forbidden', 403);
  }
  if (path === '/api/config') return json({ support: env.SUPPORT_EMAIL || '', checkout: { inicial: env.CHECKOUT_INICIAL || '', pro: env.CHECKOUT_PRO || '', elite: env.CHECKOUT_ELITE || '' } });
  if (path === '/api/register' && req.method === 'POST') return register(env, req);
  if (path === '/api/login' && req.method === 'POST') return login(env, req);
  if (path === '/api/reset' && req.method === 'POST') return resetPassword(env, req);
  if (path === '/api/logout' && req.method === 'POST') {
    const token = readCookie(req);
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
    return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
  }
  const user = await currentUser(env, req);
  if (path.startsWith('/api/admin/')) return admin(env, req, path, user);
  if (!user) return err('Entre na sua conta.', 401, 'signed_out');
  if (path === '/api/me' && req.method === 'GET') {
    const list = await env.DB.prepare("SELECT d.id, d.created_at, d.exclusive, json_extract(i.data, '$.titulo') titulo, i.nicho FROM deliveries d JOIN ideas i ON i.id = d.idea_id WHERE d.user_id = ? ORDER BY d.id DESC LIMIT 100").bind(user.id).all();
    return json({ email: user.email, credits: user.admin ? null : user.credits, exclusivas: user.exclusive_left, tier: user.admin ? 'elite' : user.tier, admin: user.admin, ideias: list.results });
  }
  if (path === '/api/generate' && req.method === 'POST') return generate(env, user, await body(req));
  const dm = path.match(/^\/api\/ideia\/(\d+)$/);
  if (dm && req.method === 'GET') return deliveryView(env, user, Number(dm[1]));
  return err('not found', 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/_worker.js') return new Response('Not found', { status: 404 });
    try {
      if (url.pathname.startsWith('/api/')) {
        if (!env.DB) return err('Banco D1 não conectado (binding DB).', 500);
        return await api(env, req, url);
      }
      let res = await env.ASSETS.fetch(/\.[a-z0-9]+$/i.test(url.pathname) ? req : new Request(new URL('/', url), req));
      res = new Response(res.body, res);
      for (const [k, v] of Object.entries(SEC_HEADERS)) res.headers.set(k, v);
      if (!/\.(woff2|png|jpg|svg|ico)$/.test(url.pathname)) res.headers.set('Cache-Control', 'no-cache');
      return res;
    } catch (e) {
      return err('Algo deu errado. Tente de novo.', 500);
    }
  },
};
