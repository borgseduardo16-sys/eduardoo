'use client';

import { useActionState, useId } from 'react';
import {
  createAvailabilityBlockAction,
  cancelAvailabilityBlockAction,
  type CalendarActionState,
} from '@/lib/calendar/actions';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

const MOTIVOS = [
  { value: 'manutencao', label: 'Manutenção' },
  { value: 'uso_proprio', label: 'Uso próprio' },
  { value: 'viagem', label: 'Viagem' },
  { value: 'outro', label: 'Outro motivo' },
] as const;

/** Bloquear datas no calendário do espaço (Fase 23). O servidor confere tudo de novo. */
export function BlockDatesForm({ spaceId, minDate }: { spaceId: string; minDate: string }) {
  const id = useId();
  const [estado, acao, enviando] = useActionState<CalendarActionState | undefined, FormData>(
    createAvailabilityBlockAction,
    undefined,
  );
  const erro = (campo: string) => estado?.fieldErrors?.[campo]?.[0] ?? null;

  return (
    <form action={acao} className="space-y-4" data-testid="form-bloqueio">
      <input type="hidden" name="spaceId" value={spaceId} />

      {estado?.ok && <Alert tone="success">{estado.message}</Alert>}
      {estado && !estado.ok && !estado.fieldErrors && <Alert tone="critical">{estado.message}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="De" htmlFor={`${id}-inicio`} error={erro('startsOn')}>
          <Input name="startsOn" type="date" min={minDate} required />
        </Field>
        <Field label="Até" htmlFor={`${id}-fim`} error={erro('endsOn')}>
          <Input name="endsOn" type="date" min={minDate} required />
        </Field>
      </div>

      <Field label="Motivo" htmlFor={`${id}-motivo`} error={erro('reason')} hint="Só você vê o motivo. Quem visita o anúncio vê apenas que as datas estão indisponíveis.">
        <select
          name="reason"
          required
          defaultValue=""
          className="w-full h-11 px-3 rounded-[var(--radius-field)] border border-[var(--border-strong)] bg-[var(--surface-raised)] text-[0.9375rem]"
        >
          <option value="" disabled>
            Escolha…
          </option>
          {MOTIVOS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Anotação" htmlFor={`${id}-nota`} optional error={erro('note')}>
        <Input name="note" maxLength={200} placeholder="Ex.: pintura do portão" />
      </Field>

      <Button type="submit" loading={enviando}>
        Bloquear datas
      </Button>
    </form>
  );
}

export function CancelBlockButton({ blockId }: { blockId: string }) {
  const [estado, acao, enviando] = useActionState<CalendarActionState | undefined, FormData>(
    cancelAvailabilityBlockAction,
    undefined,
  );
  return (
    <form action={acao} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="blockId" value={blockId} />
      <Button type="submit" variant="quiet" size="sm" loading={enviando}>
        Desfazer
      </Button>
      {estado && !estado.ok && (
        <span role="alert" className="text-[0.75rem] text-[var(--color-critical)]">
          {estado.message}
        </span>
      )}
    </form>
  );
}
