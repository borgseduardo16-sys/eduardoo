import { ImageResponse } from 'next/og';
import { getPublicSpaceBySlug } from '@/lib/spaces/queries';
import { createAdminClient } from '@/lib/supabase/admin';
import { SPACE_IMAGES_BUCKET } from '@/lib/storage/images';
import { formatBRL } from '@/lib/money';
import { spaceTypeLabel, type SpaceTypeKey } from '@/lib/spaces/types';

/**
 * Imagem de compartilhamento (WhatsApp, redes sociais) do anúncio.
 *
 * NÃO usa a URL assinada da foto (`signImagePaths`) — ela expira em 1 hora,
 * e um preview de link de WhatsApp fica em cache por dias. Em vez disso,
 * busca os BYTES da foto aqui dentro, pela chave de serviço, e devolve a
 * imagem pronta: o link de compartilhamento nunca aponta para o Storage,
 * então nunca expira.
 *
 * Sem fonte customizada: o alfabeto usado (título, preço, tipo) é só o do
 * português, e a fonte padrão do gerador de imagem cobre isso. Evita
 * carregar ~700 KB de fonte a cada anúncio compartilhado.
 */
export const alt = 'Foto do espaço no MyPlace';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const COR_FUNDO = '#141b2e';
const COR_ACENTO = '#e8a355';

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const space = await getPublicSpaceBySlug(slug);

  let fotoDataUri: string | null = null;
  const capa = space?.images[0];
  if (capa) {
    try {
      const supabase = createAdminClient();
      const { data } = await supabase.storage.from(SPACE_IMAGES_BUCKET).download(capa.storagePath);
      if (data) {
        const buf = Buffer.from(await data.arrayBuffer());
        fotoDataUri = `data:${data.type || 'image/jpeg'};base64,${buf.toString('base64')}`;
      }
    } catch (err) {
      console.error('[opengraph-image] falha ao baixar a capa:', err instanceof Error ? err.message : err);
    }
  }

  if (!space) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%', height: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: COR_FUNDO, color: 'white', fontSize: 48,
          }}
        >
          MyPlace
        </div>
      ),
      { ...size },
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', position: 'relative',
          background: COR_FUNDO, fontFamily: 'sans-serif',
        }}
      >
        {fotoDataUri && (
          // next/og não aceita o componente Image do Next — precisa ser <img> mesmo.
          <img
            src={fotoDataUri}
            alt=""
            width={size.width}
            height={size.height}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}

        <div
          style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to top, rgba(11,16,28,0.88) 0%, rgba(11,16,28,0.35) 45%, rgba(11,16,28,0.05) 75%)',
            display: 'flex',
          }}
        />

        <div
          style={{
            position: 'absolute', left: 64, right: 64, bottom: 56,
            display: 'flex', flexDirection: 'column', gap: 14, color: 'white',
          }}
        >
          <div style={{ display: 'flex', fontSize: 26, fontWeight: 600, letterSpacing: 3, color: COR_ACENTO, textTransform: 'uppercase' }}>
            {spaceTypeLabel(space.type as SpaceTypeKey)}
          </div>
          <div style={{ display: 'flex', fontSize: 54, fontWeight: 700, lineHeight: 1.12, maxWidth: 980 }}>
            {space.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, fontSize: 30 }}>
            <span style={{ display: 'flex', fontWeight: 700 }}>{formatBRL(space.priceMonthlyCents)}</span>
            <span style={{ display: 'flex', opacity: 0.75 }}>por mês</span>
            {(space.district || space.city) && (
              <span style={{ display: 'flex', opacity: 0.75 }}>
                · {[space.district, space.city].filter(Boolean).join(', ')}
              </span>
            )}
          </div>
        </div>

        <div
          style={{
            position: 'absolute', top: 40, left: 64,
            display: 'flex', alignItems: 'center', gap: 10, color: 'white', fontSize: 26, fontWeight: 700,
          }}
        >
          MyPlace
        </div>
      </div>
    ),
    { ...size },
  );
}
