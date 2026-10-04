/**
 * Histórico de uma locação, em ordem — módulo puro (servidor e navegador).
 *
 * Só entram fatos que o banco gravou, cada um com o instante em que aconteceu:
 * nada é inferido nem preenchido para "ficar bonito". A tela mostra a lista
 * para as DUAS partes, com o mesmo conteúdo.
 */
import { endReasonLabel, formatDateShort } from './format';

export type TimelineEvent = {
  at: Date;
  label: string;
  /** Linha de apoio (motivo, data combinada…). */
  detail?: string;
};

export type TimelineBooking = {
  status: string;
  startDate: string;
  requestedAt: Date;
  respondedAt: Date | null;
  activatedAt: Date | null;
  cancelledAt: Date | null;
  endedAt: Date | null;
  endReason: string | null;
  responseDeadlineAt: Date | null;
  firstPaymentDeadlineAt: Date | null;
  ownerResponse: string | null;
  cancellationReason: string | null;
};

export type TimelineEndRequest = {
  endDate: string;
  reason: string | null;
  status: 'pending' | 'withdrawn' | 'completed';
  createdAt: Date;
  resolvedAt: Date | null;
};

export function buildBookingTimeline(
  b: TimelineBooking,
  endRequests: readonly TimelineEndRequest[],
  viewer: 'owner' | 'renter',
): TimelineEvent[] {
  const eventos: TimelineEvent[] = [{ at: b.requestedAt, label: 'Solicitação enviada' }];

  if (b.status === 'rejected' && b.respondedAt) {
    eventos.push({
      at: b.respondedAt,
      label: viewer === 'owner' ? 'Você recusou a solicitação' : 'O proprietário recusou a solicitação',
      detail: b.ownerResponse ?? undefined,
    });
  } else if (b.respondedAt) {
    eventos.push({
      at: b.respondedAt,
      label: viewer === 'owner' ? 'Você aceitou a solicitação' : 'O proprietário aceitou a solicitação',
    });
  }

  if (b.activatedAt) {
    eventos.push({
      at: b.activatedAt,
      label: 'Pagamento confirmado',
      detail: `Início da locação em ${formatDateShort(b.startDate)}`,
    });
  }

  for (const r of endRequests) {
    eventos.push({
      at: r.createdAt,
      label:
        viewer === 'owner'
          ? 'Você pediu o encerramento da locação'
          : 'O proprietário pediu o encerramento da locação',
      detail: `Para ${formatDateShort(r.endDate)}${r.reason ? ` · Motivo: ${r.reason}` : ''}`,
    });
    if (r.status === 'withdrawn' && r.resolvedAt) {
      eventos.push({
        at: r.resolvedAt,
        label: viewer === 'owner' ? 'Você retirou o pedido de encerramento' : 'O proprietário retirou o pedido de encerramento',
      });
    }
  }

  // Fim sem registro próprio de instante: o prazo que o banco gravou é o momento real em que venceu.
  const motivo = endReasonLabel(b.endReason, { status: b.status, viewer });
  if (b.status === 'expired') {
    const prazo = b.endReason === 'request_not_answered' ? b.responseDeadlineAt : b.firstPaymentDeadlineAt;
    if (prazo) eventos.push({ at: prazo, label: 'Expirou', detail: motivo ?? undefined });
  } else if (b.status === 'cancelled' && b.cancelledAt) {
    eventos.push({ at: b.cancelledAt, label: 'Cancelada', detail: [motivo, b.cancellationReason].filter(Boolean).join(' · ') || undefined });
  } else if (b.status === 'ended' && b.endedAt) {
    eventos.push({ at: b.endedAt, label: 'Locação encerrada', detail: motivo ?? undefined });
  }

  return eventos.sort((x, y) => x.at.getTime() - y.at.getTime());
}
