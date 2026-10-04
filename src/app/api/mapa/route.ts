import { NextResponse, type NextRequest } from 'next/server';
import { parseExploreQuery } from '@/lib/maps/explore-params';
import { exploreSpaces } from '@/lib/maps/explore';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Dados públicos do mapa de exploração: marcadores e grupos de uma área.
 *
 * Sem login (o mapa é público como a busca), mas com limite por IP — cada vez
 * que a pessoa arrasta o mapa sai uma chamada. A resposta tem tamanho
 * limitado por construção (ver `exploreSpaces`) e só usa o ponto PÚBLICO dos
 * anúncios. Nada é guardado: a posição da pessoa, quando vem, só serve para
 * filtrar por distância nesta chamada.
 */
export const dynamic = 'force-dynamic';

function ipDe(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'sem-ip';
}

export async function GET(req: NextRequest) {
  const limite = await rateLimit(`mapa:${ipDe(req)}`, { limit: 120, windowSeconds: 60 });
  if (!limite.allowed) {
    return NextResponse.json(
      { error: 'Muitas consultas seguidas. Aguarde alguns segundos.' },
      { status: 429, headers: { 'Retry-After': String(limite.retryAfterSeconds), 'Cache-Control': 'no-store' } },
    );
  }

  const parsed = parseExploreQuery(req.nextUrl.searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.message }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const resultado = await exploreSpaces(parsed.value);
  return NextResponse.json(resultado, { headers: { 'Cache-Control': 'no-store' } });
}
