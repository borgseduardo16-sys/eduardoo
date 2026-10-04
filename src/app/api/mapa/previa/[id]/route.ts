import { NextResponse, type NextRequest } from 'next/server';
import { getMapPreview } from '@/lib/maps/explore';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Prévia de um espaço ao tocar no marcador: foto e características. Pública
 * (só anúncio publicado), com limite por IP. O `id` é conferido como UUID
 * antes de qualquer consulta.
 */
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'sem-ip';
  const limite = await rateLimit(`mapa-previa:${ip}`, { limit: 90, windowSeconds: 60 });
  if (!limite.allowed) {
    return NextResponse.json(
      { error: 'Muitas consultas seguidas. Aguarde alguns segundos.' },
      { status: 429, headers: { 'Retry-After': String(limite.retryAfterSeconds), 'Cache-Control': 'no-store' } },
    );
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Espaço não encontrado.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  const previa = await getMapPreview(id);
  if (!previa) {
    return NextResponse.json({ error: 'Espaço não encontrado.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json(previa, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
