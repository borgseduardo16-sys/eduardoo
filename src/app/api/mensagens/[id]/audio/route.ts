import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/dal';
import { audioPathOfMessageForUser } from '@/lib/messaging/queries';
import { streamChatAudio } from '@/lib/messaging/audio-stream';

/**
 * GET /api/mensagens/[id]/audio — o áudio de UMA mensagem do chat.
 *
 * Só quem participa da conversa ouve: a participação está dentro da consulta
 * (`audioPathOfMessageForUser`). Quem não participa, mensagem escondida pela
 * moderação e id que não existe respondem igual: 404.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const path = await audioPathOfMessageForUser(id, user.id);
  if (!path) return new NextResponse(null, { status: 404 });
  return streamChatAudio(request, path);
}
