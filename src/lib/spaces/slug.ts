/**
 * Geracao de slug para a URL publica do anuncio.
 *
 * O slug vem do titulo mais um sufixo curto e aleatorio. O sufixo existe por
 * dois motivos: garante unicidade sem consultar o banco em laco, e evita que
 * a URL revele quantos anuncios a plataforma tem (o que um id sequencial
 * entregaria de graca a qualquer concorrente).
 */

const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789'; // sem i/l/o/0/1: confundem ao ler

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

function sufixo(tamanho = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(tamanho));
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
}

/** Slug pronto para uso. Titulo vazio ainda produz algo valido. */
export function buildSlug(title: string): string {
  const base = slugify(title) || 'espaco';
  return `${base}-${sufixo()}`;
}
