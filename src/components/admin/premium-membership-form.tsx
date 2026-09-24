'use client';

import { useActionState } from 'react';
import { togglePremiumMembershipAction, type AdminActionState } from '@/lib/admin/actions';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/auth/form-shell';

export function PremiumMembershipForm({ userId, isPremium }: { userId: string; isPremium: boolean }) {
  const [estado, atualizar] = useActionState<AdminActionState | undefined, FormData>(
    togglePremiumMembershipAction,
    undefined,
  );

  return (
    <form action={atualizar} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="acao" value={isPremium ? 'revogar' : 'conceder'} />

      {estado?.ok && <Alert tone="success">{estado.message}</Alert>}
      {estado?.message && !estado.ok && <Alert tone="critical">{estado.message}</Alert>}

      <SubmitButton size="sm" block={false} variant={isPremium ? 'secondary' : 'primary'}>
        {isPremium ? 'Revogar Premium' : 'Conceder Premium'}
      </SubmitButton>
    </form>
  );
}
