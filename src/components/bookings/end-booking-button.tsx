'use client';

import { useActionState, useState } from 'react';
import { endBookingAction, type BookingActionState } from '@/lib/bookings/actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/auth/form-shell';

/**
 * Encerra uma locação EM ANDAMENTO — é do LOCATÁRIO (quem aluga pode sair
 * quando quiser; o proprietário pede o encerramento pelo `EndRequestPanel`).
 *
 * Mesmo padrão de `CancelBookingButton`: confirmação em duas etapas e estado
 * de sucesso checado antes do `status`, para não sumir da tela assim que o
 * próprio clique muda o status.
 */
export function EndBookingButton({
  bookingId,
  status,
  label = 'Encerrar locação',
}: {
  bookingId: string;
  status: string;
  label?: string;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [state, action] = useActionState<BookingActionState | undefined, FormData>(
    endBookingAction,
    undefined,
  );

  if (state?.ok) {
    return (
      <div className="pt-1">
        <Alert tone="info">Locação encerrada. A cobrança automática foi interrompida e nada mais será cobrado.</Alert>
      </div>
    );
  }

  if (status !== 'active' && status !== 'past_due') {
    return null;
  }

  if (!confirmando) {
    return (
      <div className="pt-1">
        <Button type="button" variant="quiet" size="sm" onClick={() => setConfirmando(true)}>
          {label}
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="pt-1 space-y-2">
      {state?.message && !state.ok && <Alert tone="critical">{state.message}</Alert>}
      <input type="hidden" name="bookingId" value={bookingId} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[0.8125rem] text-[var(--content-muted)]">
          Encerrar agora? A cobrança automática para na hora e a vaga volta para o anúncio.
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(false)}>Não</Button>
        <SubmitButton size="sm" block={false} variant="critical">Sim, encerrar</SubmitButton>
      </div>
    </form>
  );
}
