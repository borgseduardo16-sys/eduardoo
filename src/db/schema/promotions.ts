import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { promotionType, promotionStatus, promotionSource, premiumMembershipStatus, premiumMembershipSource } from './enums';
import { profiles } from './users';
import { spaces } from './spaces';

/**
 * Promocao de um anuncio (Destaque ou Turbo).
 *
 * Estado real (`promotionStatus`), nunca um booleano `is_featured` — pedido
 * explicito, para a estrutura aguentar evolucao futura (agendamento,
 * campanha) sem migracao nova.
 *
 * `ownerId` e redundante com `spaces.owner_id` de proposito, mesmo padrao de
 * `bookings.owner_id`: o dono do anuncio pode mudar (nao muda, mas podia);
 * quem usou o beneficio naquele mes, nao.
 */
export const promotions = pgTable(
  'promotions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'restrict' }),

    type: promotionType('type').notNull(),
    status: promotionStatus('status').notNull().default('active'),
    source: promotionSource('source').notNull(),

    /** Id da transacao no gateway, quando vier de compra avulsa. NULL hoje sempre. */
    transactionId: text('transaction_id'),

    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: uuid('cancelled_by').references(() => profiles.id, { onDelete: 'set null' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('promotions_space_idx').on(t.spaceId),
    /**
     * O contador mensal de beneficio usado (2 Destaques + 1 Turbo por mes)
     * e lido contando linhas aqui — `owner_id + type + source + created_at
     * dentro do mes corrente` — em vez de uma coluna de saldo a parte. Este
     * indice e o que torna essa contagem rapida.
     */
    index('promotions_owner_period_idx').on(t.ownerId, t.type, t.source, t.createdAt),
    /** Varredura preguicosa de promocao vencida (mesmo padrao de bookings expirados). */
    index('promotions_status_expires_idx').on(t.status, t.expiresAt),

    /**
     * Um anuncio nao pode ter mais de uma promocao vigente ao mesmo tempo —
     * cobre as duas regras do pedido numa unica trava: nao sobrepor Destaque
     * e nao empilhar Turbo com Turbo. `scheduled` entra tambem porque uma
     * promocao agendada futura ja "reserva" o proximo periodo do anuncio.
     */
    uniqueIndex('promotions_one_active_per_space')
      .on(t.spaceId)
      .where(sql`status IN ('scheduled','active')`),

    check('promotions_expires_after_started', sql`${t.expiresAt} > ${t.startedAt}`),
    check(
      'promotions_cancelled_has_timestamp',
      sql`(${t.status} <> 'cancelled') OR (${t.cancelledAt} IS NOT NULL)`,
    ),
  ],
);

/**
 * Assinatura Premium. 1:1 com `profiles` — por isso `userId` e a propria
 * chave primaria, em vez de um `id` proprio (mesmo raciocinio de `profiles`
 * estar ligada 1:1 a `auth.users` pelo mesmo uuid).
 *
 * Separada de `profiles` pelo mesmo motivo de `owner_payout_accounts`: tem
 * ciclo de vida proprio (concedida, cancelada) e vai crescer (plano, data de
 * renovacao) quando a assinatura paga for decidida — nao e um campo a mais
 * no perfil.
 */
export const premiumMemberships = pgTable(
  'premium_memberships',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => profiles.id, { onDelete: 'cascade' }),

    status: premiumMembershipStatus('status').notNull().default('active'),
    source: premiumMembershipSource('source').notNull().default('admin_grant'),

    grantedBy: uuid('granted_by').references(() => profiles.id, { onDelete: 'set null' }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),

    cancelledBy: uuid('cancelled_by').references(() => profiles.id, { onDelete: 'set null' }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('premium_memberships_status_idx').on(t.status),
    check(
      'premium_memberships_cancelled_has_timestamp',
      sql`(${t.status} <> 'cancelled') OR (${t.cancelledAt} IS NOT NULL)`,
    ),
  ],
);

export const promotionsRelations = relations(promotions, ({ one }) => ({
  space: one(spaces, { fields: [promotions.spaceId], references: [spaces.id] }),
  owner: one(profiles, { fields: [promotions.ownerId], references: [profiles.id] }),
}));

export const premiumMembershipsRelations = relations(premiumMemberships, ({ one }) => ({
  user: one(profiles, { fields: [premiumMemberships.userId], references: [profiles.id] }),
}));
