'use client';

import { useActionState, useId, useState } from 'react';
import { purchasePromotionAction, type PurchasePromotionActionState } from '@/lib/promotions/actions';
import { priceOptionsFor } from '@/lib/promotions/purchase-pricing';
import { formatBRL } from '@/lib/money';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SubmitButton } from '@/components/auth/form-shell';
import { cn } from '@/lib/utils';

/**
 * Escolha de duracao + preco fixo, e confirmacao do CPF/CNPJ pra cobranca —
 * mesmo padrao de `CheckoutForm` (reserva). Preco nunca sai da tela: so o id
 * da duracao escolhida vai no formulario, a action recalcula o preco contra
 * o catalogo fixo antes de cobrar qualquer coisa.
 *
 * Reusado em dois lugares: no dialog "Destacar" (Meus espaços) e na etapa
 * "Turbine seu anúncio" antes de publicar.
 */
export function PromotionPurchaseForm({
  spaceId,
  type,
  cpfSugerido,
  onCancel,
}: {
  spaceId: string;
  type: 'destaque' | 'turbo';
  cpfSugerido?: string | null;
  onCancel?: () => void;
}) {
  const id = useId();
  const opcoes = priceOptionsFor(type);
  const [duracao, setDuracao] = useState<number | null>(null);

  const [state, action] = useActionState<PurchasePromotionActionState | undefined, FormData>(
    purchasePromotionAction, undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="durationHours" value={duracao ?? ''} />

      {state?.message && !state.ok && <Alert tone="critical">{state.message}</Alert>}

      <div className="grid grid-cols-2 gap-2">
        {opcoes.map((o) => (
          <button
            key={o.durationHours}
            type="button"
            onClick={() => setDuracao(o.durationHours)}
            className={cn(
              'rounded-[var(--radius-field)] border p-3 text-left transition-colors',
              duracao === o.durationHours
                ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
                : 'border-[var(--border-strong)] hover:bg-[var(--surface-sunken)]',
            )}
          >
            <span className="block text-[0.9375rem] font-medium">{o.label}</span>
            <span className="block text-[0.8125rem] text-[var(--content-muted)] tabular-nums">
              {formatBRL(o.priceCents)}
            </span>
          </button>
        ))}
      </div>

      <Field label="CPF ou CNPJ" htmlFor={`${id}-doc`} hint="Usado pelo Asaas para identificar a cobrança.">
        <Input
          id={`${id}-doc`}
          name="cpfCnpj" inputMode="numeric" required
          defaultValue={cpfSugerido ?? ''} placeholder="000.000.000-00"
        />
      </Field>

      <div className="flex gap-2">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">
            Voltar
          </Button>
        )}
        <div className="flex-1">
          <SubmitButton disabled={!duracao}>Pagar e ativar</SubmitButton>
        </div>
      </div>

      <p className="text-[0.75rem] text-[var(--content-subtle)] leading-relaxed">
        Você vai ser levado para uma página segura do Asaas para escolher entre Pix, boleto ou
        cartão. Nenhum dado de pagamento é digitado neste site.
      </p>
    </form>
  );
}
