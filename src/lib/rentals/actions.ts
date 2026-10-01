'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { bookings, payments, auditLogs } from '@/db/schema';
import { requireUserOrThrow } from '@/lib/auth/dal';
import { onlyDigits, isValidCpf, isValidCnpj } from '@/lib/safety/documents';
import * as asaas from '@/lib/payments/asaas';
import { getRenterBillingProfile } from '@/lib/payments/queries';
import { chargeTemporaryBooking, createTemporaryBooking, discardUnchargedBooking, ensureAsaasCustomer } from './booking';
import { RENEWAL_WINDOW_MINUTES, type RentalTimeUnit } from './pricing';
import { brInstant } from './time';

export type RentalActionState = { ok: boolean; message?: string; needsCpf?: boolean };

const UUID = z.string().uuid();
const DURACAO = /^(\d{1,4}):(hour|day|week)$/;

function lerDuracao(v: FormDataEntryValue | null): { units: number; unit: RentalTimeUnit } | null {
  const m = DURACAO.exec(String(v ?? ''));
  if (!m) return null;
  return { units: Number(m[1]), unit: m[2] as RentalTimeUnit };
}

function lerCpf(v: FormDataEntryValue | null): string | null | 'invalido' {
  const bruto = String(v ?? '').trim();
  if (!bruto) return null;
  const d = onlyDigits(bruto);
  if (d.length === 11 ? isValidCpf(d) : d.length === 14 ? isValidCnpj(d) : false) return d;
  return 'invalido';
}

/**
 * Reserva temporária (Parte 12): cria a reserva aguardando pagamento e a
 * cobrança Pix real no Asaas, e leva a pessoa para a tela de pagamento.
 *
 * O navegador manda o anúncio, o grupo, o início e a duração escolhida
 * entre as opções que o servidor mostrou — nunca preço. A chave do
 * formulário (`idempotencyKey`) faz o duplo clique devolver a MESMA reserva.
 */
export async function reserveTemporaryAction(
  _prev: RentalActionState | undefined,
  formData: FormData,
): Promise<RentalActionState> {
  const user = await requireUserOrThrow();

  const spaceId = UUID.safeParse(formData.get('spaceId'));
  const groupId = UUID.safeParse(formData.get('groupId'));
  const chave = UUID.safeParse(formData.get('idempotencyKey'));
  const duracao = lerDuracao(formData.get('duration'));
  if (!spaceId.success || !groupId.success || !chave.success) return { ok: false, message: 'Recarregue a página e tente de novo.' };
  if (!duracao) return { ok: false, message: 'Escolha a duração.' };

  const quando = String(formData.get('start') ?? 'now');
  let startsAt: Date;
  if (quando === 'now') {
    // "Agora" = este minuto, pelo relógio do servidor (nunca o do aparelho).
    startsAt = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  } else {
    const data = String(formData.get('date') ?? '');
    const hora = String(formData.get('time') ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(hora)) {
      return { ok: false, message: 'Escolha o dia e o horário de início.' };
    }
    startsAt = brInstant(data, hora);
  }

  const cpf = lerCpf(formData.get('cpfCnpj'));
  if (cpf === 'invalido') return { ok: false, needsCpf: true, message: 'CPF/CNPJ inválido.' };
  if (!cpf && !(await getRenterBillingProfile(user.id))) {
    return { ok: false, needsCpf: true, message: 'Informe seu CPF para gerar a cobrança.' };
  }

  // Primeiro todas as regras (e a vaga): só depois o gateway é chamado.
  const reserva = await createTemporaryBooking({
    renterId: user.id,
    spaceId: spaceId.data,
    groupId: groupId.data,
    startsAt,
    units: duracao.units,
    unit: duracao.unit,
    idempotencyKey: chave.data,
  });
  if (!reserva.ok) return { ok: false, message: reserva.message };

  const cliente = await ensureAsaasCustomer(user, cpf);
  if (!cliente.ok) {
    if (!reserva.reused) await discardUnchargedBooking(reserva.bookingId, user.id, 'cliente_asaas');
    return { ok: false, needsCpf: cliente.needsCpf, message: cliente.message };
  }

  const cobranca = await chargeTemporaryBooking(reserva.bookingId, cliente.customerId);
  if (!cobranca.ok) return { ok: false, message: cobranca.message };

  revalidatePath('/reservas');
  redirect(`/reservas/${reserva.bookingId}/pagar`);
}

/**
 * "Renovar aluguel": mais um período na MESMA unidade, começando exatamente
 * onde o atual termina. Vale até 7 minutos depois do fim (a unidade fica
 * protegida nesse meio-tempo); depois disso o banco libera a unidade.
 */
export async function renewTemporaryAction(
  _prev: RentalActionState | undefined,
  formData: FormData,
): Promise<RentalActionState> {
  const user = await requireUserOrThrow();
  const bookingId = UUID.safeParse(formData.get('bookingId'));
  const chave = UUID.safeParse(formData.get('idempotencyKey'));
  const duracao = lerDuracao(formData.get('duration'));
  if (!bookingId.success || !chave.success) return { ok: false, message: 'Recarregue a página e tente de novo.' };
  if (!duracao) return { ok: false, message: 'Escolha por quanto tempo renovar.' };

  const [atual] = await db
    .select({
      id: bookings.id, renterId: bookings.renterId, spaceId: bookings.spaceId, groupId: bookings.groupId,
      kind: bookings.kind, status: bookings.status, endsAt: bookings.endsAt, renewalAllowed: bookings.renewalAllowed,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId.data))
    .limit(1);
  if (!atual || atual.renterId !== user.id || atual.kind !== 'temporary' || !atual.groupId || !atual.endsAt) {
    return { ok: false, message: 'Aluguel não encontrado.' };
  }
  if (!atual.renewalAllowed) return { ok: false, message: 'Este espaço não aceita renovação.' };
  if (atual.status !== 'active' || Date.now() > atual.endsAt.getTime() + RENEWAL_WINDOW_MINUTES * 60_000) {
    return { ok: false, message: 'A janela de renovação terminou e a unidade foi liberada.' };
  }

  const cliente = await ensureAsaasCustomer(user, null);
  if (!cliente.ok) return { ok: false, needsCpf: cliente.needsCpf, message: cliente.message };

  const reserva = await createTemporaryBooking({
    renterId: user.id,
    spaceId: atual.spaceId,
    groupId: atual.groupId,
    startsAt: atual.endsAt,
    units: duracao.units,
    unit: duracao.unit,
    idempotencyKey: chave.data,
    renewedFromId: atual.id,
  });
  if (!reserva.ok) return { ok: false, message: reserva.message };

  const cobranca = await chargeTemporaryBooking(reserva.bookingId, cliente.customerId);
  if (!cobranca.ok) return { ok: false, message: cobranca.message };

  revalidatePath('/reservas');
  redirect(`/reservas/${reserva.bookingId}/pagar`);
}

/** A cobrança em aberto de uma reserva (a mais recente ainda não paga). */
async function cobrancaEmAberto(bookingId: string) {
  const [p] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.bookingId, bookingId), inArray(payments.status, ['pending', 'overdue'])))
    .orderBy(desc(payments.createdAt))
    .limit(1);
  return p ?? null;
}

/**
 * "Pagar com Pix" / "Pagar com cartão" — para a reserva temporária e para o
 * "Pagar agora" do pagamento pendente. NUNCA cria cobrança nova: troca a
 * forma de pagamento da cobrança que já existe (`PUT /payments/{id}`).
 * Clicar duas vezes não faz nada a mais (mesma forma = nenhuma chamada).
 *
 * Nada aqui confirma pagamento: a reserva só muda quando o webhook do Asaas
 * avisar. "Voltei da página do banco" não é pagamento.
 */
export async function choosePaymentMethodAction(
  _prev: RentalActionState | undefined,
  formData: FormData,
): Promise<RentalActionState> {
  const user = await requireUserOrThrow();
  const bookingId = UUID.safeParse(formData.get('bookingId'));
  const metodo = String(formData.get('method') ?? '');
  if (!bookingId.success || (metodo !== 'pix' && metodo !== 'card')) return { ok: false, message: 'Recarregue a página e tente de novo.' };

  const [booking] = await db
    .select({ id: bookings.id, renterId: bookings.renterId, status: bookings.status, kind: bookings.kind, holdExpiresAt: bookings.holdExpiresAt })
    .from(bookings)
    .where(eq(bookings.id, bookingId.data))
    .limit(1);
  if (!booking || booking.renterId !== user.id) return { ok: false, message: 'Reserva não encontrada.' };
  const pagavel = booking.status === 'awaiting_payment' || booking.status === 'past_due';
  if (!pagavel) return { ok: false, message: 'Esta reserva não tem pagamento em aberto.' };
  if (booking.kind === 'temporary' && booking.holdExpiresAt && booking.holdExpiresAt.getTime() <= Date.now()) {
    return { ok: false, message: 'O prazo para pagar terminou e a unidade foi liberada.' };
  }

  const cobranca = await cobrancaEmAberto(booking.id);
  if (!cobranca) return { ok: false, message: 'A cobrança ainda está sendo gerada. Atualize a página em instantes.' };

  try {
    if (metodo === 'pix') {
      // Trava a cobrança: dois toques ao mesmo tempo passam aqui um de cada
      // vez, e o segundo já encontra o Pix pronto (nada repetido no gateway).
      await db.transaction(async (tx) => {
        const [atual] = await tx
          .select({ method: payments.method, pixPayload: payments.pixPayload })
          .from(payments)
          .where(eq(payments.id, cobranca.id))
          .for('update');
        if (atual?.method !== 'pix' || !atual.pixPayload) {
          if (atual?.method !== 'pix') await asaas.updatePaymentBillingType(cobranca.providerPaymentId, 'PIX');
          const qr = await asaas.getPixQrCode(cobranca.providerPaymentId);
          await tx
            .update(payments)
            .set({ method: 'pix', pixPayload: qr.payload, pixQrImage: qr.encodedImage, payerStartedAt: new Date(), updatedAt: new Date() })
            .where(eq(payments.id, cobranca.id));
        } else {
          await tx.update(payments).set({ payerStartedAt: new Date(), updatedAt: new Date() }).where(eq(payments.id, cobranca.id));
        }
      });
      await db.insert(auditLogs).values({
        actorId: user.id, actorRole: user.role, action: 'payment.method_pix',
        entityType: 'payment', entityId: cobranca.id, metadata: { bookingId: booking.id },
      });
      revalidatePath(`/reservas/${booking.id}`);
      revalidatePath(`/reservas/${booking.id}/pagar`);
      revalidatePath(`/reservas/${booking.id}/pendente`);
      return { ok: true };
    }

    // Cartão (crédito ou débito, conforme a fatura do Asaas oferecer).
    const fatura = await db.transaction(async (tx) => {
      const [atual] = await tx
        .select({ method: payments.method, invoiceUrl: payments.invoiceUrl })
        .from(payments)
        .where(eq(payments.id, cobranca.id))
        .for('update');
      let link = atual?.invoiceUrl ?? null;
      if (atual?.method !== 'credit_card') {
        const atualizada = await asaas.updatePaymentBillingType(cobranca.providerPaymentId, 'CREDIT_CARD');
        link = atualizada.invoiceUrl ?? link;
      }
      await tx
        .update(payments)
        .set({ method: 'credit_card', invoiceUrl: link, payerStartedAt: new Date(), updatedAt: new Date() })
        .where(eq(payments.id, cobranca.id));
      return link;
    });
    await db.insert(auditLogs).values({
      actorId: user.id, actorRole: user.role, action: 'payment.method_card',
      entityType: 'payment', entityId: cobranca.id, metadata: { bookingId: booking.id },
    });
    if (!fatura) return { ok: false, message: 'O gateway não devolveu o link de pagamento. Tente de novo.' };
    redirect(fatura);
  } catch (err) {
    if (err instanceof asaas.AsaasError) {
      console.error('[pagamento] Asaas recusou a troca de forma de pagamento:', err.status, err.body);
      return { ok: false, message: `O gateway recusou: ${err.message}` };
    }
    throw err;
  }
}
