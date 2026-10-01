import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  time,
  jsonb,
  index,
  unique,
  uniqueIndex,
  check,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { spaces } from './spaces';
import { operatingHoursMode, rentalTimeUnit, temporaryPricingMode } from './enums';

/** Um pacote de aluguel temporário: "até `units` (na unidade do grupo) por `priceCents`". */
export type TemporaryPackage = { units: number; priceCents: number };

/**
 * Grupo de unidades de um anúncio (Parte 12) — as unidades que seguem as
 * mesmas regras: "5 vagas rápidas, máximo 1 hora" e "5 vagas prolongadas,
 * máximo 10 horas" são dois grupos do mesmo estacionamento.
 *
 * Todo anúncio tem pelo menos um grupo; para quem aluga uma coisa só, o
 * grupo é invisível (uma unidade, as regras do anúncio).
 *
 * Regras que o banco garante (CHECKs abaixo + trigger
 * `space_unit_groups_guard` na migração 0032, que valida os pacotes):
 * - pelo menos um modo (contínuo e/ou temporário);
 * - contínuo exige preço mensal; temporário exige a regra de tempo completa;
 * - pacotes em ordem, sem duração repetida e sem pacote mais longo mais
 *   barato que um mais curto — nunca duas regras para a mesma duração;
 * - horário diário com abertura antes do fechamento.
 *
 * Preços em centavos, inteiros. `spaces.price_monthly_cents` é mantido pelo
 * banco a partir daqui (o menor preço mensal dos grupos ativos), para a
 * busca e tudo que já existia continuar lendo o mesmo campo.
 */
export const spaceUnitGroups = pgTable(
  'space_unit_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    /** Grupo desativado some do anúncio, mas o histórico das reservas fica. */
    active: boolean('active').notNull().default(true),

    allowsContinuous: boolean('allows_continuous').notNull().default(true),
    allowsTemporary: boolean('allows_temporary').notNull().default(false),

    /** Contínuo: preço por mês. */
    monthlyPriceCents: integer('monthly_price_cents'),

    /** Temporário: como cobra. */
    tempPricingMode: temporaryPricingMode('temp_pricing_mode'),
    /** Temporário: unidade de tempo do preço e da duração máxima. */
    tempUnit: rentalTimeUnit('temp_unit'),
    /** `per_period`: preço por `tempUnit` (ex.: R$ 50 por hora). */
    tempPriceCents: integer('temp_price_cents'),
    /** `per_period`: duração máxima, em `tempUnit` (ex.: 5 horas). */
    tempMaxUnits: integer('temp_max_units'),
    /**
     * `per_period` por dia ou semana: aceita períodos menores com preço
     * proporcional (dia → horas; semana → dias).
     */
    tempAllowFraction: boolean('temp_allow_fraction').notNull().default(false),
    /** `packages`: pacotes em ordem crescente de duração. */
    tempPackages: jsonb('temp_packages').$type<TemporaryPackage[]>(),

    /** O locatário pode renovar na janela de 7 minutos depois do fim. */
    renewalAllowed: boolean('renewal_allowed').notNull().default(true),

    hoursMode: operatingHoursMode('hours_mode').notNull().default('always'),
    /** Horário local de Brasília. */
    opensAt: time('opens_at'),
    closesAt: time('closes_at'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('space_unit_groups_space_idx').on(t.spaceId),
    /** Alvo das chaves compostas: unidade e reserva só apontam para grupo do MESMO anúncio. */
    unique('space_unit_groups_space_id_id_key').on(t.spaceId, t.id),
    uniqueIndex('space_unit_groups_space_name_key').on(t.spaceId, sql`lower(${t.name})`),
    check('space_unit_groups_name_length', sql`char_length(trim(${t.name})) BETWEEN 1 AND 60`),
    check('space_unit_groups_some_mode', sql`${t.allowsContinuous} OR ${t.allowsTemporary}`),
    check(
      'space_unit_groups_continuous_price',
      sql`NOT ${t.allowsContinuous} OR (${t.monthlyPriceCents} IS NOT NULL AND ${t.monthlyPriceCents} BETWEEN 1 AND 100000000)`,
    ),
    check(
      'space_unit_groups_temporary_rule',
      sql`NOT ${t.allowsTemporary} OR (
            ${t.tempPricingMode} IS NOT NULL AND ${t.tempUnit} IS NOT NULL AND (
              (${t.tempPricingMode} = 'per_period'
                AND ${t.tempPriceCents} BETWEEN 1 AND 100000000
                AND ${t.tempMaxUnits} BETWEEN 1 AND 1000)
              OR (${t.tempPricingMode} = 'packages'
                AND jsonb_typeof(${t.tempPackages}) = 'array'
                AND jsonb_array_length(${t.tempPackages}) BETWEEN 1 AND 6)
            )
          )`,
    ),
    /** Proporcional só faz sentido com preço por dia ou semana (por hora já é por hora). */
    check(
      'space_unit_groups_fraction_rule',
      sql`NOT ${t.tempAllowFraction} OR (${t.tempPricingMode} = 'per_period' AND ${t.tempUnit} IN ('day', 'week'))`,
    ),
    /**
     * Com horário de funcionamento, o temporário é por hora: "1 diária" num
     * lugar que abre às 7h e fecha às 21h seria uma regra ambígua.
     */
    check(
      'space_unit_groups_hours_temporary',
      sql`${t.hoursMode} = 'always' OR NOT ${t.allowsTemporary} OR ${t.tempUnit} = 'hour'`,
    ),
    check(
      'space_unit_groups_hours',
      sql`(${t.hoursMode} = 'always' AND ${t.opensAt} IS NULL AND ${t.closesAt} IS NULL)
          OR (${t.hoursMode} = 'daily' AND ${t.opensAt} IS NOT NULL AND ${t.closesAt} IS NOT NULL AND ${t.opensAt} < ${t.closesAt})`,
    ),
  ],
);

/**
 * Unidade alugável (vaga, box, sala…) dentro de um anúncio. Cada uma
 * pertence a um grupo do MESMO anúncio (chave composta). Unidade com
 * histórico de reserva nunca é apagada — fica `active = false`.
 */
export const spaceUnits = pgTable(
  'space_units',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').notNull(),
    label: text('label').notNull(),
    position: integer('position').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'space_units_group_same_space_fk',
      columns: [t.spaceId, t.groupId],
      foreignColumns: [spaceUnitGroups.spaceId, spaceUnitGroups.id],
    }).onDelete('cascade'),
    index('space_units_group_idx').on(t.groupId, t.position),
    index('space_units_space_idx').on(t.spaceId),
    /** Alvos das chaves compostas da reserva: unidade do anúncio e do grupo certos. */
    unique('space_units_space_id_id_key').on(t.spaceId, t.id),
    unique('space_units_group_id_id_key').on(t.groupId, t.id),
    uniqueIndex('space_units_space_label_key').on(t.spaceId, t.label),
    check('space_units_label_length', sql`char_length(trim(${t.label})) BETWEEN 1 AND 40`),
  ],
);

export const spaceUnitGroupsRelations = relations(spaceUnitGroups, ({ one, many }) => ({
  space: one(spaces, { fields: [spaceUnitGroups.spaceId], references: [spaces.id] }),
  units: many(spaceUnits),
}));

export const spaceUnitsRelations = relations(spaceUnits, ({ one }) => ({
  space: one(spaces, { fields: [spaceUnits.spaceId], references: [spaces.id] }),
  group: one(spaceUnitGroups, { fields: [spaceUnits.groupId], references: [spaceUnitGroups.id] }),
}));
