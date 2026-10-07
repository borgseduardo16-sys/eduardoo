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

// ---------------------------------------------------------------------------
// Premium (Etapa 2): Premium = ciclo PAGO vigente. Os testes não inserem mais
// uma linha "ativa" solta: criam o ciclo de verdade (com cobrança confirmada,
// quando pago), como o webhook faria.
// ---------------------------------------------------------------------------

/**
 * Deixa a pessoa Premium AGORA, com um ciclo vigente.
 *  - `pago: true`  → assinatura paga: cobrança confirmada + ciclo (dá direito ao benefício financeiro);
 *  - padrão        → concessão administrativa (modo teste, sem benefício financeiro, a menos que `financeiro`).
 * Devolve o id do ciclo.
 */
export async function darPremium(
  sql: Sql,
  userId: string,
  opts: { pago?: boolean; dias?: number; financeiro?: boolean } = {},
): Promise<string> {
  const dias = opts.dias ?? 30;
  let chargeId: string | null = null;
  if (opts.pago) {
    const [c] = await sql<{ id: string }[]>`
      INSERT INTO premium_charges (user_id, provider_payment_id, provider_subscription_id, status, method, amount_cents, due_date, paid_at)
      VALUES (${userId}, ${`pay_fx_${crypto.randomUUID()}`}, ${`sub_fx_${userId}`}, 'confirmed', 'pix', 11990,
              (now() AT TIME ZONE 'America/Sao_Paulo')::date, now())
      RETURNING id`;
    chargeId = c!.id;
  }
  const [ciclo] = await sql<{ id: string; starts_at: Date; ends_at: Date }[]>`
    INSERT INTO premium_cycles (user_id, number, source, charge_id, starts_at, ends_at, financial_eligible)
    SELECT ${userId}::uuid, COALESCE(max(number), 0) + 1,
           ${opts.pago ? 'subscription' : 'admin_grant'}::premium_membership_source, ${chargeId}::uuid,
           now() - interval '1 minute', now() + make_interval(days => ${dias}::int),
           ${opts.pago ? true : (opts.financeiro ?? false)}::boolean
      FROM premium_cycles WHERE user_id = ${userId}
    RETURNING id, starts_at, ends_at`;
  await sql`
    INSERT INTO premium_memberships (user_id, status, source, provider, provider_subscription_id, billing_method, plan_cents,
                                     current_period_start, current_period_end, financial_test_enabled)
    VALUES (${userId}, 'active', ${opts.pago ? 'subscription' : 'admin_grant'}::premium_membership_source,
            ${opts.pago ? 'asaas' : null}, ${opts.pago ? `sub_fx_${userId}` : null}, ${opts.pago ? 'pix' : null}::payment_method,
            ${opts.pago ? 11990 : null}, ${ciclo!.starts_at}, ${ciclo!.ends_at},
            ${!opts.pago && (opts.financeiro ?? false)})
    ON CONFLICT (user_id) DO UPDATE SET
      status = 'active', source = EXCLUDED.source, provider = EXCLUDED.provider,
      provider_subscription_id = EXCLUDED.provider_subscription_id, billing_method = EXCLUDED.billing_method,
      plan_cents = EXCLUDED.plan_cents, current_period_start = EXCLUDED.current_period_start,
      current_period_end = EXCLUDED.current_period_end, financial_test_enabled = EXCLUDED.financial_test_enabled,
      cancel_at_period_end = false, cancel_requested_at = NULL, cancelled_at = NULL, cancelled_by = NULL, updated_at = now()`;
  return ciclo!.id;
}

/** Encerra o Premium agora (como a revogação ou um estorno): termina os ciclos vigentes e marca a assinatura. */
export async function tirarPremium(sql: Sql, userId: string): Promise<void> {
  await sql`
    UPDATE premium_cycles SET ended_early_at = GREATEST(starts_at, LEAST(now(), ends_at)), ended_early_reason = 'fixture'
     WHERE user_id = ${userId} AND ended_early_at IS NULL AND now() < ends_at`;
  await sql`
    UPDATE premium_memberships SET status = 'cancelled', cancelled_at = now(), updated_at = now() WHERE user_id = ${userId}`;
}

/**
 * Apaga tudo do Premium dessas pessoas. Ciclo não se apaga e o livro-razão é append-only — só com os
 * gatilhos de proteção desligados DURANTE esta limpeza (e religados mesmo se algo falhar).
 */
export async function limparPremium(sql: Sql, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await sql`DELETE FROM promotions WHERE owner_id = ANY(${ids}) AND premium_cycle_id IS NOT NULL`;
  await sql`ALTER TABLE premium_cycles DISABLE TRIGGER premium_cycles_immutable`;
  await sql`ALTER TABLE ledger_entries DISABLE TRIGGER ledger_entries_append_only`;
  try {
    await sql`DELETE FROM ledger_entries WHERE premium_charge_id IN (SELECT id FROM premium_charges WHERE user_id = ANY(${ids}))`;
    await sql`DELETE FROM premium_cycles WHERE user_id = ANY(${ids})`;
  } finally {
    await sql`ALTER TABLE ledger_entries ENABLE TRIGGER ledger_entries_append_only`;
    await sql`ALTER TABLE premium_cycles ENABLE TRIGGER premium_cycles_immutable`;
  }
  await sql`DELETE FROM premium_charges WHERE user_id = ANY(${ids})`;
  await sql`DELETE FROM premium_memberships WHERE user_id = ANY(${ids})`;
}
