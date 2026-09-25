'use client';

import { useActionState, useState } from 'react';
import { endBookingAction, type BookingActionState } from '@/lib/bookings/actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/auth/form-shell';

/**
 * Encerra um aluguel EM ANDAMENTO — mesmo padrão de `CancelBookingButton`
 * (confirmação em duas etapas, estado de sucesso checado antes do `status`
 * pra não sumir da tela assim que o próprio clique muda o status).
 */
export function EndBookingButton({ bookingId, status }: { bookingId: string; status: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [state, action] = useActionState<BookingActionState | undefined, FormData>(
    endBookingAction,
    undefined,
  );

  if (state?.ok) {
    return (
      <div className="pt-1">
        <Alert tone="info">Aluguel encerrado.</Alert>
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
          Encerrar aluguel
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="pt-1 space-y-2">
      {state?.message && !state.ok && <Alert tone="critical">{state.message}</Alert>}
      <input type="hidden" name="bookingId" value={bookingId} />
      <div className="flex items-center gap-2">
        <span className="text-[0.8125rem] text-[var(--content-muted)]">
          Encerrar agora? A cobrança mensal para.
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(false)}>Não</Button>
        <SubmitButton size="sm" block={false} variant="critical">Sim, encerrar</SubmitButton>
      </div>
    </form>
  );
}
