'use client';

import { useActionState } from 'react';
import { cancelPremiumAction, resumePremiumAction, type PremiumActionState } from '@/lib/premium/actions';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/auth/form-shell';

/**
 * Cancelar a renovação (ou abandonar uma assinatura ainda não paga). Pede
 * confirmação por extenso: cancelar NÃO encerra o Premium na hora — a pessoa
 * continua Premium até o fim do período já pago, e não há reembolso proporcional.
 */
export function CancelPremiumForm({ pendente, fimTexto }: { pendente: boolean; fimTexto: string | null }) {
  const [state, action] = useActionState<PremiumActionState | undefined, FormData>(cancelPremiumAction, undefined);

  if (state?.ok) return <Alert tone="success">{state.message}</Alert>;

  return (
    <details className="group rounded-[var(--radius-field)] border p-3.5 text-[0.875rem]">
      <summary className="cursor-pointer font-medium text-[var(--content-muted)] group-open:text-[var(--content)]">
        {pendente ? 'Cancelar esta assinatura' : 'Cancelar a renovação'}
      </summary>
      <form action={action} className="mt-3 space-y-3">
        <p className="text-[var(--content-muted)] leading-relaxed">
          {pendente
            ? 'Nada foi cobrado ainda. Ao cancelar, a cobrança pendente é descartada.'
            : `Você continua Premium e usa os benefícios até ${fimTexto}. Depois disso a assinatura não renova, não há nova cobrança e não há reembolso proporcional do período já pago.`}
        </p>
        {state?.message && !state.ok && <Alert tone="critical">{state.message}</Alert>}
        <SubmitButton size="sm" block={false} variant="secondary">
          {pendente ? 'Confirmar cancelamento' : 'Confirmar: não renovar'}
        </SubmitButton>
      </form>
    </details>
  );
}

/** Desfaz o cancelamento agendado: a nova cobrança só começa no fim do período já pago. */
export function ResumePremiumForm({ fimTexto }: { fimTexto: string }) {
  const [state, action] = useActionState<PremiumActionState | undefined, FormData>(resumePremiumAction, undefined);

  if (state?.ok) return <Alert tone="success">{state.message}</Alert>;

  return (
    <form action={action} className="space-y-2">
      {state?.message && !state.ok && <Alert tone="critical">{state.message}</Alert>}
      <SubmitButton size="md" block={false}>
        Reativar a renovação
      </SubmitButton>
      <p className="text-[0.75rem] text-[var(--content-subtle)]">
        A próxima cobrança acontece em {fimTexto}, quando o período atual terminar.
      </p>
    </form>
  );
}
