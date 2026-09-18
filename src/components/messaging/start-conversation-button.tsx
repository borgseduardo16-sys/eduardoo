'use client';

import { useActionState } from 'react';
import { MessageCircle } from 'lucide-react';
import { startConversationAction, type MessagingActionState } from '@/lib/messaging/actions';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/auth/form-shell';

/** Botão "Falar com o proprietário" — cria a conversa (ou reabre a existente) e leva pra ela. */
export function StartConversationButton({ spaceId }: { spaceId: string }) {
  const [state, action] = useActionState<MessagingActionState | undefined, FormData>(
    startConversationAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="spaceId" value={spaceId} />
      {state?.message && !state.ok && <Alert tone="critical">{state.message}</Alert>}
      <SubmitButton variant="secondary">
        <MessageCircle className="size-4" aria-hidden />
        Falar com o proprietário
      </SubmitButton>
    </form>
  );
}
