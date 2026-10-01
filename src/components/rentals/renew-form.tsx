'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { RotateCw } from 'lucide-react';
import { renewTemporaryAction, type RentalActionState } from '@/lib/rentals/actions';
import type { DurationOption } from '@/lib/rentals/pricing';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" loading={pending} disabled={pending}>
      {!pending && <RotateCw className="size-4" aria-hidden />}
      Renovar aluguel
    </Button>
  );
}

/**
 * "Renovar aluguel" (Parte 12): mais um período na MESMA unidade, a partir
 * do fim do atual. A chave do formulário evita renovar duas vezes num
 * duplo toque; e o banco só aceita UMA renovação viva por reserva.
 */
export function RenewForm({
  bookingId, durations, idempotencyKey,
}: {
  bookingId: string;
  durations: DurationOption[];
  idempotencyKey: string;
}) {
  const [state, action] = useActionState<RentalActionState | undefined, FormData>(renewTemporaryAction, undefined);
  const [duracao, setDuracao] = useState(durations[0] ? `${durations[0].units}:${durations[0].unit}` : '');
  if (durations.length === 0) return null;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {state?.message && !state.ok && <Alert tone="critical">{state.message}</Alert>}
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`renovar-${bookingId}`}>Por quanto tempo renovar</label>
        <select
          id={`renovar-${bookingId}`}
          name="duration"
          value={duracao}
          onChange={(e) => setDuracao(e.target.value)}
          className="h-9 px-2.5 rounded-[var(--radius-field)] border border-[var(--border-strong)] bg-[var(--surface)] text-[0.875rem]"
        >
          {durations.map((d) => (
            <option key={`${d.units}:${d.unit}`} value={`${d.units}:${d.unit}`}>
              {d.label.startsWith('Até') ? d.label : `Mais ${d.label.toLowerCase()}`} — {brl(d.rentCents)}
            </option>
          ))}
        </select>
        <Enviar />
      </div>
    </form>
  );
}
