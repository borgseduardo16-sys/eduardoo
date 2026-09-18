'use client';

import { useActionState, useState } from 'react';
import { Check, X } from 'lucide-react';
import { respondToBookingRequestAction, type BookingActionState } from '@/lib/bookings/actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/auth/form-shell';

/**
 * Aceitar/recusar uma solicitacao, na propria lista.
 *
 * Aceitar e imediato (um clique) — e reversivel de outro jeito (cancelar
 * depois). Recusar abre um campo de motivo opcional antes de confirmar, pra
 * nao mandar uma recusa de um toque só sem chance de explicar por quê.
 *
 * Recebe `status` e decide sozinho o que mostrar — o pai NAO deve fazer
 * `{status === 'requested' && <RespondRequestActions />}`. Depois que aceitar
 * ou recusar muda o status no banco, o Next atualiza a rota automaticamente;
 * se o pai desmontasse este componente com base nesse status atualizado, o
 * `Alert` de sucesso (que vive no estado local daqui) seria removido da tela
 * antes de aparecer. Por isso o estado local e checado ANTES do `status`.
 */
export function RespondRequestActions({ bookingId, status }: { bookingId: string; status: string }) {
  const [modo, setModo] = useState<'idle' | 'recusando'>('idle');

  const [estadoAceitar, aceitar] = useActionState<BookingActionState | undefined, FormData>(
    respondToBookingRequestAction,
    undefined,
  );
  const [estadoRecusar, recusar] = useActionState<BookingActionState | undefined, FormData>(
    respondToBookingRequestAction,
    undefined,
  );

  if (estadoAceitar?.ok || estadoRecusar?.ok) {
    return (
      <Alert tone={estadoAceitar?.ok ? 'success' : 'info'}>
        {estadoAceitar?.ok ? 'Solicitação aceita.' : 'Solicitação recusada.'}
      </Alert>
    );
  }

  if (status !== 'requested') {
    return null;
  }

  if (modo === 'recusando') {
    return (
      <form action={recusar} className="space-y-2">
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="decision" value="reject" />
        {estadoRecusar?.message && !estadoRecusar.ok && <Alert tone="critical">{estadoRecusar.message}</Alert>}
        <Textarea
          name="ownerResponse"
          maxLength={600}
          placeholder="Motivo (opcional) — só você e o interessado veem."
          className="min-h-20 text-[0.875rem]"
        />
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setModo('idle')}>
            Voltar
          </Button>
          <SubmitButton size="sm" block={false} variant="critical">Confirmar recusa</SubmitButton>
        </div>
      </form>
    );
  }

  return (
    <div className="flex gap-2">
      {estadoAceitar?.message && !estadoAceitar.ok && (
        <p role="alert" className="text-[0.8125rem] text-[var(--color-critical)]">{estadoAceitar.message}</p>
      )}
      <form action={aceitar}>
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="decision" value="accept" />
        <SubmitButton size="sm" block={false}>
          <Check className="size-4" aria-hidden />
          Aceitar
        </SubmitButton>
      </form>
      <Button type="button" variant="secondary" size="sm" onClick={() => setModo('recusando')}>
        <X className="size-4" aria-hidden />
        Recusar
      </Button>
    </div>
  );
}
