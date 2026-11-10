-- Brecha: banco D1 (SQLite). Rode tudo de uma vez no console do D1.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  pass_salt TEXT NOT NULL,
  credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
  exclusive_left INTEGER NOT NULL DEFAULT 0 CHECK (exclusive_left >= 0),
  tier TEXT NOT NULL DEFAULT 'nenhum',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS login_events (email TEXT, ok INTEGER, at INTEGER);
CREATE INDEX IF NOT EXISTS login_email ON login_events(email, at);
CREATE TABLE IF NOT EXISTS reset_tokens (token_hash TEXT PRIMARY KEY, user_id INTEGER, expires_at INTEGER, used INTEGER DEFAULT 0);

-- compras da Cakto (uma linha por pedido; credita a conta do e-mail, mesmo se a conta ainda nao existir)
CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  plan TEXT NOT NULL,
  credits INTEGER NOT NULL,
  exclusives INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,          -- approved | refunded
  applied INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_email ON orders(email);
CREATE TABLE IF NOT EXISTS webhook_log (id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT, email TEXT, ok INTEGER, note TEXT, body TEXT, at INTEGER);

-- banco de ideias (alimentado pelo painel admin)
CREATE TABLE IF NOT EXISTS ideas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  base TEXT NOT NULL DEFAULT '',
  nicho TEXT NOT NULL,
  data TEXT NOT NULL,            -- JSON com o conteudo da ideia
  deliveries INTEGER NOT NULL DEFAULT 0,
  locked INTEGER NOT NULL DEFAULT 0,   -- 1 = entregue como exclusiva, nao sai para mais ninguem
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ideas_pick ON ideas(nicho, locked, deliveries);
CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  idea_id INTEGER NOT NULL,
  answers TEXT NOT NULL,
  exclusive INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, idea_id)
);
CREATE INDEX IF NOT EXISTS deliveries_user ON deliveries(user_id, created_at);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
