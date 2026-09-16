'use client';

import { useActionState } from 'react';
import { Ban, Undo2 } from 'lucide-react';
import { blockUserAction, unblockUserAction, type SafetyActionState } from '@/lib/safety/actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { useFormStatus } from 'react-dom';

function IconSubmit({
  children,
  icon: Icon,
  variant = 'secondary',
}: {
  children: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  variant?: 'secondary' | 'critical' | 'quiet';
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} loading={pending}>
      {!pending && <Icon className="size-4" />}
      {children}
    </Button>
  );
}

/**
 * Bloquear alguém.
 *
 * Diferente da denúncia, não depende de análise de ninguém: o efeito é
 * imediato e a pessoa resolve o próprio problema. Por isso os dois botões
 * costumam aparecer juntos — denunciar cuida do caso, bloquear cuida de você.
 */
export function BlockButton({ userId, userName }: { userId: string; userName?: string | null }) {
  const [state, action] = useActionState<SafetyActionState | undefined, FormData>(
    blockUserAction,
    undefined,
  );

  if (state?.ok) {
    return (
      <Alert tone="success">
        {state.message}
      </Alert>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="blockedId" value={userId} />
      {state?.message && !state.ok && <Alert tone="critical">{state.message}</Alert>}
      <IconSubmit icon={Ban} variant="critical">
        Bloquear{userName ? ` ${userName.split(' ')[0]}` : ''}
      </IconSubmit>
    </form>
  );
}

export function UnblockButton({ userId }: { userId: string }) {
  const [state, action] = useActionState<SafetyActionState | undefined, FormData>(
    unblockUserAction,
    undefined,
  );

  return (
    <form action={action}>
      <input type="hidden" name="blockedId" value={userId} />
      {state?.message && !state.ok && (
        <p role="alert" className="text-[0.8125rem] text-[var(--color-critical)] mb-1">
          {state.message}
        </p>
      )}
      <IconSubmit icon={Undo2} variant="secondary">
        Desbloquear
      </IconSubmit>
    </form>
  );
}
