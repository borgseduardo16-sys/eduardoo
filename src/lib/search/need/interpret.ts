import 'server-only';
import { isIntegrationConfigured, IntegrationNotConfiguredError } from '@/lib/env';
import { rateLimit } from '@/lib/rate-limit';
import { settingInt } from '@/lib/settings';
import { consumeAiQuota } from '@/lib/ai/usage';
import { interpretNeedByRules, normalizeSameLength } from './rules';
import { fromAiOutput, mergeInterpretations } from './ai-schema';
import { interpretNeedWithAi, NeedAiError } from './ai';
import { NEED_LIMITS, type NeedInterpretation } from './vocabulary';

/**
 * Busca por necessidade — orquestra regras e IA (Fase 23).
 *
 *   1. As regras SEMPRE rodam (grátis, instantâneas, previsíveis).
 *   2. Se entenderam tudo, pronto: a IA nem é chamada.
 *   3. Se sobrou texto sem entender e a IA está configurada, dentro do
 *      limite por pessoa e do teto diário do app, a IA interpreta a frase
 *      inteira e o resultado é JUNTADO às regras (nunca as substitui às
 *      cegas — ver `mergeInterpretations`).
 *   4. Se a IA falhar por qualquer motivo, a busca segue com as regras e a
 *      tela diz que a busca inteligente não pôde ser processada agora.
 */

export type NeedAiStatus =
  /** As regras entenderam tudo. */
  | 'nao_necessaria'
  | 'ok'
  | 'nao_configurada'
  /** Limite por pessoa ou teto diário do app. */
  | 'limite'
  | 'falhou';

export type NeedResult = {
  text: string;
  interpretation: NeedInterpretation;
  ai: NeedAiStatus;
  /** Palavras que nada usou — só quando a IA não resolveu a frase. */
  residual: string[];
};

/** Por pessoa (ou IP): 20 interpretações por IA a cada 10 minutos. */
const LIMITE_POR_PESSOA = { limit: 20, windowSeconds: 600 } as const;

// Cache curto, por instância: a mesma frase no mesmo dia não paga duas vezes.
// Não é garantia de nada (em serverless cada instância tem o seu) — é só
// economia; o teto diário no banco é o que protege de verdade.
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; interpretation: NeedInterpretation }>();

function lerCache(chave: string): NeedInterpretation | null {
  const item = cache.get(chave);
  if (!item) return null;
  if (Date.now() - item.at > CACHE_TTL_MS) {
    cache.delete(chave);
    return null;
  }
  return item.interpretation;
}

function gravarCache(chave: string, interpretation: NeedInterpretation) {
  if (cache.size >= CACHE_MAX) {
    const maisAntiga = cache.keys().next().value;
    if (maisAntiga !== undefined) cache.delete(maisAntiga);
  }
  cache.set(chave, { at: Date.now(), interpretation });
}

/** Só para os testes começarem do zero. */
export function clearNeedCache() {
  cache.clear();
}

/** Hoje no fuso de São Paulo, 'AAAA-MM-DD'. */
export function todayInSaoPaulo(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function cleanNeedText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, NEED_LIMITS.maxTextLength);
}

export async function interpretNeed(
  raw: string,
  opts: { clientKey: string; today?: string },
): Promise<NeedResult> {
  const text = cleanNeedText(raw);
  const today = opts.today ?? todayInSaoPaulo();
  const regras = interpretNeedByRules(text, { today });

  if (regras.residual.length === 0) {
    return { text, interpretation: regras.interpretation, ai: 'nao_necessaria', residual: [] };
  }
  const soRegras = (ai: NeedAiStatus): NeedResult => ({
    text, interpretation: regras.interpretation, ai, residual: regras.residual,
  });

  if (!isIntegrationConfigured('aiText')) return soRegras('nao_configurada');

  const chave = `${today}|${normalizeSameLength(text).replace(/\s+/g, ' ').trim()}`;
  const guardada = lerCache(chave);
  if (guardada) return { text, interpretation: guardada, ai: 'ok', residual: [] };

  const porPessoa = await rateLimit(`busca-ia:${opts.clientKey}`, LIMITE_POR_PESSOA);
  if (!porPessoa.allowed) return soRegras('limite');

  const tetoDiario = await settingInt('ai.search_daily_limit', 500);
  if (!(await consumeAiQuota('search', tetoDiario))) return soRegras('limite');

  try {
    const bruta = await interpretNeedWithAi(text, { today });
    const daIa = fromAiOutput(bruta, { today, text });
    const juntas = mergeInterpretations(regras.interpretation, daIa);
    gravarCache(chave, juntas);
    return { text, interpretation: juntas, ai: 'ok', residual: [] };
  } catch (err) {
    if (err instanceof NeedAiError || err instanceof IntegrationNotConfiguredError) {
      console.warn(`[busca-necessidade] IA indisponível (${err instanceof NeedAiError ? err.reason : 'config'}): ${err.message}`);
      return soRegras('falhou');
    }
    console.error('[busca-necessidade] erro inesperado na IA; seguindo só com as regras.', err);
    return soRegras('falhou');
  }
}
