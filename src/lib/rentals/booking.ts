import 'server-only';
import postgres from 'postgres';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLogs, bookings, payments, profiles, renterBillingProfiles, spaces } from '@/db/schema';
import { computeBookingAmounts } from '@/lib/money';
import { settingInt } from '@/lib/settings';
import { isIntegrationConfigured } from '@/lib/env';
import { buildBookingReference } from '@/lib/bookings/reference';
import * as asaas from '@/lib/payments/asaas';
import { saveProfileDocument } from '@/lib/payments/document';
import { getOwnerPayoutAccount, getRenterBillingProfile } from '@/lib/payments/queries';
import { unitNounFor, type UnitNoun } from '@/lib/spaces/types';
import { checkTemporaryRequest, type RentalTimeUnit } from './pricing';
import { getGroupRules } from './queries';
import { brDate } from './time';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Pick<Tx, 'execute'>;

const { PostgresError } = postgres;
type PgError = InstanceType<typeof PostgresError>;

/** O erro do Postgres por trás de um erro do Drizzle (que embrulha em `.cause`). */
export function pgErrorFrom(err: unknown): PgError | null {
  if (err instanceof PostgresError) return err;
  if (err instanceof Error && err.cause instanceof PostgresError) return err.cause;
  return null;
}

/**
 * Trava o anúncio e encerra o que já venceu nele (reserva não paga, aluguel
 * que acabou, pagamento pendente sem pagamento) — sempre antes de procurar
 * unidade livre. Duas pessoas reservando o mesmo anúncio ao mesmo tempo
 * passam por aqui uma de cada vez; e, mesmo que algo escape, a restrição
 * `bookings_unit_no_overlap` do banco recusa a segunda.
 */
export async function lockSpaceAndSweep(tx: Executor, spaceId: string): Promise<void> {
  await tx.execute(sql`SELECT 1 FROM spaces WHERE id = ${spaceId} FOR UPDATE`);
  await tx.execute(sql`SELECT public.release_expired_rentals(${spaceId})`);
}

/**
 * Primeira unidade ativa do grupo sem nenhuma reserva vigente cruzando o
 * intervalo pedido. `occupiedUntil` NULL = sem fim (aluguel contínuo).
 */
export async function findFreeUnit(
  tx: Executor,
  groupId: string,
  startsAt: Date,
  occupiedUntil: Date | null,
): Promise<{ id: string; label: string } | null> {
  const [livre] = (await tx.execute(sql`
    SELECT u.id, u.label FROM space_units u
      JOIN space_unit_groups g ON g.id = u.group_id AND g.active
     WHERE u.group_id = ${groupId} AND u.active
       AND NOT EXISTS (
         SELECT 1 FROM bookings b
          WHERE b.unit_id = u.id
            AND b.status IN ('approved', 'awaiting_payment', 'active', 'past_due')
            AND tstzrange(b.starts_at, b.occupied_until, '[)')
                && tstzrange(${startsAt.toISOString()}::timestamptz, ${occupiedUntil ? occupiedUntil.toISOString() : null}::timestamptz, '[)')
       )
     ORDER BY u.position, u.label
     LIMIT 1
  `)) as unknown as { id: string; label: string }[];
  return livre ?? null;
}

/** Recusa do banco ao gravar uma reserva, em texto para quem está alugando. */
export function rentalRuleMessage(err: unknown, noun: UnitNoun): string | null {
  const pg = pgErrorFrom(err);
  if (!pg) return null;
  if (pg.code === '40P01') return 'Muita gente reservando ao mesmo tempo. Tente de novo em instantes.';
  switch (pg.constraint_name) {
    case 'bookings_unit_no_overlap':
      return `Essa ${noun.singular} acabou de ser reservada para esse horário. Escolha outro horário.`;
    case 'bookings_operating_hours':
      return 'Esse horário fica fora do funcionamento do espaço.';
    case 'bookings_temporary_window':
      return 'Escolha um horário a partir de agora, dentro do prazo de antecedência do anúncio.';
    case 'bookings_temporary_minimum':
      return 'O valor ficou abaixo do mínimo por aluguel. Escolha uma duração maior.';
    case 'bookings_rent_matches_group':
      return 'O preço deste anúncio mudou agora há pouco. Confira o novo valor e tente de novo.';
    case 'bookings_temporary_rules':
      return 'Essa duração não vale mais para este anúncio. Confira as opções e tente de novo.';
    case 'bookings_period_not_blocked':
      return 'O proprietário bloqueou essas datas no calendário do anúncio.';
    case 'bookings_renewal_rules':
      return 'Não dá mais para renovar este aluguel: a janela de renovação terminou.';
    case 'bookings_one_live_renewal':
      return 'Este aluguel já foi renovado.';
    default:
      return null;
  }
}

export type TemporaryBookingInput = {
  renterId: string;
  spaceId: string;
  groupId: string;
  startsAt: Date;
  units: number;
  unit: RentalTimeUnit;
  /** Chave do formulário: o mesmo envio repetido devolve a mesma reserva. */
  idempotencyKey: string | null;
  /** Renovação: a reserva que esta continua (mesma unidade, começa no fim dela). */
  renewedFromId?: string | null;
};

export type TemporaryBookingResult =
  | { ok: true; bookingId: string; reused: boolean }
  | { ok: false; message: string };

async function currentFees() {
  const [renterFeeBps, ownerFeeBps] = await Promise.all([
    settingInt('fees.renter_fee_bps', 300),
    settingInt('fees.owner_fee_bps', 300),
  ]);
  return { renterFeeBps, ownerFeeBps };
}

/**
 * Cria uma reserva temporária aguardando pagamento (Parte 12).
 *
 * Tudo que vale vem do servidor: o preço sai das regras do grupo (e o banco
 * confere de novo), a unidade é escolhida aqui, o prazo para pagar usa o
 * relógio do banco. O navegador manda só o anúncio, o grupo, o início e a
 * duração.
 */
export async function createTemporaryBooking(input: TemporaryBookingInput): Promise<TemporaryBookingResult> {
  if (!isIntegrationConfigured('payments')) {
    return { ok: false, message: 'Os pagamentos ainda não estão ativos nesta plataforma. Nenhuma reserva foi criada.' };
  }

  const [space] = await db
    .select({ id: spaces.id, ownerId: spaces.ownerId, status: spaces.status, type: spaces.type, deletedAt: spaces.deletedAt })
    .from(spaces)
    .where(eq(spaces.id, input.spaceId))
    .limit(1);
  if (!space || space.deletedAt || (space.status !== 'published' && space.status !== 'rented')) {
    return { ok: false, message: 'Este espaço não está disponível para reserva agora.' };
  }
  if (space.ownerId === input.renterId) return { ok: false, message: 'Você não pode alugar o próprio espaço.' };
  const noun = unitNounFor(space.type);

  // Mesmo envio repetido (duplo clique, botão voltar): a mesma reserva.
  if (input.idempotencyKey) {
    const [existente] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.renterId, input.renterId), eq(bookings.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    if (existente) return { ok: true, bookingId: existente.id, reused: true };
  }

  const grupo = await getGroupRules(input.spaceId, input.groupId);
  if (!grupo) return { ok: false, message: 'Esse grupo não existe mais neste anúncio. Recarregue a página.' };

  const conta = await getOwnerPayoutAccount(space.ownerId);
  if (!conta?.canReceive || !conta.providerWalletId) {
    return { ok: false, message: 'O proprietário ainda não configurou o recebimento. A reserva por tempo fica disponível assim que ele configurar.' };
  }

  const [minCharge, maxAdvanceDays, holdMinutes, fees] = await Promise.all([
    settingInt('booking.min_rent_cents', 3500),
    settingInt('rental.max_advance_days', 30),
    settingInt('rental.hold_minutes', 15),
    currentFees(),
  ]);

  const conferido = checkTemporaryRequest(
    grupo.rules,
    { startsAt: input.startsAt, units: input.units, unit: input.unit },
    { now: new Date(), minChargeCents: minCharge, maxAdvanceDays, isRenewal: Boolean(input.renewedFromId) },
  );
  if (!conferido.ok) return { ok: false, message: conferido.message };

  let valores;
  try {
    valores = computeBookingAmounts(conferido.rentCents, fees);
  } catch {
    return { ok: false, message: 'Não foi possível calcular os valores agora. Tente de novo.' };
  }

  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const resultado = await db.transaction(async (tx): Promise<TemporaryBookingResult> => {
        await lockSpaceAndSweep(tx, input.spaceId);

        let unitId: string;
        if (input.renewedFromId) {
          const [anterior] = await tx
            .select({
              id: bookings.id, renterId: bookings.renterId, unitId: bookings.unitId, groupId: bookings.groupId,
              status: bookings.status, kind: bookings.kind, endsAt: bookings.endsAt, renewalAllowed: bookings.renewalAllowed,
            })
            .from(bookings)
            .where(eq(bookings.id, input.renewedFromId))
            .for('update')
            .limit(1);
          if (
            !anterior || anterior.renterId !== input.renterId || anterior.kind !== 'temporary'
            || anterior.status !== 'active' || !anterior.renewalAllowed || !anterior.unitId
            || anterior.groupId !== input.groupId || anterior.endsAt?.getTime() !== input.startsAt.getTime()
          ) {
            return { ok: false, message: 'Não dá mais para renovar este aluguel.' };
          }
          // A proteção pós-fim da anterior encolhe para o fim exato: a
          // renovação ocupa a unidade a partir dali, sem buraco e sem sobrepor.
          await tx.update(bookings).set({ occupiedUntil: anterior.endsAt, updatedAt: new Date() }).where(eq(bookings.id, anterior.id));
          unitId = anterior.unitId;
        } else {
          const livre = await findFreeUnit(tx, input.groupId, input.startsAt, conferido.occupiedUntil);
          if (!livre) {
            return { ok: false, message: `Não há ${noun.singular} livre nesse horário. Tente outro horário${grupo.name === 'Padrão' ? '' : ' ou outro grupo'}.` };
          }
          unitId = livre.id;
        }

        const [nova] = await tx
          .insert(bookings)
          .values({
            reference: buildBookingReference(),
            spaceId: input.spaceId,
            renterId: input.renterId,
            ownerId: space.ownerId,
            status: 'awaiting_payment',
            kind: 'temporary',
            groupId: input.groupId,
            unitId,
            startsAt: input.startsAt,
            endsAt: conferido.endsAt,
            occupiedUntil: conferido.occupiedUntil,
            durationUnits: input.units,
            durationUnit: input.unit,
            renewedFromId: input.renewedFromId ?? null,
            idempotencyKey: input.idempotencyKey,
            // Prazo para pagar pelo relógio do banco, não do servidor da aplicação.
            holdExpiresAt: sql`now() + make_interval(mins => ${holdMinutes})`,
            // start_date/end_date são derivados pelo banco (trigger) a partir do horário exato.
            startDate: brDate(input.startsAt),
            monthlyRentCents: valores.monthlyRentCents,
            renterFeeBps: valores.renterFeeBps,
            ownerFeeBps: valores.ownerFeeBps,
            renterFeeCents: valores.renterFeeCents,
            ownerFeeCents: valores.ownerFeeCents,
            totalChargedCents: valores.totalChargedCents,
            ownerPayoutCents: valores.ownerPayoutCents,
            termsSnapshot: { group: grupo.name, rules: grupo.rules, renterFeeBps: fees.renterFeeBps, ownerFeeBps: fees.ownerFeeBps },
          })
          .returning({ id: bookings.id });

        await tx.insert(auditLogs).values({
          actorId: input.renterId, actorRole: 'user', action: input.renewedFromId ? 'booking.temporary_renewed' : 'booking.temporary_created',
          entityType: 'booking', entityId: nova!.id,
          metadata: { spaceId: input.spaceId, groupId: input.groupId, unitId, units: input.units, unit: input.unit, rentCents: valores.monthlyRentCents, renewedFromId: input.renewedFromId ?? null },
        });
        return { ok: true, bookingId: nova!.id, reused: false };
      });
      return resultado;
    } catch (err) {
      const pg = pgErrorFrom(err);
      if (pg?.code === '23505' && pg.constraint_name === 'bookings_reference_key') continue;
      if (pg?.code === '23505' && pg.constraint_name === 'bookings_renter_idempotency_key' && input.idempotencyKey) {
        const [existente] = await db
          .select({ id: bookings.id })
          .from(bookings)
          .where(and(eq(bookings.renterId, input.renterId), eq(bookings.idempotencyKey, input.idempotencyKey)))
          .limit(1);
        if (existente) return { ok: true, bookingId: existente.id, reused: true };
      }
      const mensagem = rentalRuleMessage(err, noun);
      if (mensagem) return { ok: false, message: mensagem };
      throw err;
    }
  }
  return { ok: false, message: 'Não foi possível registrar a reserva. Tente de novo.' };
}

/** Garante o cliente do Asaas de quem paga (cria na primeira vez, com o CPF informado). */
export async function ensureAsaasCustomer(user: { id: string; email: string; fullName: string | null }, cpfCnpj: string | null) {
  const existente = await getRenterBillingProfile(user.id);
  if (existente) return { ok: true as const, customerId: existente.providerCustomerId };
  if (!cpfCnpj) return { ok: false as const, needsCpf: true, message: 'Informe seu CPF para gerar a cobrança.' };

  const documento = await saveProfileDocument(user.id, cpfCnpj);
  if (!documento.ok) return { ok: false as const, needsCpf: true, message: documento.message };
  const [perfil] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  let cliente: asaas.AsaasCustomer;
  try {
    cliente = await asaas.createCustomer({
      name: perfil?.fullName ?? user.fullName ?? 'Locatário',
      cpfCnpj,
      email: user.email,
      mobilePhone: perfil?.phone ?? undefined,
      externalReference: user.id,
    });
  } catch (err) {
    if (err instanceof asaas.AsaasError) {
      console.error('[aluguel] Asaas recusou a criação do cliente:', err.status, err.body);
      return { ok: false as const, needsCpf: false, message: `O Asaas recusou seus dados: ${err.message}` };
    }
    throw err;
  }
  await db
    .insert(renterBillingProfiles)
    .values({ userId: user.id, provider: 'asaas', providerCustomerId: cliente.id })
    .onConflictDoNothing();
  const salvo = await getRenterBillingProfile(user.id);
  return { ok: true as const, customerId: salvo?.providerCustomerId ?? cliente.id };
}

/**
 * Desfaz uma reserva temporária que nasceu mas não chegou a ter cobrança
 * (o cliente do Asaas não pôde ser criado): a unidade volta a ficar livre na
 * hora e nada fica "meio criado". Reserva com cobrança nunca é apagada.
 */
export async function discardUnchargedBooking(bookingId: string, renterId: string, motivo: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [cobranca] = await tx.select({ id: payments.id }).from(payments).where(eq(payments.bookingId, bookingId)).limit(1);
    if (cobranca) return;
    const apagadas = await tx
      .delete(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.renterId, renterId), eq(bookings.status, 'awaiting_payment')))
      .returning({ reference: bookings.reference });
    if (apagadas.length > 0) {
      await tx.insert(auditLogs).values({
        actorId: renterId, actorRole: 'user', action: 'booking.temporary_discarded',
        entityType: 'booking', entityId: bookingId, metadata: { reference: apagadas[0]!.reference, motivo },
      });
    }
  });
}

/** Prazo do QR do Asaas ("2026-10-02 23:59:59", hora de Brasília) → instante. */
function pixExpiration(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(raw);
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2]}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Gera a cobrança REAL de uma reserva temporária no Asaas: avulsa, em Pix
 * (QR mostrado no próprio app), com split para o proprietário. Se o gateway
 * recusar, a reserva some (a unidade volta a ficar livre) e a pessoa vê o
 * motivo — nada fica "meio criado" nem finge que foi cobrado.
 */
export async function chargeTemporaryBooking(
  bookingId: string,
  customerId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking || booking.kind !== 'temporary') return { ok: false, message: 'Reserva não encontrada.' };

  const [jaCobrada] = await db.select({ id: payments.id }).from(payments).where(eq(payments.bookingId, bookingId)).limit(1);
  if (jaCobrada) return { ok: true };

  const desfazer = async (motivo: string) => {
    await db.transaction(async (tx) => {
      await tx.insert(auditLogs).values({
        actorId: booking.renterId, actorRole: 'user', action: 'booking.temporary_charge_failed',
        entityType: 'booking', entityId: booking.id, metadata: { reference: booking.reference, motivo },
      });
      await tx.delete(bookings).where(and(eq(bookings.id, booking.id), eq(bookings.status, 'awaiting_payment')));
    });
  };

  const conta = await getOwnerPayoutAccount(booking.ownerId);
  if (!conta?.providerWalletId) {
    await desfazer('proprietario_sem_recebimento');
    return { ok: false, message: 'O proprietário ainda não configurou o recebimento. Nada foi cobrado.' };
  }

  let cobranca: asaas.AsaasPayment;
  try {
    cobranca = await asaas.createPayment({
      customer: customerId,
      billingType: 'PIX',
      value: booking.totalChargedCents / 100,
      dueDate: brDate(new Date()),
      description: `MyPlace — ${booking.reference}`,
      externalReference: booking.reference,
      split: asaas.splitForOwner(conta.providerWalletId, booking.ownerPayoutCents),
    });
  } catch (err) {
    if (err instanceof asaas.AsaasError) {
      console.error('[aluguel] Asaas recusou a cobrança:', err.status, err.body);
      await desfazer(`asaas_${err.status}`);
      return { ok: false, message: `Não foi possível gerar a cobrança: ${err.message}. Nada foi cobrado.` };
    }
    throw err;
  }

  // O QR vem do próprio Asaas. Se não vier (ex.: conta sem chave Pix), a
  // cobrança continua valendo pela fatura do Asaas — a tela mostra o link.
  let qr: asaas.AsaasPixQrCode | null = null;
  try {
    qr = await asaas.getPixQrCode(cobranca.id);
  } catch (err) {
    console.error('[aluguel] QR Code Pix indisponível para a cobrança', cobranca.id, err instanceof asaas.AsaasError ? err.body : err);
  }

  await db.insert(payments).values({
    bookingId: booking.id,
    provider: 'asaas',
    providerPaymentId: cobranca.id,
    status: 'pending',
    method: 'pix',
    amountCents: booking.totalChargedCents,
    dueDate: brDate(new Date()),
    invoiceUrl: cobranca.invoiceUrl,
    pixPayload: qr?.payload ?? null,
    pixQrImage: qr?.encodedImage ?? null,
    pixExpiresAt: pixExpiration(qr?.expirationDate),
  });
  return { ok: true };
}
