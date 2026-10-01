/**
 * Textos de aluguel (Parte 12) — horários sempre no relógio de Brasília.
 * Módulo puro: servidor e navegador.
 */
import type { BadgeProps } from '@/components/ui/badge';
import { bookingStatusLabel } from '@/lib/bookings/format';
import { formatDuration, temporaryPhase, type RentalTimeUnit, type TemporaryPhase } from './pricing';
import { addDaysToDate, brDate, brTime } from './time';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "hoje", "amanhã", "ontem" ou "02 out" — relativo ao dia de `now` em Brasília. */
export function brDayLabel(d: Date, now: Date): string {
  const dia = brDate(d);
  const hoje = brDate(now);
  if (dia === hoje) return 'hoje';
  if (dia === addDaysToDate(hoje, 1)) return 'amanhã';
  if (dia === addDaysToDate(hoje, -1)) return 'ontem';
  const [, m, dd] = dia.split('-');
  return `${dd} ${MESES[Number(m) - 1]}`;
}

/** "hoje, das 14:00 às 17:00" · "02 out, 08:00 → 03 out, 08:00" */
export function formatRentalPeriod(startsAt: Date, endsAt: Date, now: Date): string {
  const mesmoDia = brDate(startsAt) === brDate(new Date(endsAt.getTime() - 1));
  if (mesmoDia) {
    const fim = brTime(endsAt) === '00:00' ? '24:00' : brTime(endsAt);
    return `${brDayLabel(startsAt, now)}, das ${brTime(startsAt)} às ${fim}`;
  }
  return `${brDayLabel(startsAt, now)}, ${brTime(startsAt)} → ${brDayLabel(endsAt, now)}, ${brTime(endsAt)}`;
}

export function formatRentalDuration(units: number | null, unit: RentalTimeUnit | null): string {
  return units && unit ? formatDuration(units, unit) : '';
}

/** Por que o aluguel acabou, em português simples. */
export function endReasonLabel(reason: string | null): string | null {
  switch (reason) {
    case 'completed':
      return 'Terminou no horário combinado';
    case 'cancelled_by_renter':
      return 'Cancelado por quem alugava';
    case 'cancelled_by_owner':
      return 'Cancelado pelo proprietário';
    case 'payment_not_received':
      return 'Encerrado por falta de pagamento';
    case 'hold_expired':
      return 'O prazo para pagar terminou';
    default:
      return null;
  }
}

/** "Vaga 3" ou "Vaga 3 · Vagas rápidas" (o grupo só quando o anúncio tem mais de um). */
export function unitLine(unitLabel: string | null, groupName: string | null, groupCount: number): string | null {
  if (!unitLabel) return null;
  return groupCount > 1 && groupName ? `${unitLabel} · ${groupName}` : unitLabel;
}

/** Fase do aluguel temporário pelas colunas da reserva; `null` para o mensal. */
export function rentalPhaseOf(
  r: { kind: string; status: string; startsAt: Date | null; endsAt: Date | null; occupiedUntil: Date | null },
  now: Date,
): TemporaryPhase | null {
  if (r.kind !== 'temporary' || !r.startsAt || !r.endsAt || !r.occupiedUntil) return null;
  return temporaryPhase({ status: r.status, startsAt: r.startsAt, endsAt: r.endsAt, occupiedUntil: r.occupiedUntil }, now);
}

export type RentalBadge = { label: string; tone: NonNullable<BadgeProps['tone']> };

/** Selo do aluguel — sempre com texto, nunca só a cor. */
export function rentalBadge(status: string, phase: TemporaryPhase | null): RentalBadge {
  if (status === 'active' && phase === 'upcoming') return { label: 'Próximo', tone: 'accent' };
  if (status === 'active' && phase === 'in_use') return { label: 'Em uso', tone: 'positive' };
  if (status === 'active' && phase === 'renewal_window') return { label: 'Janela de renovação', tone: 'caution' };
  if (status === 'active') return { label: 'Ativo', tone: 'positive' };
  if (status === 'past_due') return { label: 'Pagamento pendente', tone: 'critical' };
  if (status === 'requested') return { label: bookingStatusLabel(status), tone: 'caution' };
  if (status === 'approved') return { label: 'Aceita — falta pagar', tone: 'positive' };
  if (status === 'awaiting_payment') return { label: 'Aguardando pagamento', tone: 'caution' };
  return { label: bookingStatusLabel(status), tone: 'neutral' };
}
