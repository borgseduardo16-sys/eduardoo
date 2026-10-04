'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Mic, RotateCcw, Square, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { AUDIO_MAX_MS, AUDIO_MIN_MS, formatAudioDuration } from '@/lib/messaging/audio-format';
import { AudioPlayer } from './audio-player';

export type RecordedAudio = { blob: Blob; durationMs: number; mime: string };

/** O navegador sabe gravar áudio? (Decidido no cliente; no servidor, "não" até hidratar.) */
function useGravacaoSuportada(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
    () => false,
  );
}

/** Primeiro formato que o aparelho grava e o servidor aceita (WebM, MP4/M4A, Ogg). */
function escolherFormato(): string | undefined {
  const candidatos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidatos.find((m) => MediaRecorder.isTypeSupported(m));
}

function mensagemDeErro(err: unknown): string {
  const nome = (err as { name?: string } | null)?.name;
  if (nome === 'NotAllowedError' || nome === 'SecurityError') {
    return 'O navegador bloqueou o microfone. Libere a permissão nas configurações do site e tente de novo.';
  }
  if (nome === 'NotFoundError' || nome === 'OverconstrainedError') {
    return 'Nenhum microfone foi encontrado neste aparelho.';
  }
  if (nome === 'NotReadableError') {
    return 'O microfone está em uso por outro aplicativo. Feche-o e tente de novo.';
  }
  return 'Não foi possível gravar agora. Tente de novo.';
}

/**
 * Gravador de voz (MediaRecorder). Só GRAVA e entrega o arquivo ao formulário
 * que o usa — quem envia (chat ou instruções de acesso) é o pai. Limites de 1 s
 * a 3 min, os mesmos do banco; a validação que vale é a do servidor, que lê o
 * conteúdo do arquivo. Nada é enviado sem a pessoa apertar o botão de enviar.
 */
export function AudioRecorder({
  onChange,
  disabled = false,
}: {
  onChange: (audio: RecordedAudio | null) => void;
  disabled?: boolean;
}) {
  const suportado = useGravacaoSuportada();
  const [fase, setFase] = useState<'parado' | 'gravando' | 'pronto'>('parado');
  const [decorridoMs, setDecorridoMs] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [gravado, setGravado] = useState<(RecordedAudio & { url: string }) | null>(null);

  const gravadorRef = useRef<MediaRecorder | null>(null);
  const fluxoRef = useRef<MediaStream | null>(null);
  const pedacosRef = useRef<Blob[]>([]);
  const inicioRef = useRef(0);
  const relogioRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const liberarMicrofone = useCallback(() => {
    if (relogioRef.current) clearInterval(relogioRef.current);
    relogioRef.current = null;
    fluxoRef.current?.getTracks().forEach((t) => t.stop());
    fluxoRef.current = null;
  }, []);

  // Fechar a tela no meio da gravação libera o microfone.
  useEffect(() => () => {
    liberarMicrofone();
    gravadorRef.current = null;
  }, [liberarMicrofone]);

  // Libera a URL do arquivo gravado quando ele é trocado ou descartado.
  useEffect(() => () => {
    if (gravado) URL.revokeObjectURL(gravado.url);
  }, [gravado]);

  const parar = useCallback(() => {
    const g = gravadorRef.current;
    if (g && g.state !== 'inactive') g.stop();
  }, []);

  async function iniciar() {
    setErro(null);
    let fluxo: MediaStream;
    try {
      fluxo = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch (err) {
      setErro(mensagemDeErro(err));
      return;
    }
    fluxoRef.current = fluxo;

    const formato = escolherFormato();
    let g: MediaRecorder;
    try {
      // 32 kbps: qualidade de voz, e um áudio de 3 minutos fica abaixo de 1 MB.
      g = new MediaRecorder(fluxo, { ...(formato ? { mimeType: formato } : {}), audioBitsPerSecond: 32_000 });
    } catch (err) {
      liberarMicrofone();
      setErro(mensagemDeErro(err));
      return;
    }
    gravadorRef.current = g;
    pedacosRef.current = [];

    g.ondataavailable = (e) => {
      if (e.data.size > 0) pedacosRef.current.push(e.data);
    };
    g.onstop = () => {
      const duracao = Math.min(AUDIO_MAX_MS, Math.round(performance.now() - inicioRef.current));
      liberarMicrofone();
      const tipo = (g.mimeType || formato || 'audio/webm').split(';')[0]!;
      const blob = new Blob(pedacosRef.current, { type: tipo });
      pedacosRef.current = [];
      if (duracao < AUDIO_MIN_MS || blob.size === 0) {
        setFase('parado');
        setDecorridoMs(0);
        setErro('Grave pelo menos 1 segundo.');
        onChange(null);
        return;
      }
      const audio = { blob, durationMs: duracao, mime: tipo };
      setGravado({ ...audio, url: URL.createObjectURL(blob) });
      setFase('pronto');
      onChange(audio);
    };
    g.onerror = () => {
      liberarMicrofone();
      setFase('parado');
      setErro('A gravação foi interrompida. Tente de novo.');
      onChange(null);
    };

    inicioRef.current = performance.now();
    setDecorridoMs(0);
    g.start(1000);
    setFase('gravando');
    relogioRef.current = setInterval(() => {
      const agora = performance.now() - inicioRef.current;
      setDecorridoMs(agora);
      if (agora >= AUDIO_MAX_MS) parar();
    }, 200);
  }

  function descartar() {
    setGravado(null);
    setFase('parado');
    setDecorridoMs(0);
    setErro(null);
    onChange(null);
  }

  if (!suportado) {
    return (
      <Alert tone="warning">
        Este navegador não grava áudio. Use a caixa de texto ou abra o site em outro navegador.
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      {erro && <Alert tone="critical">{erro}</Alert>}

      {fase === 'parado' && (
        <Button type="button" variant="secondary" size="sm" onClick={iniciar} disabled={disabled}>
          <Mic aria-hidden />
          Gravar áudio
        </Button>
      )}

      {fase === 'gravando' && (
        <div className="flex flex-wrap items-center gap-3" role="status" aria-live="polite">
          <span className="inline-flex items-center gap-2 text-[0.875rem] font-medium">
            <span className="size-2.5 rounded-full bg-[var(--color-critical)]" aria-hidden />
            Gravando
            <span className="tabular-nums text-[var(--content-muted)]">
              {formatAudioDuration(decorridoMs)} / {formatAudioDuration(AUDIO_MAX_MS)}
            </span>
          </span>
          <Button type="button" variant="secondary" size="sm" onClick={parar}>
            <Square aria-hidden />
            Parar
          </Button>
        </div>
      )}

      {fase === 'pronto' && gravado && (
        <div className="space-y-2">
          <div className="rounded-[var(--radius-field)] border p-3">
            <AudioPlayer src={gravado.url} durationMs={gravado.durationMs} label="Áudio gravado" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => { descartar(); void iniciar(); }} disabled={disabled}>
              <RotateCcw aria-hidden />
              Regravar
            </Button>
            <Button type="button" variant="quiet" size="sm" onClick={descartar} disabled={disabled}>
              <Trash2 aria-hidden />
              Descartar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
