import 'server-only';
import { isIntegrationConfigured } from '@/lib/env';

/**
 * Rate limiting.
 *
 * ESTADO HONESTO: hoje existe apenas o limitador EM MEMORIA.
 *
 * Ele funciona em desenvolvimento e em um servidor unico, mas NAO funciona em
 * serverless: cada instancia tem o proprio mapa, entao o limite real vira
 * (limite x numero de instancias). Para producao e preciso um contador
 * compartilhado — Upstash Redis, ja previsto em `isIntegrationConfigured`.
 *
 * Enquanto `UPSTASH_REDIS_REST_URL` nao estiver configurado, `usingSharedStore`
 * devolve false e a checagem de prontidao para producao acusa isso.
 * Nao trocamos essa limitacao por uma falsa sensacao de protecao.
 *
 * Observacao: o Supabase Auth ja aplica limites proprios nos endpoints de
 * login, cadastro e recuperacao de senha, do lado dele. O limitador daqui e
 * uma camada a mais para as nossas proprias acoes.
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Limpeza preguicosa: remove janelas vencidas quando o mapa cresce demais. */
function sweep(now: number) {
  if (buckets.size < 5_000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** Segundos ate a janela reabrir. */
  retryAfterSeconds: number;
};

export function rateLimit(
  key: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number },
): RateLimitResult {
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
