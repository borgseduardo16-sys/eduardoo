import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import {
  spaceStatus,
  waitlistStatus,
  savedSearchStatus,
  availabilityBlockReason,
  listingSuggestionStatus,
} from './enums';
import { profiles } from './users';
import { spaces } from './spaces';

/*
 * Fase 23 — descoberta, disponibilidade, acompanhamento de preço,
 * desempenho e melhoria de anúncio.
 *
 * Nenhuma destas tabelas é lida pelo navegador: todas têm RLS ligada e
 * nenhuma policy (ver drizzle/0026_*.sql). Quem lê e escreve é o servidor,
 * que decide o que cada pessoa pode ver.
 */

/**
 * Histórico de preço do anúncio. Append-only: a trigger
 * `space_price_history_immutable` recusa UPDATE e DELETE (o DELETE só passa
 * quando o próprio anúncio foi apagado, em cascata).
 *
 * Quem grava é a trigger `spaces_record_price_change`, não o código da
 * aplicação: nenhum caminho de alteração de preço — etapa do formulário,
 * UPDATE manual no painel, um bug numa action nova — consegue mudar o preço
 * sem deixar registro.
 *
 * Só registra mudanças DEPOIS da primeira publicação. Antes disso o preço
 * não era público (e o rascunho começa com um valor provisório exigido pelo
 * CHECK do banco): gravar essas mudanças seria criar histórico artificial.
 */
export const spacePriceHistory = pgTable(
  'space_price_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    oldPriceCents: integer('old_price_cents').notNull(),
    newPriceCents: integer('new_price_cents').notNull(),
    /**
     * Quem mudou, lido de `myplace.actor_id` (definido pelo servidor na
     * mesma transação do UPDATE). NULL = alteração fora do app (SQL manual).
     * Nunca aparece para o público.
     */
    changedBy: uuid('changed_by').references(() => profiles.id, { onDelete: 'set null' }),
    /** Status do anúncio no momento — o histórico público mostra só o que era visível. */
    spaceStatus: spaceStatus('space_status').notNull(),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('space_price_history_space_idx').on(t.spaceId, t.changedAt),
    check('space_price_history_prices_positive', sql`${t.oldPriceCents} > 0 AND ${t.newPriceCents} > 0`),
    check('space_price_history_real_change', sql`${t.oldPriceCents} <> ${t.newPriceCents}`),
  ],
);

/**
 * Lista de espera de um espaço indisponível (alugado ou pausado).
 *
 * Uma pessoa tem no máximo UMA entrada `waiting` por espaço (índice único
 * parcial) — clicar duas vezes, ou em duas abas, não cria duas. Sair e
 * entrar de novo é permitido: a entrada antiga fica como `left`.
 *
 * Nada aqui reserva o espaço. Quando ele volta a ficar disponível, quem
 * está esperando é avisado e segue o fluxo normal de solicitação.
 */
export const waitlistEntries = pgTable(
  'waitlist_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    status: waitlistStatus('status').notNull().default('waiting'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('waitlist_entries_one_waiting_per_user_space')
      .on(t.userId, t.spaceId)
      .where(sql`status = 'waiting'`),
    index('waitlist_entries_space_status_idx').on(t.spaceId, t.status),
    index('waitlist_entries_user_joined_idx').on(t.userId, t.joinedAt),
    /** Cada estado final tem a data correspondente — nunca um sem o outro. */
    check(
      'waitlist_entries_status_dates',
      sql`(${t.status} = 'left') = (${t.leftAt} IS NOT NULL)
          AND (${t.status} = 'notified') = (${t.notifiedAt} IS NOT NULL)
          AND (${t.status} = 'closed') = (${t.closedAt} IS NOT NULL)`,
    ),
  ],
);

/**
 * Bloqueio manual de datas pelo proprietário (manutenção, uso próprio...).
 *
 * Datas inclusivas nas duas pontas. O motivo e a anotação são privados: o
 * público vê só "indisponível". As triggers da migração 0026 garantem, com
 * trava por espaço (sem corrida entre duas abas), que um bloqueio nunca
 * cobre uma reserva vigente e que uma reserva nunca é aceita por cima de um
 * bloqueio.
 */
export const spaceAvailabilityBlocks = pgTable(
  'space_availability_blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    reason: availabilityBlockReason('reason').notNull(),
    /** Anotação livre do proprietário, só para ele. */
    note: text('note'),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Bloqueio desfeito continua registrado — não some da história do espaço. */
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (t) => [
    index('space_availability_blocks_space_idx').on(t.spaceId, t.startsOn),
    check('space_availability_blocks_dates_ordered', sql`${t.endsOn} >= ${t.startsOn}`),
    /** Um ano no máximo: bloqueio "para sempre" é pausar o anúncio, não bloquear datas. */
    check('space_availability_blocks_max_length', sql`${t.endsOn} - ${t.startsOn} <= 366`),
    check('space_availability_blocks_note_length', sql`${t.note} IS NULL OR char_length(${t.note}) <= 200`),
  ],
);

/**
 * Alerta de busca salva ("Garagem coberta no Centro até R$ 300").
 *
 * `criteria` é validado no servidor (src/lib/alerts/criteria.ts) antes de
 * gravar: só chaves conhecidas, tipos do catálogo, características que
 * existem. O texto livre que a pessoa digitou numa busca por necessidade
 * NÃO é guardado — só os critérios estruturados que saíram dele.
 */
export const savedSearches = pgTable(
  'saved_searches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** Resumo legível gerado pelo servidor a partir dos critérios. */
    label: text('label').notNull(),
    criteria: jsonb('criteria').$type<Record<string, unknown>>().notNull(),
    /**
     * Forma canônica dos critérios (src/lib/alerts/criteria.ts). O índice
     * único com `user_id` impede o mesmo alerta duas vezes — inclusive no
     * duplo clique, que uma checagem só no código deixaria passar.
     */
    criteriaKey: text('criteria_key').notNull(),
    status: savedSearchStatus('status').notNull().default('active'),
    lastNotifiedAt: timestamp('last_notified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('saved_searches_user_idx').on(t.userId, t.createdAt),
    index('saved_searches_status_idx').on(t.status),
    uniqueIndex('saved_searches_user_criteria_key').on(t.userId, t.criteriaKey),
    check('saved_searches_label_length', sql`char_length(${t.label}) BETWEEN 1 AND 160`),
    check('saved_searches_criteria_object', sql`jsonb_typeof(${t.criteria}) = 'object'`),
  ],
);

/**
 * Anúncio novo que atendeu a um alerta. A chave (alerta, espaço) é o que
 * garante que o mesmo anúncio nunca é avisado duas vezes para o mesmo
 * alerta, e `notified_at` NULL é a fila do agrupamento ("Encontramos 4
 * novos espaços..."), esvaziada na publicação seguinte ou pelo cron diário.
 */
export const savedSearchMatches = pgTable(
  'saved_search_matches',
  {
    savedSearchId: uuid('saved_search_id')
      .notNull()
      .references(() => savedSearches.id, { onDelete: 'cascade' }),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    matchedAt: timestamp('matched_at', { withTimezone: true }).notNull().defaultNow(),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.savedSearchId, t.spaceId] }),
    index('saved_search_matches_pending_idx').on(t.savedSearchId, t.notifiedAt),
    index('saved_search_matches_space_idx').on(t.spaceId),
  ],
);

/** O que a IA devolveu, já filtrado pela guarda de fatos. */
export type ListingSuggestionContent = {
  title: string | null;
  description: string | null;
  /** "Considere informar se o espaço possui câmeras." */
  missingInfo: { field: string; text: string }[];
  tips: string[];
};

/**
 * Sugestão de melhoria de anúncio (IA). Cada pedido vira uma linha — é ela
 * que o limite de uso conta, e é o texto guardado AQUI (não o que o
 * navegador mandar) que o servidor aplica quando o proprietário aceita.
 */
export const listingSuggestions = pgTable(
  'listing_suggestions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    status: listingSuggestionStatus('status').notNull(),
    model: text('model'),
    /** Título, descrição e características no momento do pedido. */
    inputSnapshot: jsonb('input_snapshot').$type<Record<string, unknown>>().notNull(),
    suggestion: jsonb('suggestion').$type<ListingSuggestionContent>(),
    /** O que a guarda de fatos retirou da resposta da IA, para auditoria. */
    removedClaims: jsonb('removed_claims').$type<string[]>(),
    appliedFields: text('applied_fields').array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [
    index('listing_suggestions_owner_idx').on(t.ownerId, t.createdAt),
    index('listing_suggestions_space_idx').on(t.spaceId, t.createdAt),
  ],
);

/**
 * Visualizações e compartilhamentos por anúncio e dia — SÓ contadores.
 *
 * Nenhuma linha identifica quem viu: não há usuário, IP, cidade ou horário
 * de visitante aqui. O proprietário recebe "128 visualizações", nunca
 * "fulano viu às 14:32". O dia é o de São Paulo.
 */
export const spaceDailyStats = pgTable(
  'space_daily_stats',
  {
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    views: integer('views').notNull().default(0),
    shares: integer('shares').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.day] }),
    check('space_daily_stats_non_negative', sql`${t.views} >= 0 AND ${t.shares} >= 0`),
  ],
);

/**
 * Contador diário de chamadas de IA por funcionalidade — controle de custo
 * que vale entre todas as instâncias do app (o limitador em memória não
 * valeria em serverless). Sem dado de quem chamou.
 */
export const aiUsageCounters = pgTable(
  'ai_usage_counters',
  {
    day: date('day').notNull(),
    feature: text('feature').notNull(),
    calls: integer('calls').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.day, t.feature] }),
    check('ai_usage_counters_calls_non_negative', sql`${t.calls} >= 0`),
  ],
);

export const spacePriceHistoryRelations = relations(spacePriceHistory, ({ one }) => ({
  space: one(spaces, { fields: [spacePriceHistory.spaceId], references: [spaces.id] }),
}));

export const waitlistEntriesRelations = relations(waitlistEntries, ({ one }) => ({
  user: one(profiles, { fields: [waitlistEntries.userId], references: [profiles.id] }),
  space: one(spaces, { fields: [waitlistEntries.spaceId], references: [spaces.id] }),
}));

export const savedSearchesRelations = relations(savedSearches, ({ one, many }) => ({
  user: one(profiles, { fields: [savedSearches.userId], references: [profiles.id] }),
  matches: many(savedSearchMatches),
}));

export const savedSearchMatchesRelations = relations(savedSearchMatches, ({ one }) => ({
  savedSearch: one(savedSearches, { fields: [savedSearchMatches.savedSearchId], references: [savedSearches.id] }),
  space: one(spaces, { fields: [savedSearchMatches.spaceId], references: [spaces.id] }),
}));
