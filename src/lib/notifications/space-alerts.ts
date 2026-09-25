import 'server-only';
import { formatBRL } from '@/lib/money';
import { listFavoriterUserIds, listFavoritePatternsForType } from '@/lib/favorites/queries';
import { sendGovernedNotification } from './governor';
import { computeCompatibilityScore, COMPATIBILITY_THRESHOLD } from './compatibility';

/**
 * Alertas sobre espaços favoritados (Fase 18.2).
 *
 * Só quedas de preço geram notificação, nunca aumento: a pessoa que
 * favoritou não pode "agir" sobre um preço que já subiu, e a instrução do
 * próprio sistema é "melhor deixar de enviar do que incomodar" — um aviso de
 * má notícia sobre a qual nada pode ser feito pesa mais que ajuda.
 */
const PRICE_DROP_THRESHOLD_BPS = 500; // 5%
const PRICE_DROP_COOLDOWN_HOURS = 24 * 7;
const AVAILABILITY_COOLDOWN_HOURS = 24;

export type SpaceRef = { id: string; title: string; slug: string };

/**
 * Queda de preço em espaço favoritado.
 *
 * Limiar em bps, comparado em inteiro (`queda*10000 >= anterior*500`) em vez
 * de dividir e comparar float — mesma disciplina de `money.ts`, mesmo sem
 * CHECK de banco aqui: nada impede fazer a conta certa mesmo quando o valor
 * não é persistido.
 */
export async function alertFavoritersOfPriceDrop(
  space: SpaceRef,
  oldPriceCents: number,
  newPriceCents: number,
): Promise<void> {
  if (newPriceCents >= oldPriceCents) return;

  const quedaCents = oldPriceCents - newPriceCents;
  if (quedaCents * 10000 < oldPriceCents * PRICE_DROP_THRESHOLD_BPS) return;

  const favoriterIds = await listFavoriterUserIds(space.id);
  if (favoriterIds.length === 0) return;

  const linkPath = `/espacos/${space.slug}`;
  for (const userId of favoriterIds) {
    await sendGovernedNotification({
      userId,
      type: 'favorite_price_drop',
      title: 'Preço baixou em um espaço salvo',
      body: `"${space.title}" agora está por ${formatBRL(newPriceCents)}/mês (era ${formatBRL(oldPriceCents)}).`,
      linkPath,
      data: { spaceId: space.id },
      cooldownHours: PRICE_DROP_COOLDOWN_HOURS,
      scopeKey: space.id,
    });
  }
}

/**
 * Espaço favoritado saiu do ar (pausado ou alugado) ou voltou a ficar
 * disponível. Cooldown mais curto que o de preço: disponibilidade muda o que
 * a pessoa pode FAZER agora mesmo (agendar visita, perder a vaga), então
 * flapping rápido ainda assim merece registrar as duas pontas — só repetição
 * do MESMO lado dentro de 24h é que fica em silêncio.
 */
export async function alertFavoritersOfAvailabilityChange(
  space: SpaceRef,
  kind: 'unavailable' | 'available_again',
): Promise<void> {
  const favoriterIds = await listFavoriterUserIds(space.id);
  if (favoriterIds.length === 0) return;

  const linkPath = `/espacos/${space.slug}`;
  const copy =
    kind === 'unavailable'
      ? { title: 'Espaço salvo saiu do ar', body: `"${space.title}" não está mais disponível no momento.` }
      : { title: 'Espaço salvo está disponível de novo', body: `"${space.title}" voltou a ficar disponível.` };

  for (const userId of favoriterIds) {
    await sendGovernedNotification({
      userId,
      type: kind === 'unavailable' ? 'favorite_unavailable' : 'favorite_available_again',
      title: copy.title,
      body: copy.body,
      linkPath,
      data: { spaceId: space.id },
      cooldownHours: AVAILABILITY_COOLDOWN_HOURS,
      scopeKey: space.id,
    });
  }
}

const COMPATIBLE_COOLDOWN_HOURS = 48;
/** Trava de custo/ruído: mesmo num tipo+cidade muito favoritado, no máximo 50 pessoas por publicação. */
const MAX_COMPATIBLE_RECIPIENTS = 50;

export type NewPublishedSpace = {
  id: string;
  ownerId: string;
  type: string;
  city: string;
  title: string;
  slug: string;
  priceMonthlyCents: number;
  featureKeys: string[];
};

/**
 * "Novo espaço compatível" (Fase 18.3) — dispara só na primeira publicação
 * (ver `publishSpaceAction`). Tipo e cidade já são o portão de quem entra em
 * `listFavoritePatternsForType`; aqui só pontua e filtra pelo limiar.
 *
 * Cooldown SEM `scopeKey`: é por pessoa, não por espaço — o objetivo é não
 * repetir "temos algo novo pra você" com frequência, não impedir que a
 * mesma pessoa seja avisada de espaços DIFERENTES.
 */
export async function alertCompatibleFavoritersOfNewSpace(space: NewPublishedSpace): Promise<void> {
  const patterns = await listFavoritePatternsForType(space.type, space.city, space.id, space.ownerId);
  if (patterns.length === 0) return;

  const elegiveis = patterns
    .map((pattern) => ({ userId: pattern.userId, score: computeCompatibilityScore(pattern, space) }))
    .filter((c) => c.score >= COMPATIBILITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_COMPATIBLE_RECIPIENTS);

  if (elegiveis.length === 0) return;

  const linkPath = `/espacos/${space.slug}`;
  for (const { userId, score } of elegiveis) {
    await sendGovernedNotification({
      userId,
      type: 'new_compatible_space',
      title: 'Novo espaço com o seu perfil',
      body: `"${space.title}" acabou de ser publicado em ${space.city} e combina com o que você costuma salvar.`,
      linkPath,
      data: { spaceId: space.id, compatibilityScore: score },
      cooldownHours: COMPATIBLE_COOLDOWN_HOURS,
    });
  }
}
