import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/dal';
import { recordSpaceEvent } from '@/lib/analytics/track';

/**
 * POST /api/estatisticas — { spaceId, evento: 'visualizacao' | 'compartilhamento' }
 *
 * Chamado pelo navegador (sendBeacon) ao abrir um anúncio ou tocar em
 * compartilhar (Fase 23). Responde sempre 204: quem chama não descobre se
 * contou ou não (nem por que), e nada além do contador do dia é gravado.
 */
export const dynamic = 'force-dynamic';

const corpo = z.object({
  spaceId: z.string().uuid(),
  evento: z.enum(['visualizacao', 'compartilhamento']),
});

export async function POST(request: NextRequest) {
  // Só o próprio site conta (navegadores mandam Sec-Fetch-Site). Pedido de
  // outro site, ou forjado de fora, não soma nada.
  const origem = request.headers.get('sec-fetch-site');
  if (origem && origem !== 'same-origin') return new NextResponse(null, { status: 204 });

  let dados: z.infer<typeof corpo>;
  try {
    const texto = await request.text();
    if (texto.length > 500) return new NextResponse(null, { status: 204 });
    const parsed = corpo.safeParse(JSON.parse(texto));
    if (!parsed.success) return new NextResponse(null, { status: 204 });
    dados = parsed.data;
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'sem-ip';
  let viewerId: string | null = null;
  try {
    viewerId = (await getCurrentUser())?.id ?? null;
  } catch {
    viewerId = null;
  }

  try {
    await recordSpaceEvent(dados.spaceId, dados.evento === 'visualizacao' ? 'view' : 'share', {
      ip,
      userAgent: request.headers.get('user-agent'),
      viewerId,
    });
  } catch (err) {
    console.error('[estatisticas] falha ao contar evento:', err);
  }
  return new NextResponse(null, { status: 204 });
}
