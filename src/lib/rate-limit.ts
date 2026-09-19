import 'server-only';
import { isIntegrationConfigured, requireIntegration } from '@/lib/env';

/**
 * Rate limiting.
 *
 * Quando `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` estao
 * configurados (ver docs/SETUP.md §6), o contador e o Redis do Upstash — o
 * mesmo limite vale entre TODAS as instancias do app. Sem isso, cai para o
 * limitador em memoria abaixo, que so funciona num servidor unico: em
 * serverless cada instancia tem o proprio mapa, e o limite real vira
 * (limite x numero de instancias). `usingSharedStore()` diz honestamente
 * qual dos dois esta valendo, para a checagem de prontidao para producao.
 *
 * Observacao: o Supabase Auth ja aplica limites proprios nos endpoints de
 * login, cadastro e recuperacao de senha, do lado dele. O limitador daqui e
 * uma camada a mais para as nossas proprias acoes.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** Segundos ate a janela reabrir. */
  retryAfterSeconds: number;
};

// ---------------------------------------------------------------------------
// Limitador em memoria — fallback, e o unico usado sem Upstash configurado.
// ---------------------------------------------------------------------------

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Limpeza preguicosa: remove janelas vencidas quando o mapa cresce demais. */
function sweep(now: number) {
  if (buckets.size < 5_000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function rateLimitLocal(key: string, { limit, windowSeconds }: { limit: number; windowSeconds: number }): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  const retryAfterSeconds = Math.ceil((existing.resetAt - now) / 1000);

  if (existing.count > limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds };
}

// ---------------------------------------------------------------------------
// Limitador compartilhado (Upstash Redis REST)
// ---------------------------------------------------------------------------

/**
 * Contrato REST do Upstash confirmado por busca em 19/09/2026
 * (docs.upstash.com bloqueado pela politica de rede deste ambiente, mesmo
 * bloqueio ja registrado para Resend/Asaas): `POST {base}/pipeline`,
 * `Authorization: Bearer <token>`, corpo = array de comandos
 * `[["INCR", chave], ...]`, resposta = array de `{result}` ou `{error}` na
 * mesma ordem. Pipeline nao e atomico (so agrupa o round-trip), mas
 * `EXPIRE ... NX` so define o TTL na primeira chamada da janela — chamadas
 * concorrentes que cheguem entre o INCR e o EXPIRE ainda contam certo, so a
 * definicao do TTL que poderia, em tese, perder uma corrida rarissima sem
 * afetar a contagem em si.
 */
type UpstashPipelineItem = { result: unknown } | { error: string };

async function rateLimitUpstash(
  key: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number },
): Promise<RateLimitResult> {
  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = requireIntegration('rateLimit');

  const res = await fetch(`${UPSTASH_REDIS_REST_URL.replace(/\/+$/, '')}/pipeline`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify([
      ['INCR', key],
      ['EXPIRE', key, windowSeconds, 'NX'],
      ['TTL', key],
    ]),
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`Upstash devolveu HTTP ${res.status}`);

  const [incr, , ttl] = (await res.json()) as UpstashPipelineItem[];
  if (!incr || 'error' in incr) throw new Error(`Upstash: ${incr && 'error' in incr ? incr.error : 'resposta vazia'}`);

  const count = Number(incr.result);
  const ttlSeconds = ttl && 'result' in ttl ? Number(ttl.result) : windowSeconds;
  const retryAfterSeconds = Math.max(0, ttlSeconds);

  if (count > limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }
  return { allowed: true, remaining: Math.max(0, limit - count), retryAfterSeconds: 0 };
}

// ---------------------------------------------------------------------------

/**
 * Verifica e conta uma tentativa contra o limite.
 *
 * Usa Upstash quando configurado. Se o Upstash falhar no meio de uma
 * requisicao (rede, erro do servico), cai para o limitador local em vez de
 * derrubar a acao inteira — a acao protegida (login, denuncia, etc.) e mais
 * importante do que a camada extra de protecao continuar de pe o tempo todo.
 */
export async function rateLimit(
  key: string,
  opts: { limit: number; windowSeconds: number },
): Promise<RateLimitResult> {
  if (isIntegrationConfigured('rateLimit')) {
    try {
      return await rateLimitUpstash(key, opts);
    } catch (err) {
      console.error('rate-limit: Upstash falhou, usando o limitador local como reserva.', err);
      return rateLimitLocal(key, opts);
    }
  }
  return rateLimitLocal(key, opts);
}

/** false = o limitador nao e confiavel em multiplas instancias. */
export function usingSharedStore(): boolean {
  return isIntegrationConfigured('rateLimit');
}

/** Limites usados nas acoes de autenticacao. */
export const AUTH_LIMITS = {
  signIn: { limit: 8, windowSeconds: 300 },
  signUp: { limit: 5, windowSeconds: 3600 },
  passwordReset: { limit: 4, windowSeconds: 3600 },
} as const;
