/**
 * Fixtures dos scripts de verificação para o modelo mensal por QUANTIDADE.
 *
 * Um anúncio tem um preço mensal e `quantity_offered` unidades; não há
 * unidades individuais (A1, B17…). Os scripts criam o anúncio direto por SQL —
 * o mesmo que o formulário "Como alugar" grava — e o publicam depois das três
 * fotos, porque isso é travado por gatilho de verdade
 * (`guard_publish_requires_photos`) e não dá para contornar.
 */
import type postgres from 'postgres';
import { todayInSaoPaulo } from '../../src/lib/dates';

type Sql = postgres.Sql | postgres.TransactionSql;

export type NovoAnuncio = {
  ownerId: string;
  slug: string;
  precoCents: number;
  /** Unidades oferecidas na plataforma (padrão 1). */
  quantidade?: number;
  tipo?: string;
  cidade?: string;
  bairro?: string;
  /** Ponto exato; o aproximado é deslocado um pouco (ou igual, em tipo comercial), como faz o banco. */
  lat?: number;
  lng?: number;
  /** `published` (padrão) ou `draft`. */
  status?: 'published' | 'draft';
  depositEnabled?: boolean;
};

/** Anúncio completo, com fotos e (por padrão) já no ar. Devolve o id. */
export async function criarAnuncio(sql: Sql, a: NovoAnuncio): Promise<string> {
  // Padrão: um ponto isolado (Manaus), para os anúncios de teste não aparecerem nas buscas por
  // proximidade de Colatina que outros testes fazem. Quem testa distância passa a própria coordenada.
  const lat = a.lat ?? -3.119;
  const lng = a.lng ?? -60.0217;
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO spaces
      (owner_id, slug, type, title, description, street, number, district, city, state,
       available_from, price_monthly_cents, quantity_offered, size_m2, draft_step,
       deposit_enabled, location, approx_location)
    VALUES
      (${a.ownerId}, ${a.slug}, ${a.tipo ?? 'garagem'}, ${`Espaço ${a.slug}`},
       'Descricao com mais de vinte caracteres para passar na regra do banco.',
       'Rua Exata', '123', ${a.bairro ?? 'Centro'}, ${a.cidade ?? 'Colatina'}, 'ES',
       (now() AT TIME ZONE 'America/Sao_Paulo')::date, ${a.precoCents}, ${a.quantidade ?? 1}, 18, 8,
       ${a.depositEnabled ?? false},
       ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
       ST_SetSRID(ST_MakePoint(${lng + 0.0015}, ${lat - 0.0015}), 4326))
    RETURNING id`;
  const id = row!.id;
  for (const n of [0, 1, 2]) {
    await sql`INSERT INTO space_images (space_id, storage_path, position)
      VALUES (${id}, ${`${a.ownerId}/${id}/f${n}.jpg`}, ${n})`;
  }
  if ((a.status ?? 'published') === 'published') {
    await sql`UPDATE spaces SET status='published', published_at=now() WHERE id=${id}`;
  }
  return id;
}

/** Quantas vagas livres o banco informa agora (`quantity_available`) e o status do anúncio. */
export async function vagas(sql: Sql, spaceId: string): Promise<{ livres: number; oferecidas: number; status: string }> {
  const [r] = await sql<{ livres: number; oferecidas: number; status: string }[]>`
    SELECT quantity_available AS livres, quantity_offered AS oferecidas, status::text AS status
      FROM spaces WHERE id = ${spaceId}`;
  return r!;
}

/** Quantas locações ocupam vaga neste anúncio (a contagem de verdade, direto das reservas). */
export async function ocupadas(sql: Sql, spaceId: string): Promise<number> {
  const [r] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM bookings
     WHERE space_id = ${spaceId} AND status IN ('approved', 'awaiting_payment', 'active', 'past_due')`;
  return r!.n;
}

/**
 * O anúncio passa a oferecer pelo menos `quantidade` unidades — o que a etapa
 * "Como alugar" grava (preço mensal + quantidade). Nunca diminui: cortar abaixo
 * do que está ocupado o banco recusa.
 */
export async function prepararAnuncio(sql: Sql, spaceId: string, quantidade = 1): Promise<void> {
  await sql`UPDATE spaces SET quantity_offered = GREATEST(quantity_offered, ${quantidade}) WHERE id = ${spaceId}`;
}

/** Muda o preço mensal como o proprietário faria: no próprio anúncio. */
export async function mudarPreco(sql: Sql, spaceId: string, novoPrecoCents: number): Promise<void> {
  await sql`UPDATE spaces SET price_monthly_cents = ${novoPrecoCents} WHERE id = ${spaceId}`;
}

/**
 * O formulário da etapa "Como alugar" mudando só o preço mensal: o resto (quantidade, total,
 * disponível a partir de) vai como já está gravado, como o navegador mandaria.
 */
export async function formPreco(sql: Sql, spaceId: string, precoReais: string): Promise<FormData> {
  const [e] = await sql<{ qtd: number; total: number | null; desde: string | null }[]>`
    SELECT quantity_offered AS qtd, quantity_total AS total, available_from::text AS desde
      FROM spaces WHERE id = ${spaceId}`;
  const fd = new FormData();
  fd.set('spaceId', spaceId);
  fd.set('step', 'preco');
  fd.set('priceMonthly', precoReais);
  fd.set('quantityOffered', String(e!.qtd));
  if (e!.total != null) fd.set('quantityTotal', String(e!.total));
  fd.set('availableFrom', e!.desde ?? todayInSaoPaulo());
  return fd;
}
