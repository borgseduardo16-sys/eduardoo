import 'server-only';
import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { subscriptions, bookings, spaces, notifications, favorites, conversations } from '@/db/schema';

/**
 * Jobs agendados (Vercel Cron — ver src/app/api/cron/notificacoes/route.ts).
 *
 * Os dois únicos casos da Fase 18 que são genuinamente por TEMPO, e não por
 * ação de alguém: lembrete de vencimento (a pessoa pode nunca abrir o app
 * antes do vencimento — nada dispara sozinho por navegação) e resumo de
 * atividade do proprietário (ninguém "aciona" um resumo, ele precisa
 * aparecer sozinho). Todo o resto da Fase 18 dispara sincronamente dentro da
 * própria action que muda o dado (ver space-alerts.ts).
 */

type RentDueNotificationData = {
  subscriptionId?: string;
  milestone?: string;
  dueDate?: string;
};

/**
 * Lembrete de aluguel vencendo: EXATAMENTE dois avisos por ciclo — 7 dias e
 * 1 dia antes do vencimento — nunca uma contagem regressiva diária. A data
 * "daqui a 7/1 dias" é calculada pelo Postgres (`CURRENT_DATE`), nunca por
 * `new Date()` do processo — evita divergência de fuso entre o servidor cron
 * e o banco.
 *
 * Idempotência: como o cron roda 1x/dia e `next_due_date` é fixo até o ciclo
 * virar, cada assinatura só bate em "vence em 7 dias" num único dia do
 * calendário — a checagem contra notificações recentes existe para o caso
 * do próprio cron rodar 2x no mesmo dia (retry, disparo manual), não para o
 * avanço normal dos dias.
 */
export async function runRentDueReminders(): Promise<{ sent: number }> {
  const candidatos = await db
    .select({
      subscriptionId: subscriptions.id,
      bookingId: subscriptions.bookingId,
      nextDueDate: subscriptions.nextDueDate,
      renterId: bookings.renterId,
      spaceTitle: spaces.title,
      milestone: sql<'7d' | '1d'>`(
        CASE
          WHEN ${subscriptions.nextDueDate} = (CURRENT_DATE + INTERVAL '7 days')::date THEN '7d'
          WHEN ${subscriptions.nextDueDate} = (CURRENT_DATE + INTERVAL '1 day')::date THEN '1d'
        END
      )`,
    })
    .from(subscriptions)
    .innerJoin(bookings, eq(bookings.id, subscriptions.bookingId))
    .innerJoin(spaces, eq(spaces.id, bookings.spaceId))
    .where(
      and(
        eq(subscriptions.status, 'active'),
        sql`${subscriptions.nextDueDate} IN ((CURRENT_DATE + INTERVAL '7 days')::date, (CURRENT_DATE + INTERVAL '1 day')::date)`,
      ),
    );

  if (candidatos.length === 0) return { sent: 0 };

  const recentes = await db
    .select({ data: notifications.data })
    .from(notifications)
    .where(
      and(
        sql`${notifications.type}::text = 'payment_upcoming'`,
        gt(notifications.createdAt, sql`now() - interval '10 days'`),
      ),
    );
  const jaEnviados = new Set(
    recentes.map((n) => {
      const d = (n.data ?? {}) as RentDueNotificationData;
      return `${d.subscriptionId}:${d.milestone}:${d.dueDate}`;
    }),
  );

  const pendentes = candidatos.filter(
    (c) => c.milestone != null && !jaEnviados.has(`${c.subscriptionId}:${c.milestone}:${c.nextDueDate}`),
  );
  if (pendentes.length === 0) return { sent: 0 };

  await db.insert(notifications).values(
    pendentes.map((c) => ({
      userId: c.renterId,
      type: 'payment_upcoming' as const,
      title: c.milestone === '7d' ? 'Aluguel vence em 7 dias' : 'Aluguel vence amanhã',
      body:
        c.milestone === '7d'
          ? `O aluguel de "${c.spaceTitle}" vence em 7 dias.`
          : `O aluguel de "${c.spaceTitle}" vence amanhã.`,
      linkPath: '/reservas',
      data: {
        subscriptionId: c.subscriptionId,
        bookingId: c.bookingId,
        dueDate: c.nextDueDate,
        milestone: c.milestone,
      },
    })),
  );

  return { sent: pendentes.length };
}

/** Nunca manda resumo antes de completar essa janela desde o último — mesmo que o cron seja chamado mais vezes. */
const DIGEST_MIN_WINDOW_HOURS = 24 * 3;

/**
 * Resumo de atividade do proprietário: favoritos e conversas novas nos seus
 * anúncios, agrupados numa notificação só, nunca uma por evento. Pula
 * silenciosamente quando não há nada de novo — um resumo vazio ("ninguém fez
 * nada") não ajuda ninguém e é exatamente o tipo de ruído que a Fase 18
 * existe para evitar.
 *
 * "Visualizações" do pedido original ficam de fora: não há rastreamento de
 * visualização nesta base (ver docs/STATUS.md) — inventar um número aqui
 * seria dado de mentira, o que a regra 3 do projeto proíbe.
 */
export async function runOwnerActivityDigests(): Promise<{ sent: number }> {
  const donos = await db
    .selectDistinct({ ownerId: spaces.ownerId })
    .from(spaces)
    .where(and(inArray(spaces.status, ['published', 'paused', 'rented']), isNull(spaces.deletedAt)));

  let sent = 0;

  for (const { ownerId } of donos) {
    const [ultimoDigest] = await db
      .select({ createdAt: notifications.createdAt })
      .from(notifications)
      .where(and(eq(notifications.userId, ownerId), sql`${notifications.type}::text = 'owner_activity_digest'`))
      .orderBy(desc(notifications.createdAt))
      .limit(1);

    if (ultimoDigest) {
      const horasDesdeUltimo = (Date.now() - ultimoDigest.createdAt.getTime()) / 3_600_000;
      if (horasDesdeUltimo < DIGEST_MIN_WINDOW_HOURS) continue;
    }
    const janelaInicio = ultimoDigest?.createdAt ?? new Date(Date.now() - DIGEST_MIN_WINDOW_HOURS * 3_600_000);

    const [{ novosFavoritos } = { novosFavoritos: 0 }] = await db
      .select({ novosFavoritos: sql<number>`count(*)::int` })
      .from(favorites)
      .innerJoin(spaces, eq(spaces.id, favorites.spaceId))
      .where(and(eq(spaces.ownerId, ownerId), gt(favorites.createdAt, janelaInicio)));

    const [{ novasConversas } = { novasConversas: 0 }] = await db
      .select({ novasConversas: sql<number>`count(*)::int` })
      .from(conversations)
      .where(and(eq(conversations.ownerId, ownerId), gt(conversations.createdAt, janelaInicio)));

    if (novosFavoritos === 0 && novasConversas === 0) continue;

    const partes: string[] = [];
    if (novosFavoritos > 0) {
      partes.push(`${novosFavoritos} ${novosFavoritos === 1 ? 'pessoa favoritou' : 'pessoas favoritaram'} seus anúncios`);
    }
    if (novasConversas > 0) {
      partes.push(`${novasConversas} ${novasConversas === 1 ? 'nova conversa' : 'novas conversas'}`);
    }

    await db.insert(notifications).values({
      userId: ownerId,
      type: 'owner_activity_digest',
      title: 'Atividade recente nos seus anúncios',
      body: `${partes.join(' e ')} nos últimos dias.`,
      linkPath: '/meus-espacos',
      data: {
        favorites: novosFavoritos,
        conversations: novasConversas,
        windowStart: janelaInicio.toISOString(),
      },
    });
    sent++;
  }

  return { sent };
}
