'use client';

import { useActionState, useId } from 'react';
import { startCheckoutAction, type CheckoutActionState } from '@/lib/payments/actions';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/auth/form-shell';

/**
 * Confirmacao final antes de ir para o Asaas.
 *
 * So pede o CPF/CNPJ porque e o unico dado que falta pra identificar a
 * cobranca — nome e e-mail ja vem da conta logada. Depois de confirmar, o
 * navegador e redirecionado para a fatura hospedada pelo Asaas (Pix, boleto
 * ou cartao escolhidos la, nunca digitados neste site).
 */
export function CheckoutForm({ bookingId, cpfSugerido }: { bookingId: string; cpfSugerido?: string | null }) {
  const id = useId();
  const [state, action] = useActionState<CheckoutActionState | undefined, FormData>(
    startCheckoutAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="bookingId" value={bookingId} />

      {state?.message && !state.ok && <Alert tone="critical">{state.message}</Alert>}

      <Field label="CPF ou CNPJ" htmlFor={`${id}-doc`} hint="Usado pelo Asaas para identificar a cobrança.">
        <Input name="cpfCnpj" inputMode="numeric" required defaultValue={cpfSugerido ?? ''} placeholder="000.000.000-00" />
      </Field>

      <SubmitButton>Confirmar e ir para o pagamento</SubmitButton>

      <p className="text-[0.75rem] text-[var(--content-subtle)] leading-relaxed">
        Você vai ser levado para uma página segura do Asaas para escolher entre Pix, boleto ou
        cartão. Nenhum dado de pagamento é digitado neste site.
      </p>
    </form>
  );
}
