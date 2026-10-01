/**
 * Fixtures da Parte 12 para os scripts de verificação.
 *
 * Desde a Parte 12 o banco não deixa um anúncio ir ao ar sem pelo menos uma
 * unidade alugável (trigger `spaces_publish_requires_units`), e o preço que
 * o anúncio mostra vem dos grupos de unidades. Os scripts antigos criavam o
 * anúncio com `price_monthly_cents` e publicavam direto; agora cada um passa
 * por aqui antes de publicar — o mesmo que o formulário "Como alugar" faz.
 */
import type postgres from 'postgres';

type Sql = postgres.Sql | postgres.TransactionSql;

export type UnidadesCriadas = { groupId: string; unitIds: string[] };

/**
 * Grupo "Padrão" (aluguel mensal, com o preço que o anúncio já tinha) e
 * `quantidade` unidades. Não faz nada se o anúncio já tem grupo.
 */
export async function garantirUnidadePadrao(sql: Sql, spaceId: string, quantidade = 1): Promise<UnidadesCriadas> {
  const [existente] = await sql<{ id: string }[]>`
    SELECT id FROM space_unit_groups WHERE space_id = ${spaceId} ORDER BY position LIMIT 1`;
  if (existente) {
    const unidades = await sql<{ id: string }[]>`
      SELECT id FROM space_units WHERE group_id = ${existente.id} ORDER BY position`;
    return { groupId: existente.id, unitIds: unidades.map((u) => u.id) };
  }
  const [espaco] = await sql<{ price_monthly_cents: number | null }[]>`
    SELECT price_monthly_cents FROM spaces WHERE id = ${spaceId}`;
  if (!espaco?.price_monthly_cents) {
    throw new Error(`anúncio ${spaceId} sem preço mensal para criar a unidade padrão`);
  }
  const [grupo] = await sql<{ id: string }[]>`
    INSERT INTO space_unit_groups (space_id, name, allows_continuous, monthly_price_cents)
    VALUES (${spaceId}, 'Padrão', true, ${espaco.price_monthly_cents})
    RETURNING id`;
  const unitIds: string[] = [];
  for (let n = 1; n <= quantidade; n++) {
    const [u] = await sql<{ id: string }[]>`
      INSERT INTO space_units (space_id, group_id, label, position)
      VALUES (${spaceId}, ${grupo!.id}, ${`Unidade ${n}`}, ${n})
      RETURNING id`;
    unitIds.push(u!.id);
  }
  return { groupId: grupo!.id, unitIds };
}

/** Muda o preço mensal como o proprietário faria: no grupo, não no anúncio. */
export async function mudarPrecoMensal(sql: Sql, spaceId: string, novoPrecoCents: number): Promise<void> {
  await sql`
    UPDATE space_unit_groups SET monthly_price_cents = ${novoPrecoCents}
     WHERE space_id = ${spaceId} AND allows_continuous`;
}

/**
 * Uma unidade do grupo padrão sem reserva viva — para os scripts que gravam
 * reserva direto por SQL: o banco exige grupo e unidade em toda reserva que
 * ocupa (aceita, aguardando pagamento, ativa, pagamento pendente) e recusa
 * duas reservas vivas na mesma unidade. Se todas estiverem ocupadas, cria a
 * próxima unidade do grupo, como o proprietário faria.
 */
export async function unidadeLivre(sql: Sql, spaceId: string): Promise<{ groupId: string; unitId: string }> {
  const { groupId } = await garantirUnidadePadrao(sql, spaceId);
  const [livre] = await sql<{ id: string }[]>`
    SELECT u.id FROM space_units u
     WHERE u.group_id = ${groupId} AND u.active
       AND NOT EXISTS (
         SELECT 1 FROM bookings b
          WHERE b.unit_id = u.id AND b.status IN ('approved', 'awaiting_payment', 'active', 'past_due'))
     ORDER BY u.position
     LIMIT 1`;
  if (livre) return { groupId, unitId: livre.id };
  const [proxima] = await sql<{ n: number }[]>`
    SELECT coalesce(max(position), 0)::int + 1 AS n FROM space_units WHERE space_id = ${spaceId}`;
  const n = proxima!.n;
  const [u] = await sql<{ id: string }[]>`
    INSERT INTO space_units (space_id, group_id, label, position)
    VALUES (${spaceId}, ${groupId}, ${`Unidade ${n}`}, ${n})
    RETURNING id`;
  return { groupId, unitId: u!.id };
}

/**
 * O que o formulário "Como alugar" mandaria para mudar só o preço mensal:
 * o grupo que já existe (com o id, para editar e não recriar) ou, num
 * rascunho ainda sem grupo, um grupo "Padrão" novo com uma unidade.
 */
export async function configPrecoMensal(sql: Sql, spaceId: string, precoReais: string): Promise<string> {
  const [g] = await sql<{ id: string; name: string; n: number }[]>`
    SELECT g.id, g.name,
           (SELECT count(*)::int FROM space_units u WHERE u.group_id = g.id AND u.active) AS n
      FROM space_unit_groups g
     WHERE g.space_id = ${spaceId} AND g.active
     ORDER BY g.position
     LIMIT 1`;
  const grupo = g
    ? { id: g.id, name: g.name, unitCount: Math.max(1, g.n), mode: 'continuous', monthlyPrice: precoReais }
    : { name: 'Padrão', unitCount: 1, mode: 'continuous', monthlyPrice: precoReais };
  return JSON.stringify({ availableFrom: new Date().toISOString().slice(0, 10), groups: [grupo] });
}
