'use client';

import { useActionState, useState } from 'react';
import { saveStepAction, type SpaceActionState } from '@/lib/spaces/actions';
import { priceHintFor, type SpaceTypeKey } from '@/lib/spaces/types';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { StepActions } from './step-actions';
import { useAdvanceOnSave } from './use-advance';

/** Formata o que a pessoa digita como moeda, mantendo só os dígitos. */
function maskBRL(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  const cents = Number(digits);
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PriceForm({
  spaceId, spaceType, initial, minRentLabel, feeRenterBps, feeOwnerBps,
}: {
  spaceId: string;
  spaceType: SpaceTypeKey;
  initial: { priceMonthlyCents: number | null; availableFrom: string | null };
  minRentLabel: string;
  feeRenterBps: number;
  feeOwnerBps: number;
}) {
  const [state, action] = useActionState<SpaceActionState | undefined, FormData>(
    saveStepAction, undefined,
  );
  const [price, setPrice] = useState(
    initial.priceMonthlyCents && initial.priceMonthlyCents > 1
      ? (initial.priceMonthlyCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      : '',
  );
  useAdvanceOnSave(state?.ok, `/anunciar/${spaceId}/regras`);

  const hint = priceHintFor(spaceType);
  const err = (k: string) => state?.fieldErrors?.[k]?.[0];

  // Prévia do repasse. O cálculo que vale é o do servidor; isto é só o aviso
  // de quanto cai na conta, para a pessoa não descobrir isso depois.
  const cents = Number(price.replace(/\D/g, '')) || 0;
  const taxaDono = Math.round((cents * feeOwnerBps) / 10_000);
  const recebe = cents - taxaDono;
  const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} noValidate>
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="step" value="preco" />

      {state?.message && !state.ok && (
        <Alert tone="critical" className="mb-5">{state.message}</Alert>
      )}

      <div className="space-y-6">
        <div className="space-y-1.5">
          <label htmlFor="price" className="text-sm font-medium">Aluguel mensal</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--content-muted)] pointer-events-none">
              R$
            </span>
            <Input
              id="price" name="price" value={price}
              onChange={(e) => setPrice(maskBRL(e.target.value))}
              inputMode="numeric" placeholder="180,00"
              className="pl-10 text-[1.125rem] font-medium h-13"
              aria-invalid={err('price') ? true : undefined}
              required
            />
          </div>
          {err('price') ? (
            <p role="alert" className="text-[0.8125rem] text-[var(--color-critical)]">{err('price')}</p>
          ) : (
            <p className="text-[0.8125rem] text-[var(--content-muted)]">
              Mínimo {minRentLabel} por mês.
              {hint && ` Espaços como o seu costumam ficar entre ${brl(hint[0])} e ${brl(hint[1])}.`}
            </p>
          )}
        </div>

        {cents > 0 && (
          <div className="rounded-[var(--radius-card)] border p-4 space-y-2.5 bg-[var(--surface-sunken)]">
            <h2 className="text-[0.875rem] font-medium">Quanto cai na sua conta</h2>
            <dl className="space-y-1.5 text-[0.875rem]">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--content-muted)]">Aluguel que você definiu</dt>
                <dd className="tabular-nums">{brl(cents)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--content-muted)]">
                  Taxa da plataforma ({(feeOwnerBps / 100).toFixed(0)}%)
                </dt>
                <dd className="tabular-nums text-[var(--content-muted)]">− {brl(taxaDono)}</dd>
              </div>
              <div className="flex justify-between gap-3 pt-1.5 border-t font-medium">
                <dt>Você recebe por mês</dt>
                <dd className="tabular-nums">{brl(recebe)}</dd>
              </div>
            </dl>
            <p className="text-[0.75rem] text-[var(--content-subtle)] leading-relaxed pt-1">
              Quem aluga paga {brl(cents + Math.round((cents * feeRenterBps) / 10_000))} — o aluguel
              mais {(feeRenterBps / 100).toFixed(0)}% de taxa. A cobrança e o repasse ainda não
              estão ativos; entram numa fase seguinte.
            </p>
          </div>
        )}

        <Field
          label="Disponível a partir de"
          htmlFor="availableFrom"
          error={err('availableFrom')}
          hint="Se já está livre, deixe a data de hoje."
        >
          <Input
            name="availableFrom" type="date"
            defaultValue={initial.availableFrom ?? hoje}
            min={hoje}
            required
          />
        </Field>
      </div>

      <StepActions backHref={`/anunciar/${spaceId}/descricao`} />
    </form>
  );
}
