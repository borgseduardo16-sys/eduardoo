'use client';

import { useActionState, useId, useState } from 'react';
import { startCheckoutAction, type CheckoutActionState } from '@/lib/payments/actions';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/auth/form-shell';
import { cn } from '@/lib/utils';

const METODOS = [
  {
    value: 'card',
    label: 'Cartão de crédito',
    hint: 'Cobrança automática todo mês, no mesmo cartão. O cartão é informado na página segura do Asaas.',
  },
  {
    value: 'pix',
    label: 'Pix',
    hint: 'Uma cobrança por mês, que você paga pelo app com QR Code ou copia e cola.',
  },
] as const;

/**
 * Confirmacao final antes de criar a assinatura no Asaas, com a
 * escolha de COMO pagar as mensalidades.
 *
 * Pede o CPF/CNPJ porque e o unico dado que falta pra identificar a
 * cobranca — nome e e-mail ja vem da conta logada. Cartao: vai para a
 * fatura do Asaas cadastrar o cartao (nunca digitado neste site); Pix: o QR
 * da primeira mensalidade aparece no proprio app.
 */
export function CheckoutForm({ bookingId, cpfSugerido }: { bookingId: string; cpfSugerido?: string | null }) {
  const id = useId();
  const [state, action] = useActionState<CheckoutActionState | undefined, FormData>(
    startCheckoutAction,
    undefined,
  );

  const [metodo, setMetodo] = useState<'card' | 'pix'>('card');

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="bookingId" value={bookingId} />

      {state?.message && !state.ok && <Alert tone="critical">{state.message}</Alert>}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium mb-1">Como você quer pagar as mensalidades?</legend>
        {METODOS.map((m) => {
          const ativo = metodo === m.value;
          return (
            <label
              key={m.value}
              className={cn(
                'flex flex-col gap-0.5 rounded-[var(--radius-field)] border px-3.5 py-2.5 cursor-pointer',
                ativo ? 'border-[var(--accent)] bg-[var(--accent-subtle)] ring-1 ring-[var(--accent)]' : 'hover:border-[var(--content-subtle)]',
              )}
            >
              <input
                type="radio" name="method" value={m.value} checked={ativo}
                onChange={() => setMetodo(m.value)} className="sr-only"
              />
              <span className="font-medium">{m.label}</span>
              <span className="text-[0.8125rem] text-[var(--content-muted)] leading-snug">{m.hint}</span>
            </label>
          );
        })}
      </fieldset>

      <Field label="CPF ou CNPJ" htmlFor={`${id}-doc`} hint="Usado pelo Asaas para identificar a cobrança.">
        <Input name="cpfCnpj" inputMode="numeric" required defaultValue={cpfSugerido ?? ''} placeholder="000.000.000-00" />
      </Field>

      <SubmitButton>{metodo === 'card' ? 'Confirmar e cadastrar o cartão' : 'Confirmar e pagar com Pix'}</SubmitButton>

      <p className="text-[0.75rem] text-[var(--content-subtle)] leading-relaxed">
        {metodo === 'card'
          ? 'Você vai para uma página segura do Asaas informar o cartão. Nenhum dado de cartão é digitado neste site. Dá para encerrar a locação quando quiser: a cobrança automática para na hora.'
          : 'O QR Code da primeira mensalidade aparece na próxima tela. Nos meses seguintes, a cobrança aparece em Meus aluguéis.'}
      </p>
    </form>
  );
}
