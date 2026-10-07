'use client';

import { useActionState } from 'react';
import { togglePremiumMembershipAction, type AdminActionState } from '@/lib/admin/actions';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { SubmitButton } from '@/components/auth/form-shell';

/**
 * Premium pelo painel — MODO TESTE/SUPORTE. O Premium de verdade é a
 * assinatura paga; aqui a administração só libera um período curto, sem
 * cobrança e sem benefícios financeiros (a menos que o teste financeiro seja
 * ligado de propósito), ou encerra o que está valendo.
 */
export function PremiumMembershipForm({
  userId,
  isPremium,
  source,
}: {
  userId: string;
  isPremium: boolean;
  /** `subscription` (paga) ou `admin_grant` (modo teste) quando já é Premium. */
  source: string | null;
}) {
  const [estado, atualizar] = useActionState<AdminActionState | undefined, FormData>(
    togglePremiumMembershipAction,
    undefined,
  );

  return (
    <details className="rounded-[var(--radius-card)] border bg-[var(--surface-sunken)] p-3 text-[0.875rem]">
      <summary className="cursor-pointer font-medium">
        Premium — modo administrativo/teste
        <span className="ml-2 text-[0.75rem] font-normal text-[var(--content-subtle)]">
          {isPremium
            ? source === 'subscription'
              ? 'assinatura paga'
              : 'concedido pela administração'
            : 'sem Premium agora'}
        </span>
      </summary>

      <form action={atualizar} className="mt-3 space-y-3">
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="acao" value={isPremium ? 'revogar' : 'conceder'} />

        <p className="text-[0.8125rem] text-[var(--content-muted)]">
          {isPremium
            ? source === 'subscription'
              ? 'Esta conta paga o Premium. Encerrar aqui NÃO devolve dinheiro — o estorno é decidido no Asaas.'
              : 'Encerra a concessão de teste agora.'
            : 'Libera o Premium por alguns dias, sem cobrança, só para teste ou suporte. Não libera taxa reduzida nem primeiro mês, a menos que você marque o teste financeiro.'}
        </p>

        {!isPremium && (
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <label className="space-y-1">
              <span className="text-[0.8125rem] font-medium">Dias (1 a 90)</span>
              <Input name="dias" type="number" min={1} max={90} defaultValue={30} required />
            </label>
            <label className="flex items-end gap-2 pb-2">
              <input type="checkbox" name="testeFinanceiro" className="size-4" />
              <span className="text-[0.8125rem]">Liberar benefícios financeiros (somente teste)</span>
            </label>
          </div>
        )}

        <label className="block space-y-1">
          <span className="text-[0.8125rem] font-medium">Motivo (fica na auditoria)</span>
          <Input name="motivo" maxLength={300} required minLength={5} placeholder="Ex.: teste da tela de benefícios" />
        </label>

        {estado?.ok && <Alert tone="success">{estado.message}</Alert>}
        {estado?.message && !estado.ok && <Alert tone="critical">{estado.message}</Alert>}

        <SubmitButton size="sm" block={false} variant={isPremium ? 'secondary' : 'primary'}>
          {isPremium ? 'Encerrar Premium' : 'Liberar Premium (teste)'}
        </SubmitButton>
      </form>
    </details>
  );
}
