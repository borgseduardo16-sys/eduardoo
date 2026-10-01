import 'server-only';
import { eq, sql } from 'drizzle-orm';
import type { db } from '@/db/client';
import { spaceUnitGroups, spaceUnits } from '@/db/schema';
import { defaultUnitLabel, unitNounFor } from '@/lib/spaces/types';
import type { ParsedGroup } from './config';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Erro que vira mensagem para o proprietário, sem detalhe técnico. */
export class RentalConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RentalConfigError';
  }
}

type UnidadeExistente = {
  id: string;
  group_id: string;
  label: string;
  position: number;
  active: boolean;
  has_history: boolean;
  live: boolean;
};

function valoresDoGrupo(g: ParsedGroup, posicao: number) {
  const r = g.rules;
  return {
    name: g.name,
    position: posicao,
    allowsContinuous: r.allowsContinuous,
    allowsTemporary: r.allowsTemporary,
    monthlyPriceCents: r.monthlyPriceCents,
    tempPricingMode: r.tempPricingMode,
    tempUnit: r.tempUnit,
    tempPriceCents: r.tempPriceCents,
    tempMaxUnits: r.tempMaxUnits,
    tempAllowFraction: r.tempAllowFraction,
    tempPackages: r.tempPackages,
    renewalAllowed: r.renewalAllowed,
    hoursMode: r.hoursMode,
    opensAt: r.opensAt,
    closesAt: r.closesAt,
  };
}

/**
 * Grava a configuração de aluguel do anúncio (Parte 12): grupos, regras e
 * quantidade de unidades. Roda DENTRO da transação de quem chama, com o
 * anúncio travado — duas abas salvando ao mesmo tempo não criam unidade
 * duplicada.
 *
 * Ordem: primeiro tudo o que entra (grupos novos, unidades novas), depois o
 * que sai — um anúncio no ar nunca fica, nem por um instante, sem unidade.
 *
 * Unidade com aluguel em andamento ou futuro nunca some: reduzir a
 * quantidade escolhe primeiro as livres, e o banco recusa de novo se algo
 * escapar (`space_units_keep_live_rental`). Unidade que já teve reserva é
 * desativada, não apagada — o histórico continua apontando para ela.
 */
export async function applyRentalConfig(
  tx: Tx,
  input: { spaceId: string; spaceType: string; groups: ParsedGroup[] },
): Promise<void> {
  const { spaceId, spaceType } = input;
  const nome = unitNounFor(spaceType);

  await tx.execute(sql`SELECT 1 FROM spaces WHERE id = ${spaceId} FOR UPDATE`);
  // Prazos vencidos liberam a unidade antes de contar quem está ocupado.
  await tx.execute(sql`SELECT public.release_expired_rentals(${spaceId})`);

  const gruposExistentes = (await tx.execute(sql`
    SELECT g.id, g.name, g.active,
           EXISTS (SELECT 1 FROM bookings b WHERE b.group_id = g.id) AS has_history
      FROM space_unit_groups g WHERE g.space_id = ${spaceId}
  `)) as unknown as { id: string; name: string; active: boolean; has_history: boolean }[];

  const unidades = (await tx.execute(sql`
    SELECT u.id, u.group_id, u.label, u.position, u.active,
           EXISTS (SELECT 1 FROM bookings b WHERE b.unit_id = u.id) AS has_history,
           public.unit_has_live_rental(u.id) AS live
      FROM space_units u WHERE u.space_id = ${spaceId}
     ORDER BY u.position, u.label
  `)) as unknown as UnidadeExistente[];

  const ativosExistentes = new Set(gruposExistentes.filter((g) => g.active).map((g) => g.id));
  for (const g of input.groups) {
    if (g.id && !ativosExistentes.has(g.id)) {
      throw new RentalConfigError('Um dos grupos não pertence mais a este anúncio. Recarregue a página e tente de novo.');
    }
  }
  const mantidos = new Set(input.groups.map((g) => g.id).filter((id): id is string => !!id));
  const saindo = gruposExistentes.filter((g) => g.active && !mantidos.has(g.id));

  // Confere ANTES de mexer em qualquer coisa: grupo com aluguel vivo não sai.
  for (const g of saindo) {
    const vivos = unidades.filter((u) => u.group_id === g.id && u.active && u.live).length;
    if (vivos > 0) {
      throw new RentalConfigError(
        `O grupo "${g.name}" tem ${vivos} ${vivos === 1 ? nome.singular : nome.plural} com aluguel em andamento ou futuro. Ele só pode sair depois que esses aluguéis terminarem.`,
      );
    }
  }

  // O nome de um grupo que sai fica livre para um grupo novo com o mesmo nome.
  for (const g of saindo) {
    await tx
      .update(spaceUnitGroups)
      .set({ name: sql`left(${spaceUnitGroups.name}, 40) || ' (removido ' || to_char(now(), 'DD/MM HH24:MI:SS') || ')'` })
      .where(eq(spaceUnitGroups.id, g.id));
  }

  // Rótulos ocupados no anúncio inteiro (únicos por anúncio, ativos ou não).
  const rotulos = new Set(unidades.map((u) => u.label));
  let numero = 1;
  const proximoRotulo = () => {
    while (rotulos.has(defaultUnitLabel(spaceType, numero))) numero++;
    const r = defaultUnitLabel(spaceType, numero);
    rotulos.add(r);
    return r;
  };
  let proximaPosicao = unidades.reduce((m, u) => Math.max(m, u.position), 0) + 1;

  // 1. Entradas: grupos (novos e alterados) e unidades a mais.
  const reducoes: { groupId: string; nome: string; remover: number }[] = [];
  for (const [posicao, g] of input.groups.entries()) {
    let groupId = g.id;
    if (groupId) {
      await tx.update(spaceUnitGroups).set(valoresDoGrupo(g, posicao)).where(eq(spaceUnitGroups.id, groupId));
    } else {
      const [novo] = await tx
        .insert(spaceUnitGroups)
        .values({ spaceId, ...valoresDoGrupo(g, posicao) })
        .returning({ id: spaceUnitGroups.id });
      groupId = novo!.id;
    }

    const doGrupo = unidades.filter((u) => u.group_id === groupId);
    const ativas = doGrupo.filter((u) => u.active);
    const diferenca = g.unitCount - ativas.length;

    if (diferenca > 0) {
      // Primeiro reativa as que já existiram neste grupo; depois cria.
      const inativas = doGrupo.filter((u) => !u.active).slice(0, diferenca);
      for (const u of inativas) {
        await tx.update(spaceUnits).set({ active: true }).where(eq(spaceUnits.id, u.id));
      }
      for (let i = inativas.length; i < diferenca; i++) {
        await tx.insert(spaceUnits).values({ spaceId, groupId, label: proximoRotulo(), position: proximaPosicao++ });
      }
    } else if (diferenca < 0) {
      reducoes.push({ groupId, nome: g.name, remover: -diferenca });
    }
  }

  // 2. Saídas: unidades a menos e grupos removidos.
  for (const r of reducoes) {
    const ativas = unidades.filter((u) => u.group_id === r.groupId && u.active);
    const livres = ativas.filter((u) => !u.live).reverse();
    if (livres.length < r.remover) {
      const ocupadas = ativas.length - livres.length;
      throw new RentalConfigError(
        `${input.groups.length === 1 ? 'Este anúncio' : `O grupo "${r.nome}"`} tem ${ocupadas} ${ocupadas === 1 ? nome.singular : nome.plural} com aluguel em andamento ou futuro — não dá para ficar com menos de ${ocupadas}.`,
      );
    }
    for (const u of livres.slice(0, r.remover)) {
      if (u.has_history) await tx.update(spaceUnits).set({ active: false }).where(eq(spaceUnits.id, u.id));
      else await tx.delete(spaceUnits).where(eq(spaceUnits.id, u.id));
    }
  }
  for (const g of saindo) {
    if (g.has_history) await tx.update(spaceUnitGroups).set({ active: false }).where(eq(spaceUnitGroups.id, g.id));
    else await tx.delete(spaceUnitGroups).where(eq(spaceUnitGroups.id, g.id));
  }
}

/** Grupos ativos com a quantidade de unidades ativas, para montar a tela de edição. */
export async function groupsForEditing(
  executor: Pick<Tx, 'execute'>,
  spaceId: string,
): Promise<{ id: string; name: string; unitCount: number; liveUnits: number }[]> {
  return (await executor.execute(sql`
    SELECT g.id, g.name,
           count(u.id) FILTER (WHERE u.active)::int AS "unitCount",
           count(u.id) FILTER (WHERE u.active AND public.unit_has_live_rental(u.id))::int AS "liveUnits"
      FROM space_unit_groups g
      LEFT JOIN space_units u ON u.group_id = g.id
     WHERE g.space_id = ${spaceId} AND g.active
     GROUP BY g.id, g.name, g.position, g.created_at
     ORDER BY g.position, g.created_at
  `)) as unknown as { id: string; name: string; unitCount: number; liveUnits: number }[];
}
