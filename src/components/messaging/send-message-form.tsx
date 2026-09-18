'use client';

import { useActionState, useId, useMemo, useState } from 'react';
import { sendMessageAction, type MessagingActionState } from '@/lib/messaging/actions';
import { detectContactInfo } from '@/lib/safety/contact-detection';
import { OffPlatformWarning } from '@/components/safety/off-platform-warning';
import { Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/auth/form-shell';

/**
 * Caixa de envio de mensagem.
 *
 * O aviso de troca de contato/pagamento por fora aparece ENQUANTO a pessoa
 * digita (deteccao roda no cliente, funcao pura — ver contact-detection.ts),
 * nao só depois de enviar: da pra reconsiderar antes de mandar. Isso nao
 * troca a checagem do servidor, que roda de novo e é quem decide o que
 * grava em `flagged_at` — o aviso no cliente é só UX, nunca a fonte de verdade.
 */
export function SendMessageForm({ conversationId }: { conversationId: string }) {
  const id = useId();
  const [texto, setTexto] = useState('');
  const [state, action] = useActionState<MessagingActionState | undefined, FormData>(
    sendMessageAction,
    undefined,
  );

  const deteccao = useMemo(() => detectContactInfo(texto), [texto]);

  // Limpa a caixa quando o envio anterior deu certo — nao ao digitar de novo.
  // Ajuste durante a renderizacao (nao em efeito) comparando com o estado
  // do render anterior: evita o cascading render de um setState em useEffect.
  const [estadoAnterior, setEstadoAnterior] = useState(state);
  if (state !== estadoAnterior) {
    setEstadoAnterior(state);
    if (state?.ok && texto !== '') setTexto('');
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="conversationId" value={conversationId} />

      {state?.message && !state.ok && <Alert tone="critical">{state.message}</Alert>}

      <OffPlatformWarning detection={deteccao} />

      <Textarea
        id={`${id}-corpo`}
        name="body"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        maxLength={4000}
        required
        placeholder="Escreva sua mensagem…"
        className="min-h-20"
        aria-label="Mensagem"
      />

      <div className="flex justify-end">
        <SubmitButton size="sm" block={false}>Enviar</SubmitButton>
      </div>
    </form>
  );
}
