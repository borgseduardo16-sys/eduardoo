import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  primaryKey,
  check,
  integer,
  jsonb,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { userRole, accountStatus, payoutAccountStatus } from './enums';

/** Indice unico parcial: ignora linhas com NULL (varios perfis sem CPF coexistem). */
function sqlNotNull(column: string) {
  return sql.raw(`${column} IS NOT NULL`);
}

/**
 * Perfil publico/aplicacional do usuario.
 *
 * A identidade (email, senha, tokens) vive em `auth.users`, gerenciada pelo
 * Supabase Auth — nos NUNCA guardamos senha. Esta tabela e o lado da aplicacao,
 * ligada 1:1 pelo mesmo id, criada por trigger quando o usuario se cadastra.
 */
export const profiles = pgTable(
  'profiles',
  {
    /** Mesmo UUID de auth.users. FK criada na migracao (Drizzle nao enxerga o schema auth). */
    id: uuid('id').primaryKey(),

    fullName: text('full_name'),
    /** Telefone em E.164, ex: +5527999998888. Usado em contato pos-reserva. */
    phone: text('phone'),
    phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),

    /** Caminho no bucket de avatares (nao URL — a URL assinada e gerada na hora). */
    avatarPath: text('avatar_path'),

    /** Cidade onde a pessoa esta. Usada para pre-preencher busca e anuncio. */
    city: text('city'),
    state: text('state'),

    /**
     * CPF/CNPJ apenas digitos. Obrigatorio somente para receber dinheiro (KYC do gateway).
     * Dado pessoal sensivel sob LGPD: nunca exposto em API publica.
     */
    cpfCnpj: text('cpf_cnpj'),

    role: userRole('role').notNull().default('user'),
    status: accountStatus('status').notNull().default('active'),

    /** Motivo do bloqueio, preenchido pelo admin. Aparece para o usuario. */
    statusReason: text('status_reason'),

    acceptedTermsAt: timestamp('accepted_terms_at', { withTimezone: true }),
    acceptedTermsVersion: text('accepted_terms_version'),

    /**
     * Denuncias contra esta pessoa que a moderacao julgou procedentes.
     * Mantido por trigger quando uma denuncia e resolvida como `upheld`.
     * Fica denormalizado porque a politica de suspensao precisa consultar isso
     * a cada acao sensivel, e nao da para varrer a tabela de denuncias sempre.
     */
    upheldReportCount: integer('upheld_report_count').notNull().default(0),

    /**
     * Documento conferido (CPF/CNPJ validado pelo gateway no KYC).
     * Diferente de `cpfCnpj`, que e so o numero informado: aqui significa que
     * alguem de fora confirmou que o documento pertence a esta pessoa.
     */
    documentVerifiedAt: timestamp('document_verified_at', { withTimezone: true }),

    /**
     * Locacoes concluidas, contando os dois lados (alugou e foi alugado).
     * Mantido por trigger quando uma reserva chega a 'ended'.
     *
     * Este numero e a razao economica para ficar na plataforma: reputacao
     * construida aqui nao acompanha ninguem para fora. Denormalizado porque
     * aparece em toda listagem de anuncio.
     */
    completedBookingsCount: integer('completed_bookings_count').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('profiles_role_idx').on(t.role),
    index('profiles_status_idx').on(t.status),
    uniqueIndex('profiles_cpf_cnpj_key').on(t.cpfCnpj).where(sqlNotNull('cpf_cnpj')),
  ],
);

/**
 * Conta de recebimento do proprietario no gateway (subconta Asaas).
 *
 * Separada de `profiles` de proposito: sao dados financeiros/KYC, com ciclo de
 * vida e permissoes proprios. A plataforma NAO custodia dinheiro — quem
 * custodia e a instituicao de pagamento. Aqui guardamos apenas as referencias.
 */
export const ownerPayoutAccounts = pgTable(
  'owner_payout_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),

    provider: text('provider').notNull().default('asaas'),

    /** Id da subconta no gateway. */
    providerAccountId: text('provider_account_id'),
    /** Carteira destino do split. Sem isso, nao ha repasse possivel. */
    providerWalletId: text('provider_wallet_id'),

    status: payoutAccountStatus('status').notNull().default('not_started'),
    /** Pendencias de KYC devolvidas pelo gateway, para mostrar ao proprietario. */
    statusDetails: jsonb('status_details').$type<Record<string, unknown>>(),

    /** Link de onboarding/envio de documentos gerado pelo gateway. */
    onboardingUrl: text('onboarding_url'),
    onboardingUrlExpiresAt: timestamp('onboarding_url_expires_at', { withTimezone: true }),

    /** So e seguro cobrar/repassar quando o gateway aprova o KYC. */
    canReceive: boolean('can_receive').notNull().default(false),

    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('owner_payout_accounts_owner_provider_key').on(t.ownerId, t.provider),
    uniqueIndex('owner_payout_accounts_wallet_key').on(t.providerWalletId),
    index('owner_payout_accounts_status_idx').on(t.status),
  ],
);

/**
 * Cliente do usuario no gateway (lado pagador). Necessario para criar cobrancas.
 */
export const renterBillingProfiles = pgTable(
  'renter_billing_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull().default('asaas'),
    providerCustomerId: text('provider_customer_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('renter_billing_profiles_user_provider_key').on(t.userId, t.provider),
    uniqueIndex('renter_billing_profiles_customer_key').on(t.provider, t.providerCustomerId),
  ],
);


/**
 * Bloqueio entre usuarios.
 *
 * Bloquear e a ferramenta que a pessoa usa sozinha, sem depender de moderacao:
 * quem incomoda para de conseguir falar com ela ou reservar o espaco dela, na
 * hora, sem precisar provar nada a ninguem.
 *
 * O efeito e MUTUO de proposito. Se A bloqueia B, nenhum dos dois inicia
 * conversa ou reserva com o outro — caso contrario o bloqueio viraria um
 * aviso de que a pessoa te bloqueou, e uma forma de contornar por outro lado.
 *
 * Nao e apagado quando uma denuncia e resolvida: a decisao de quem a pessoa
 * quer ou nao encontrar continua sendo dela.
 */
export const userBlocks = pgTable(
  'user_blocks',
  {
    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** Anotacao privada de quem bloqueou. O bloqueado nunca ve. */
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    index('user_blocks_blocked_idx').on(t.blockedId),
    check('user_blocks_distinct', sql`${t.blockerId} <> ${t.blockedId}`),
    check('user_blocks_reason_max', sql`${t.reason} IS NULL OR length(${t.reason}) <= 500`),
  ],
);

export const profilesRelations = relations(profiles, ({ one }) => ({
  payoutAccount: one(ownerPayoutAccounts, {
    fields: [profiles.id],
    references: [ownerPayoutAccounts.ownerId],
  }),
  billingProfile: one(renterBillingProfiles, {
    fields: [profiles.id],
    references: [renterBillingProfiles.userId],
  }),
}));
