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
import {
  userRole,
  accountStatus,
  payoutAccountStatus,
  identityVerificationStatus,
  phoneVerificationStatus,
} from './enums';

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

    /**
     * Como a pessoa quer aparecer publicamente (Fase 21). Opcional: sem ele,
     * o nome publico e so o primeiro nome de `fullName` — nunca o nome
     * completo, que continua restrito a quem precisa (a propria pessoa, a
     * outra parte de uma reserva, a administracao).
     */
    displayName: text('display_name'),
    /** Nome mostrado em perfil publico, anuncio e avaliacao. Derivado — ninguem escreve nele. */
    publicName: text('public_name').generatedAlwaysAs(
      sql`COALESCE(NULLIF(btrim("display_name"), ''), NULLIF(split_part(btrim(COALESCE("full_name", '')), ' ', 1), ''))`,
    ),
    /** Apresentacao curta no perfil publico. Sem telefone/e-mail/link (checado no servidor). */
    bio: text('bio'),

    /** Telefone em E.164, ex: +5527999998888. Usado em contato pos-reserva. */
    phone: text('phone'),
    /**
     * So o fluxo de verificacao por SMS (src/lib/verification) preenche isto,
     * depois do provedor confirmar o codigo. Trocar `phone` por qualquer outro
     * caminho zera este campo (trigger `guard_profile_verification`).
     */
    phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),

    /**
     * Copia de `auth.users.email_confirmed_at`, mantida por trigger (Fase 21).
     * A fonte da verdade continua sendo o Supabase Auth; isto existe para o
     * selo "E-mail verificado" vir do dado real, e nao de uma suposicao.
     */
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),

    /**
     * Estado da verificacao de identidade — so estrutura (ver enum). O CHECK
     * `profiles_identity_status_matches` amarra `verified` a
     * `document_verified_at`, para os dois nunca contarem historias diferentes.
     */
    identityVerificationStatus: identityVerificationStatus('identity_verification_status')
      .notNull()
      .default('not_started'),

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
    /**
     * Um numero VERIFICADO pertence a uma conta so. Encarece criar contas
     * paralelas para se autoavaliar ou inflar reputacao — numero nao
     * verificado pode repetir (e so contato).
     */
    uniqueIndex('profiles_verified_phone_key')
      .on(t.phone)
      .where(sql`phone_verified_at IS NOT NULL AND deleted_at IS NULL`),
    check(
      'profiles_display_name_length',
      sql`${t.displayName} IS NULL OR char_length(btrim(${t.displayName})) BETWEEN 2 AND 40`,
    ),
    check('profiles_bio_length', sql`${t.bio} IS NULL OR char_length(${t.bio}) <= 500`),
    /** Foto de perfil so pode morar na pasta do proprio usuario no bucket. */
    check(
      'profiles_avatar_path_own_folder',
      sql`${t.avatarPath} IS NULL OR ${t.avatarPath} LIKE (${t.id}::text || '/avatar/%')`,
    ),
    check(
      'profiles_identity_status_matches',
      sql`(${t.identityVerificationStatus} = 'verified') = (${t.documentVerifiedAt} IS NOT NULL)`,
    ),
  ],
);

/**
 * Tentativa de verificacao de telefone por SMS (Fase 21).
 *
 * O CODIGO nunca fica aqui: quem gera, envia, expira e confere e o provedor
 * (Twilio Verify). Esta tabela guarda o que o SERVIDOR precisa saber para
 * nao confiar no navegador — qual numero ESTE usuario pediu para verificar —
 * e o historico para auditoria e limite de tentativas.
 */
export const phoneVerifications = pgTable(
  'phone_verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** E.164, ex: +5527999998888. */
    phone: text('phone').notNull(),
    status: phoneVerificationStatus('status').notNull().default('pending'),
    provider: text('provider').notNull().default('twilio_verify'),
    providerSid: text('provider_sid'),
    checkAttempts: integer('check_attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    /** Uma verificacao em aberto por pessoa — pedir outra cancela a anterior. */
    uniqueIndex('phone_verifications_one_pending_per_user')
      .on(t.userId)
      .where(sql`status = 'pending'`),
    index('phone_verifications_user_created_idx').on(t.userId, t.createdAt),
    check('phone_verifications_phone_e164', sql`${t.phone} ~ '^\\+[1-9][0-9]{7,14}$'`),
    check('phone_verifications_attempts_range', sql`${t.checkAttempts} BETWEEN 0 AND 10`),
    check(
      'phone_verifications_resolved_matches_status',
      sql`(${t.status} = 'pending') = (${t.resolvedAt} IS NULL)`,
    ),
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
