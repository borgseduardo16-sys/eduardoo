'use client';

import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { reserveTemporaryAction, type RentalActionState } from '@/lib/rentals/actions';
import type { DurationOption } from '@/lib/rentals/pricing';
import type { UnitNoun } from '@/lib/spaces/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

export type BookableGroup = {
  id: string;
  name: string;
  hoursLabel: string;
  durations: DurationOption[];
  availableNow: number;
  total: number;
  renewalAllowed: boolean;
};

const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function Enviar() {
  const { pending } = useFormStatus();
  // Desabilitado enquanto envia: o segundo toque nem sai do aparelho. Se sair
  // (rede lenta, outra aba), a chave do formulário devolve a MESMA reserva.
  return (
    <Button type="submit" size="lg" block loading={pending} disabled={pending}>
      {pending ? 'Reservando…' : 'Reservar e pagar'}
    </Button>
  );
}

/**
 * Reserva por hora/dia/semana (Parte 12). As durações e os valores vêm do
 * servidor (regras do grupo, já sem o que fica abaixo do mínimo); o total
 * mostrado aqui é só prévia — quem calcula de verdade é o servidor, de novo,
 * na hora de reservar, e o banco confere.
 */
export function TemporaryBookingForm({
  spaceId, groups, needsCpf, unitNoun, renterFeeBps, today, maxDate, holdMinutes, idempotencyKey,
}: {
  spaceId: string;
  groups: BookableGroup[];
  needsCpf: boolean;
  unitNoun: UnitNoun;
  renterFeeBps: number;
  today: string;
  maxDate: string;
  holdMinutes: number;
  idempotencyKey: string;
}) {
  const [state, action] = useActionState<RentalActionState | undefined, FormData>(reserveTemporaryAction, undefined);
  const [groupId, setGroupId] = useState(groups.find((g) => g.availableNow > 0)?.id ?? groups[0]?.id ?? '');
  const grupo = groups.find((g) => g.id === groupId) ?? groups[0];
  const [quando, setQuando] = useState<'now' | 'scheduled'>('now');
  const [duracao, setDuracao] = useState(() => {
    const d = grupo?.durations[0];
    return d ? `${d.units}:${d.unit}` : '';
  });
  const escolhida = useMemo(
    () => grupo?.durations.find((d) => `${d.units}:${d.unit}` === duracao) ?? grupo?.durations[0],
    [grupo, duracao],
  );
  const taxa = escolhida ? Math.round((escolhida.rentCents * renterFeeBps) / 10_000) : 0;
  const pedirCpf = needsCpf || state?.needsCpf;

  if (!grupo) return null;

  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="groupId" value={grupo.id} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="start" value={quando} />
      <input type="hidden" name="duration" value={escolhida ? `${escolhida.units}:${escolhida.unit}` : ''} />

      {state?.message && !state.ok && <Alert tone="critical">{state.message}</Alert>}

      {groups.length > 1 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium mb-1">Qual opção?</legend>
          {groups.map((g) => {
            const ativo = g.id === grupo.id;
            return (
              <label
                key={g.id}
                className={cn(
                  'flex items-start justify-between gap-3 rounded-[var(--radius-field)] border px-3.5 py-2.5 cursor-pointer',
                  ativo ? 'border-[var(--accent)] bg-[var(--accent-subtle)] ring-1 ring-[var(--accent)]' : 'hover:border-[var(--content-subtle)]',
                )}
              >
                <input
                  type="radio" name="grupo" value={g.id} checked={ativo} className="sr-only"
                  onChange={() => {
                    setGroupId(g.id);
                    const d = g.durations[0];
                    setDuracao(d ? `${d.units}:${d.unit}` : '');
                  }}
                />
                <span className="space-y-0.5">
                  <span className="block font-medium">{g.name}</span>
                  <span className="block text-[0.8125rem] text-[var(--content-muted)]">{g.hoursLabel}</span>
                </span>
                <span className="text-[0.8125rem] text-[var(--content-muted)] text-right shrink-0">
                  {g.availableNow} de {g.total} livres agora
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium mb-1">Quando começa?</legend>
        <div className="grid grid-cols-2 gap-2">
          {(['now', 'scheduled'] as const).map((v) => (
            <label
              key={v}
              className={cn(
                'flex items-center justify-center h-11 rounded-[var(--radius-field)] border cursor-pointer text-[0.9375rem] font-medium',
                quando === v ? 'border-[var(--accent)] bg-[var(--accent-subtle)] ring-1 ring-[var(--accent)]' : 'hover:border-[var(--content-subtle)]',
              )}
            >
              <input type="radio" name="quando" value={v} checked={quando === v} onChange={() => setQuando(v)} className="sr-only" />
              {v === 'now' ? 'Agora' : 'Escolher horário'}
            </label>
          ))}
        </div>
        {quando === 'scheduled' && (
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" name="date" defaultValue={today} min={today} max={maxDate} aria-label="Dia" />
            <Input type="time" name="time" defaultValue="08:00" step={300} aria-label="Horário de início" />
          </div>
        )}
        <p className="text-[0.75rem] text-[var(--content-subtle)]">Horário de Brasília.</p>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="duracao" className="text-sm font-medium block">Por quanto tempo?</label>
        <select
          id="duracao"
          value={escolhida ? `${escolhida.units}:${escolhida.unit}` : ''}
          onChange={(e) => setDuracao(e.target.value)}
          className="w-full h-11 px-3 rounded-[var(--radius-field)] border border-[var(--border-strong)] bg-[var(--surface)] text-base md:text-[0.9375rem]"
        >
          {grupo.durations.map((d) => (
            <option key={`${d.units}:${d.unit}`} value={`${d.units}:${d.unit}`}>
              {d.label} — {brl(d.rentCents)}
            </option>
          ))}
        </select>
      </div>

      {pedirCpf && (
        <div className="space-y-1.5">
          <label htmlFor="cpfCnpj" className="text-sm font-medium block">CPF ou CNPJ de quem paga</label>
          <Input id="cpfCnpj" name="cpfCnpj" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" />
          <p className="text-[0.75rem] text-[var(--content-subtle)]">Exigido pelo gateway para emitir a cobrança. Pedimos só uma vez.</p>
        </div>
      )}

      {escolhida && (
        <dl className="space-y-1 text-[0.875rem] border-t pt-3">
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--content-muted)]">Aluguel ({escolhida.label.toLowerCase()})</dt>
            <dd className="tabular-nums">{brl(escolhida.rentCents)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--content-muted)]">Taxa de serviço</dt>
            <dd className="tabular-nums">{brl(taxa)}</dd>
          </div>
          <div className="flex justify-between gap-3 font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{brl(escolhida.rentCents + taxa)}</dd>
          </div>
        </dl>
      )}

      <Enviar />
      <p className="text-[0.75rem] text-[var(--content-subtle)] leading-relaxed">
        A {unitNoun.singular} fica segura por {holdMinutes} minutos enquanto você paga (Pix ou cartão). A reserva só
        é confirmada quando o pagamento for aprovado.{grupo.renewalAllowed ? ` Ao final, dá para renovar por até 7 minutos depois do horário.` : ''}
      </p>
    </form>
  );
}
