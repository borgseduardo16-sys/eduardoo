import 'server-only';
import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { SPACE_IMAGES_BUCKET } from './images';

/**
 * URLs assinadas para as fotos.
 *
 * O bucket e PRIVADO. Nada e servido por link publico permanente: a foto da
 * garagem de alguem nao pode ficar acessivel para sempre por um endereco solto
 * que vaze num print, num histórico de navegador ou num indexador.
 *
 * Cada URL vale por uma hora e e gerada no servidor, no momento da renderizacao.
 */

const URL_TTL_SECONDS = 60 * 60;

/**
 * Assina varios caminhos de uma vez.
 *
 * Em lote de proposito: uma listagem com 24 anuncios faria 24 chamadas de rede
 * se cada card assinasse a propria capa. `cache()` ainda evita repetir a
 * chamada quando o mesmo conjunto aparece duas vezes no mesmo render.
 */
export const signImagePaths = cache(
  async (paths: readonly string[]): Promise<Map<string, string>> => {
    const unicos = [...new Set(paths.filter(Boolean))];
    const resultado = new Map<string, string>();
    if (unicos.length === 0) return resultado;

    const supabase = createAdminClient();
    const { data, error } = await supabase.storage
      .from(SPACE_IMAGES_BUCKET)
      .createSignedUrls(unicos, URL_TTL_SECONDS);

    if (error || !data) {
      // Sem URL a imagem nao aparece, e a interface mostra o estado vazio.
      // Preferimos isso a derrubar a pagina inteira por causa de uma foto.
      console.error('[storage] falha ao assinar URLs de imagem:', error?.message);
      return resultado;
    }

    for (const item of data) {
      if (item.signedUrl && item.path) resultado.set(item.path, item.signedUrl);
    }
    return resultado;
  },
);

/** Assina um caminho so. */
export async function signImagePath(path: string | null): Promise<string | null> {
  if (!path) return null;
  const mapa = await signImagePaths([path]);
  return mapa.get(path) ?? null;
}
