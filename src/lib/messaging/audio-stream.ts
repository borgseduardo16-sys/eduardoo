import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { signChatAudioUrl } from './audio';

const MIME_POR_EXTENSAO: Record<string, string> = {
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
};

/**
 * Entrega o áudio de um caminho do bucket privado, pelo próprio servidor.
 *
 * Quem chama JÁ provou que a pessoa pode ouvir (participante da conversa ou
 * da locação); aqui só se busca o arquivo com uma URL assinada de 60 s —
 * gerada a cada pedido e nunca entregue ao navegador — e se repassa o corpo.
 * O repasse mantém `Range` (tocar do meio, "pular") e serve do MESMO site: o
 * navegador nunca vê o endereço do armazenamento, e nada dele fica em cache.
 */
export async function streamChatAudio(request: NextRequest, path: string): Promise<NextResponse> {
  const url = await signChatAudioUrl(path, 60);
  if (!url) return new NextResponse(null, { status: 503 });

  const faixa = request.headers.get('range');
  let origem: Response;
  try {
    origem = await fetch(url, { headers: faixa ? { range: faixa } : {}, cache: 'no-store' });
  } catch (err) {
    console.error('[áudio] falha ao buscar no armazenamento:', err);
    return new NextResponse(null, { status: 502 });
  }
  if (origem.status === 404) return new NextResponse(null, { status: 404 });
  if (!origem.ok && origem.status !== 206) return new NextResponse(null, { status: 502 });

  const extensao = path.split('.').pop()?.toLowerCase() ?? '';
  const headers = new Headers();
  for (const h of ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    const v = origem.headers.get(h);
    if (v) headers.set(h, v);
  }
  // O tipo vem do que o servidor gravou (extensão validada no upload), não do que o armazenamento diz.
  headers.set('content-type', MIME_POR_EXTENSAO[extensao] ?? 'application/octet-stream');
  headers.set('cache-control', 'private, no-store');
  headers.set('x-content-type-options', 'nosniff');
  if (!headers.has('accept-ranges')) headers.set('accept-ranges', 'bytes');

  return new NextResponse(origem.body, { status: origem.status, headers });
}
