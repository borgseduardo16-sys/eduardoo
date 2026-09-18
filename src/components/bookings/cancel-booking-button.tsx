'use client';

import { useActionState, useState } from 'react';
import { cancelBookingAction, type BookingActionState } from '@/lib/bookings/actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/auth/form-shell';

/**
 * Cancelar uma solicitacao/reserva, na propria lista.
 *
 * Recebe `status` e decide sozinho o que mostrar — o pai NAO deve fazer
 * `{podeCancel && <CancelBookingButton />}`. Depois que cancelar muda o
 * status no banco, o Next atualiza a rota automaticamente; se o pai
 * desmontasse este componente com base nesse status atualizado, a mensagem
 * "Cancelado." (que vive no estado local daqui) seria removida da tela
 * antes de aparecer. Por isso o estado local e checado ANTES do `status`.
 * Cada retorno carrega seu proprio espacamento (`pt-1`) porque o pai nao
 * envolve mais este componente num wrapper condicional.
 */
export function CancelBookingButton({
  bookingId,
  status,
  label = 'Cancelar',
}: {
  bookingId: string;
  status: string;
  label?: string;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [state, action] = useActionState<BookingActionState | undefined, FormData>(
    cancelBookingAction,
    undefined,
  );

  if (state?.ok) {
    return (
      <div className="pt-1">
        <Alert tone="info">Cancelado.</Alert>
      </div>
    );
  }

  if (status !== 'requested' && status !== 'approved') {
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
    <form action={action} className="pt-1 flex items-center gap-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      {state?.message && !state.ok && (
        <p role="alert" className="text-[0.8125rem] text-[var(--color-critical)]">{state.message}</p>
      )}
      <span className="text-[0.8125rem] text-[var(--content-muted)]">Cancelar mesmo?</span>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(false)}>Não</Button>
      <SubmitButton size="sm" block={false} variant="critical">Sim, cancelar</SubmitButton>
    </form>
  );
}
