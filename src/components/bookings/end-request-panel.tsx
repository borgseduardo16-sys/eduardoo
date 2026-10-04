'use client';

import { useActionState, useId, useState } from 'react';
import { CalendarX2 } from 'lucide-react';
import {
  requestRentalEndAction,
  withdrawRentalEndRequestAction,
  type BookingActionState,
} from '@/lib/bookings/actions';
import { formatDateShort } from '@/lib/bookings/format';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/auth/form-shell';

/**
 * "Solicitar encerramento da locação" — do PROPRIETÁRIO.
 *
 * Não apaga nada nem encerra na hora: registra o pedido com a data (e o motivo,
 * se quiser), avisa o locatário e guarda o histórico. Quando a data chega, a
 * locação é encerrada, a cobrança automática é cancelada e a unidade volta a
 * ficar disponível. A plataforma não cobra multa e ainda não há aviso prévio
 * mínimo definido (o banco já confere um prazo mínimo configurável, hoje 0) —
 * por isso a tela avisa que escolher "hoje" encerra agora.
 *
 * Recebe o pedido pendente (se houver) e decide sozinho o que mostrar; o estado
 * de sucesso local vem antes do `status`, como nos outros botões desta pasta.
 */
export function EndRequestPanel({
  bookingId,
  status,
  pending,
  today,
  suggestedDate,
  maxDate,
}: {
  bookingId: string;
  status: string;
  /** Pedido de encerramento em aberto desta locação, se houver. */
  pending: { endDate: string; reason: string | null } | null;
  /** Hoje em Brasília, `YYYY-MM-DD`. */
  today: string;
  /** Data sugerida no campo (30 dias à frente). */
  suggestedDate: string;
  /** Limite que o banco aceita (1 ano). */
  maxDate: string;
}) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState(suggestedDate);
  const [estadoPedir, pedir] = useActionState<BookingActionState | undefined, FormData>(requestRentalEndAction, undefined);
  const [estadoRetirar, retirar] = useActionState<BookingActionState | undefined, FormData>(withdrawRentalEndRequestAction, undefined);

  if (estadoPedir?.ok) {
    return (
      <Alert tone="info" title="Pedido de encerramento registrado">
        O locatário foi avisado. A locação segue normalmente até a data escolhida e o histórico fica guardado.
      </Alert>
    );
  }
  if (estadoRetirar?.ok) {
    return <Alert tone="info">Pedido retirado. A locação continua normalmente.</Alert>;
  }

  if (status !== 'active' && status !== 'past_due') return null;

  if (pending) {
    return (
      <div className="rounded-[var(--radius-field)] border p-3.5 space-y-2.5" data-testid="pedido-encerramento">
        <p className="flex items-start gap-2 text-[0.9375rem]">
          <CalendarX2 className="size-4 mt-1 shrink-0 text-[var(--color-caution)]" aria-hidden />
          <span>
            Você pediu o encerramento desta locação para <strong>{formatDateShort(pending.endDate)}</strong>.
            {pending.reason ? <> Motivo: {pending.reason}</> : null}
          </span>
        </p>
        {estadoRetirar?.message && !estadoRetirar.ok && <Alert tone="critical">{estadoRetirar.message}</Alert>}
        <form action={retirar}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <SubmitButton variant="secondary" size="sm" block={false}>Retirar o pedido</SubmitButton>
        </form>
      </div>
    );
  }

  if (!aberto) {
    return (
      <Button type="button" variant="quiet" size="sm" onClick={() => setAberto(true)}>
        <CalendarX2 aria-hidden />
        Solicitar encerramento da locação
      </Button>
    );
  }

  return (
    <form action={pedir} className="rounded-[var(--radius-field)] border p-4 space-y-4">
      <input type="hidden" name="bookingId" value={bookingId} />
      <p className="font-medium">Solicitar encerramento da locação</p>

      {estadoPedir?.message && !estadoPedir.ok && <Alert tone="critical">{estadoPedir.message}</Alert>}

      <Field
        label="Data de encerramento" htmlFor={`${id}-data`}
        hint="O locatário é avisado agora. Na data escolhida a locação termina e a cobrança automática é cancelada."
      >
        <Input id={`${id}-data`} name="endDate" type="date" min={today} max={maxDate} value={data} onChange={(e) => setData(e.target.value)} required />
      </Field>
      {data === today && (
        <Alert tone="warning">Escolher hoje encerra a locação agora, sem tempo para o locatário se organizar.</Alert>
      )}

      <Field label="Motivo" htmlFor={`${id}-motivo`} optional hint="O locatário vê o motivo. Seja claro e educado.">
        <Textarea id={`${id}-motivo`} name="reason" maxLength={500} rows={3} placeholder="Ex.: vou precisar do espaço para uso próprio a partir do mês que vem." />
      </Field>

      <p className="text-[0.8125rem] text-[var(--content-subtle)] leading-relaxed">
        A plataforma não cobra multa por este pedido. Regras de aviso prévio e multa ainda não estão definidas; o que
        vale entre vocês é o combinado no chat.
      </p>

      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>Voltar</Button>
        <SubmitButton size="sm" block={false} variant="critical">Registrar pedido</SubmitButton>
      </div>
    </form>
  );
}
