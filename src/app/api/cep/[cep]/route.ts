import { NextResponse, type NextRequest } from 'next/server';
import { lookupCep } from '@/lib/maps/cep-lookup';
import { CepError, CEP_MESSAGES, onlyDigits } from '@/lib/maps/cep';
import { rateLimit } from '@/lib/rate-limit';

/**
 * GET /api/cep/29700000  →  endereco do CEP.
 *
 * Existe para que a consulta saia do navegador. Duas razoes:
 *
 *  - O servidor precisa poder confirmar o CEP na hora de salvar o anuncio. Se
 *    a consulta acontecesse so no cliente, o endereco gravado seria o que o
 *    navegador mandou — e navegador se forja.
 *  - O cache do servidor (ver `cep-lookup.ts`) atende varias pessoas com uma
 *    unica ida ao servico gratuito.
 *
 * A rota e publica: CEP e dado publico dos Correios e nao revela nada sobre
 * nenhum usuario. O que ela protege e a cota dos servicos de origem, com
 * cache e com o limite por IP abaixo.
 */

/*
 * A rota le cabecalho (para o limite por IP), entao roda por requisicao. O que
 * evita ida ao servico externo e o cache em memoria do `cep-lookup.ts` mais o
 * `cache-control` que mandamos na resposta.
 */
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Limite por IP
// ---------------------------------------------------------------------------

/*
 * Freio simples para ninguem transformar esta rota em proxy de raspagem do
 * ViaCEP. Usa o mesmo limitador compartilhado (`src/lib/rate-limit.ts`) das
 * acoes de autenticacao: com Upstash configurado o limite vale entre TODAS
 * as instancias; sem ele, cai sozinho para um limitador em memoria por
 * instancia — nunca fica sem freio nenhum, so menos eficaz em multi-instancia.
 */
const CEP_LIMIT = { limit: 40, windowSeconds: 60 };

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  return fwd?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'desconhecido';
}

// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cep: string }> },
) {
  const { cep } = await params;
  const digits = onlyDigits(cep);

  // Nao gasta consulta com o que nem tem formato de CEP.
  if (digits.length !== 8) {
    return NextResponse.json(
      { ok: false, reason: 'formato', message: CEP_MESSAGES.formato },
      { status: 400 },
    );
  }

  const limite = await rateLimit(`cep:${clientIp(request)}`, CEP_LIMIT);
  if (!limite.allowed) {
    return NextResponse.json(
      { ok: false, reason: 'indisponivel', message: CEP_MESSAGES.indisponivel },
      { status: 429, headers: { 'retry-after': String(limite.retryAfterSeconds || 60) } },
    );
  }

  try {
    const r = await lookupCep(digits);
    return NextResponse.json(
      {
        ok: true,
        cep: r.cep,
        state: r.state,
        city: r.city,
        district: r.district,
        street: r.street,
        approx: r.approx ?? null,
      },
      // Endereco de CEP praticamente nao muda: vale guardar no navegador.
      { headers: { 'cache-control': 'public, max-age=86400, stale-while-revalidate=604800' } },
    );
  } catch (err) {
    if (err instanceof CepError) {
      const status = err.reason === 'nao_encontrado' ? 404 : err.reason === 'formato' ? 400 : 503;
      return NextResponse.json(
        { ok: false, reason: err.reason, message: err.message },
        { status },
      );
    }
    console.error('[api/cep] erro inesperado:', err);
    return NextResponse.json(
      { ok: false, reason: 'indisponivel', message: CEP_MESSAGES.indisponivel },
      { status: 503 },
    );
  }
}
