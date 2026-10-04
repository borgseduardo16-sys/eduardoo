import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/dal';
import { accessAudioPathForUser } from '@/lib/bookings/queries';
import { streamChatAudio } from '@/lib/messaging/audio-stream';

/**
 * GET /api/reservas/[id]/audio — o áudio das instruções de acesso de uma locação.
 *
 * Mesma regra das instruções escritas: o proprietário (que as gravou) ouve
 * sempre; o locatário só depois que a locação está confirmada (paga). A regra
 * está dentro da consulta (`accessAudioPathForUser`), então antes do pagamento
 * a resposta é 404, igual a locação que não existe.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const path = await accessAudioPathForUser(id, user.id);
  if (!path) return new NextResponse(null, { status: 404 });
  return streamChatAudio(request, path);
}
