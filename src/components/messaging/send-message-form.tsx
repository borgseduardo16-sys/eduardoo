'use client';

import { useActionState, useId, useMemo, useState, useTransition } from 'react';
import { Mic, Send, Type } from 'lucide-react';
import { sendMessageAction, type MessagingActionState } from '@/lib/messaging/actions';
import { sendAudioMessageAction } from '@/lib/messaging/audio-actions';
import { detectContactInfo } from '@/lib/safety/contact-detection';
import { OffPlatformWarning } from '@/components/safety/off-platform-warning';
import { AudioRecorder, type RecordedAudio } from '@/components/audio/audio-recorder';
import { Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SubmitButton } from '@/components/auth/form-shell';

/**
 * Caixa de envio de mensagem: texto OU áudio (imagem não existe no chat).
 *
 * O aviso de troca de contato/pagamento por fora aparece ENQUANTO a pessoa
 * digita (deteccao roda no cliente, funcao pura — ver contact-detection.ts),
 * nao só depois de enviar: da pra reconsiderar antes de mandar. Isso nao
 * troca a checagem do servidor, que roda de novo e é quem decide o que
 * grava em `flagged_at` — o aviso no cliente é só UX, nunca a fonte de verdade.
 * O áudio não é transcrito: o detector só lê texto.
 */
export function SendMessageForm({ conversationId }: { conversationId: string }) {
  const id = useId();
  const [modo, setModo] = useState<'texto' | 'audio'>('texto');
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

  // --- áudio ---
  const [gravado, setGravado] = useState<RecordedAudio | null>(null);
  const [erroAudio, setErroAudio] = useState<string | null>(null);
  const [enviando, iniciarEnvio] = useTransition();
  // Trocar a chave do gravador o zera depois de um envio bem-sucedido.
  const [gravadorKey, setGravadorKey] = useState(0);

  function enviarAudio() {
    if (!gravado) return;
    setErroAudio(null);
    const fd = new FormData();
    fd.set('conversationId', conversationId);
    fd.set('durationMs', String(gravado.durationMs));
    fd.set('audio', new File([gravado.blob], 'audio', { type: gravado.mime }));
    iniciarEnvio(async () => {
      const r = await sendAudioMessageAction(fd);
      if (!r.ok) {
        setErroAudio(r.message ?? 'Não foi possível enviar o áudio.');
        return;
      }
      setGravado(null);
      setGravadorKey((k) => k + 1);
      setModo('texto');
    });
  }

  if (modo === 'audio') {
    return (
      <div className="space-y-3">
        {erroAudio && <Alert tone="critical">{erroAudio}</Alert>}
        <AudioRecorder key={gravadorKey} onChange={setGravado} disabled={enviando} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="quiet" size="sm" onClick={() => { setGravado(null); setErroAudio(null); setModo('texto'); }} disabled={enviando}>
            <Type aria-hidden />
            Voltar para o texto
          </Button>
          <Button type="button" size="sm" onClick={enviarAudio} disabled={!gravado} loading={enviando}>
            <Send aria-hidden />
            Enviar áudio
          </Button>
        </div>
      </div>
    );
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

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="quiet" size="sm" onClick={() => setModo('audio')}>
          <Mic aria-hidden />
          Gravar áudio
        </Button>
        <SubmitButton size="sm" block={false}>Enviar</SubmitButton>
      </div>
    </form>
  );
}
