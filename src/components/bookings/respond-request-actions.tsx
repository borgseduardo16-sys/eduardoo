'use client';

import { useActionState, useState, useTransition } from 'react';
import { Check, X } from 'lucide-react';
import { respondToBookingRequestAction, type BookingActionState } from '@/lib/bookings/actions';
import { discardAccessAudioAction, uploadAccessAudioAction } from '@/lib/messaging/audio-actions';
import { ACCESS_INSTRUCTIONS_MAX, ACCESS_INSTRUCTIONS_MIN } from '@/lib/bookings/schemas';
import { AudioRecorder, type RecordedAudio } from '@/components/audio/audio-recorder';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/auth/form-shell';

/**
 * Aceitar ou recusar um pedido, na própria lista.
 *
 * ACEITAR exige dizer como o locatário encontra e usa o espaço — por texto, por
 * áudio ou pelos dois. É o que ele precisa para chegar e usar o espaço, e só
 * aparece para ele depois de pagar. A organização física (qual vaga, qual
 * pilastra, onde fica o portão) é sua e vai aqui; a plataforma não escolhe
 * unidade nenhuma. O servidor confere de novo (e o banco recusa o aceite sem
 * instruções): este formulário só evita o caminho de ida e volta.
 *
 * Recusar abre um campo de motivo opcional, para não mandar uma recusa de um
 * toque só, sem chance de explicar.
 *
 * Recebe `status` e decide sozinho o que mostrar — o pai NÃO deve fazer
 * `{status === 'requested' && <RespondRequestActions />}`. Depois de aceitar ou
 * recusar o status muda no banco e o Next atualiza a rota; se o pai desmontasse
 * este componente com base nesse status, o `Alert` de sucesso (que vive no
 * estado local daqui) sumiria antes de aparecer. Por isso o estado local é
 * checado ANTES do `status`.
 */
export function RespondRequestActions({
  bookingId,
  status,
  deadlineLabel,
  acceptBlockedReason,
}: {
  bookingId: string;
  status: string;
  /** "hoje às 15:30" — até quando dá para responder. */
  deadlineLabel?: string | null;
  /**
   * Quando o anúncio está sem vaga livre o aceite não cabe: o botão fica
   * desligado e o motivo aparece. Recusar continua possível. É só aviso — quem
   * garante que a última vaga não é aceita duas vezes é o banco.
   */
  acceptBlockedReason?: string | null;
}) {
  const [modo, setModo] = useState<'idle' | 'aceitando' | 'recusando'>('idle');
  const [texto, setTexto] = useState('');
  const [gravado, setGravado] = useState<RecordedAudio | null>(null);
  const [enviado, setEnviado] = useState<{ path: string; durationMs: number } | null>(null);
  const [erroAudio, setErroAudio] = useState<string | null>(null);
  const [enviandoAudio, iniciarEnvioAudio] = useTransition();
  const [gravadorKey, setGravadorKey] = useState(0);

  const [estadoAceitar, aceitar] = useActionState<BookingActionState | undefined, FormData>(
    respondToBookingRequestAction,
    undefined,
  );
  const [estadoRecusar, recusar] = useActionState<BookingActionState | undefined, FormData>(
    respondToBookingRequestAction,
    undefined,
  );

  if (estadoAceitar?.ok || estadoRecusar?.ok) {
    return (
      <Alert tone={estadoAceitar?.ok ? 'success' : 'info'}>
        {estadoAceitar?.ok
          ? 'Solicitação aceita. O locatário tem 24 horas para pagar; as instruções que você deu aparecem para ele só depois do pagamento.'
          : 'Solicitação recusada.'}
      </Alert>
    );
  }

  if (status !== 'requested') return null;

  // O áudio sobe assim que a gravação termina (ou é refeita); o aceite só leva o caminho dele.
  function aoGravar(audio: RecordedAudio | null) {
    setGravado(audio);
    setErroAudio(null);
    if (!audio) {
      if (enviado) {
        const fd = new FormData();
        fd.set('bookingId', bookingId);
        fd.set('path', enviado.path);
        void discardAccessAudioAction(fd);
      }
      setEnviado(null);
      return;
    }
    const fd = new FormData();
    fd.set('bookingId', bookingId);
    fd.set('durationMs', String(audio.durationMs));
    fd.set('audio', new File([audio.blob], 'audio', { type: audio.mime }));
    if (enviado) fd.set('previousPath', enviado.path);
    iniciarEnvioAudio(async () => {
      const r = await uploadAccessAudioAction(fd);
      if (r.ok) {
        setEnviado({ path: r.path, durationMs: r.durationMs });
      } else {
        setEnviado(null);
        setErroAudio(r.message);
        setGravado(null);
        setGravadorKey((k) => k + 1);
      }
    });
  }

  const textoCurto = texto.trim().length > 0 && texto.trim().length < ACCESS_INSTRUCTIONS_MIN;
  const faltaInstrucao = texto.trim().length < ACCESS_INSTRUCTIONS_MIN && !enviado;

  if (modo === 'aceitando') {
    return (
      <form action={aceitar} className="space-y-4 rounded-[var(--radius-field)] border p-4">
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="decision" value="accept" />
        {enviado && <input type="hidden" name="accessAudioPath" value={enviado.path} />}
        {enviado && <input type="hidden" name="accessAudioDurationMs" value={enviado.durationMs} />}

        <div className="space-y-1">
          <p className="font-medium">Como o locatário encontra e usa o espaço?</p>
          <p className="text-[0.8125rem] text-[var(--content-muted)] leading-relaxed">
            Obrigatório para aceitar. Diga onde fica a entrada, qual vaga ou parte é dele, como abrir o portão,
            o que combinar. Ele só vê isso <strong className="font-medium">depois de pagar</strong>. Escreva,
            grave um áudio, ou os dois.
          </p>
        </div>

        {estadoAceitar?.message && !estadoAceitar.ok && <Alert tone="critical">{estadoAceitar.message}</Alert>}

        <div className="space-y-1.5">
          <label htmlFor={`instr-${bookingId}`} className="text-sm font-medium">Instruções escritas</label>
          <Textarea
            id={`instr-${bookingId}`}
            name="accessInstructions"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={ACCESS_INSTRUCTIONS_MAX}
            rows={4}
            placeholder="Ex.: Portão azul ao lado da padaria. Sua vaga é a segunda, atrás da pilastra da esquerda."
          />
          <p className="text-[0.75rem] text-[var(--content-subtle)] tabular-nums">
            {texto.length}/{ACCESS_INSTRUCTIONS_MAX}
            {textoCurto && ` — escreva pelo menos ${ACCESS_INSTRUCTIONS_MIN} caracteres`}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Instruções em áudio</p>
          {erroAudio && <Alert tone="critical">{erroAudio}</Alert>}
          <AudioRecorder key={gravadorKey} onChange={aoGravar} disabled={enviandoAudio} />
          {gravado && (
            <p role="status" className="text-[0.8125rem] text-[var(--content-muted)]">
              {enviandoAudio ? 'Enviando o áudio…' : enviado ? 'Áudio pronto para ser enviado com o aceite.' : null}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`resp-${bookingId}`} className="text-sm font-medium">
            Mensagem para o locatário <span className="font-normal text-[var(--content-subtle)]">(opcional)</span>
          </label>
          <Textarea id={`resp-${bookingId}`} name="ownerResponse" maxLength={600} rows={2} placeholder="Ex.: Pode vir amanhã a partir das 8h." className="text-[0.875rem]" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setModo('idle')}>
            Voltar
          </Button>
          <SubmitButton size="sm" block={false} disabled={faltaInstrucao || textoCurto || enviandoAudio}>
            <Check className="size-4" aria-hidden />
            Aceitar solicitação
          </SubmitButton>
        </div>
      </form>
    );
  }

  if (modo === 'recusando') {
    return (
      <form action={recusar} className="space-y-2">
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="decision" value="reject" />
        {estadoRecusar?.message && !estadoRecusar.ok && <Alert tone="critical">{estadoRecusar.message}</Alert>}
        <Textarea
          name="ownerResponse"
          maxLength={600}
          placeholder="Motivo (opcional) — só você e o interessado veem."
          className="min-h-20 text-[0.875rem]"
        />
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setModo('idle')}>
            Voltar
          </Button>
          <SubmitButton size="sm" block={false} variant="critical">Confirmar recusa</SubmitButton>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-2">
      {deadlineLabel && (
        <p className="text-[0.8125rem] text-[var(--content-muted)]">
          Responda {deadlineLabel}; depois disso a solicitação expira.
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={() => setModo('aceitando')} disabled={Boolean(acceptBlockedReason)}>
          <Check className="size-4" aria-hidden />
          Aceitar
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setModo('recusando')}>
          <X className="size-4" aria-hidden />
          Recusar
        </Button>
      </div>
    </div>
  );
}
