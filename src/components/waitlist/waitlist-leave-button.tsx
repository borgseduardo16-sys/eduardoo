'use client';

import { useActionState } from 'react';
import { leaveWaitlistAction, type WaitlistActionState } from '@/lib/waitlist/actions';
import { Button } from '@/components/ui/button';

/** "Sair da lista" na página de favoritos (Fase 23). */
export function WaitlistLeaveButton({ spaceId }: { spaceId: string }) {
  const [estado, sair, saindo] = useActionState<WaitlistActionState | undefined, FormData>(leaveWaitlistAction, undefined);
  return (
    <form action={sair} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="spaceId" value={spaceId} />
      <Button type="submit" variant="quiet" size="sm" loading={saindo}>
        Sair da lista
      </Button>
      {estado && !estado.ok && (
        <span role="alert" className="text-[0.75rem] text-[var(--color-critical)]">
          {estado.message}
        </span>
      )}
    </form>
  );
}
