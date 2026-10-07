'use client';

import { useActionState, useId, useState } from 'react';
import { subscribePremiumAction, type PremiumActionState } from '@/lib/premium/actions';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/auth/form-shell';
import { cn } from '@/lib/utils';

const METODOS = [
  {
    value: 'card',
    label: 'Cartão de crédito',
    hint: 'Cobrança automática todo mês, no mesmo cartão. O cartão é informado na página segura do Asaas — nunca neste site.',
  },
  {
    value: 'pix',
    label: 'Pix',
    hint: 'Uma cobrança por mês: você recebe o aviso e paga com QR Code ou copia e cola na página segura do Asaas.',
  },
] as const;

/**
 * Assinar o Premium. O navegador manda só a forma de pagamento (e o CPF, se a
 * conta ainda não tem cliente no Asaas) — o preço é lido do banco no servidor.
 * Nada aqui ativa o Premium: ele começa quando o pagamento é confirmado.
 */
export function SubscribeForm({
  precoTexto,
  pedirCpf,
  cpfSugerido,
}: {
  precoTexto: string;
  pedirCpf: boolean;
  cpfSugerido?: string | null;
}) {
  const id = useId();
  const [state, action] = useActionState<PremiumActionState | undefined, FormData>(subscribePremiumAction, undefined);
  const [metodo, setMetodo] = useState<'card' | 'pix'>('card');
  const precisaCpf = pedirCpf || state?.needsCpf === true;

  return (
    <form action={action} className="space-y-5">
      {state?.message && !state.ok && <Alert tone="critical">{state.message}</Alert>}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium mb-1">Como você quer pagar?</legend>
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
                type="radio"
                name="method"
                value={m.value}
                checked={ativo}
                onChange={() => setMetodo(m.value)}
                className="sr-only"
              />
              <span className="font-medium">{m.label}</span>
              <span className="text-[0.8125rem] text-[var(--content-muted)] leading-snug">{m.hint}</span>
            </label>
          );
        })}
      </fieldset>

      {precisaCpf && (
        <Field label="CPF ou CNPJ" htmlFor={`${id}-doc`} hint="Usado pelo Asaas para identificar a cobrança.">
          <Input
            id={`${id}-doc`}
            name="cpfCnpj"
            inputMode="numeric"
            required
            defaultValue={cpfSugerido ?? ''}
            placeholder="000.000.000-00"
          />
        </Field>
      )}

      <SubmitButton>{`Assinar por ${precoTexto}/mês`}</SubmitButton>

      <p className="text-[0.75rem] text-[var(--content-subtle)] leading-relaxed">
        Cobrança mensal recorrente de {precoTexto}. O Premium começa quando o pagamento é confirmado. Você pode cancelar
        quando quiser: continua Premium até o fim do período já pago, sem nova cobrança e sem reembolso proporcional.
      </p>
    </form>
  );
}
