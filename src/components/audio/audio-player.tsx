'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { formatAudioDuration } from '@/lib/messaging/audio-format';
import { cn } from '@/lib/utils';

/** Só um áudio toca por vez: ao começar um, os outros pausam. */
const EVENTO_TOCOU = 'myplace:audio-tocou';

/**
 * Player de áudio compacto, no tom do texto em volta (`currentColor`): serve
 * dentro do balão azul das mensagens que eu mandei e do balão claro das que
 * recebi. A duração mostrada vem do banco (`durationMs`) — o arquivo gravado
 * pelo navegador (WebM) não traz a duração no cabeçalho, então o próprio
 * arquivo não é fonte confiável dela.
 *
 * `src` aponta para uma rota do próprio site que confere quem está ouvindo;
 * nada do armazenamento privado chega ao navegador. Sem pular para o meio: é
 * recado de voz curto, e o arquivo gravado no navegador nem sempre aceita.
 */
export function AudioPlayer({
  src,
  durationMs,
  label = 'Mensagem de áudio',
  className,
}: {
  src: string;
  durationMs: number | null;
  label?: string;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [tocando, setTocando] = useState(false);
  const [posicaoMs, setPosicaoMs] = useState(0);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    const el = audioRef.current;
    const pausarSeOutro = (e: Event) => {
      if ((e as CustomEvent).detail !== el) el?.pause();
    };
    window.addEventListener(EVENTO_TOCOU, pausarSeOutro);
    return () => window.removeEventListener(EVENTO_TOCOU, pausarSeOutro);
  }, []);

  async function alternar() {
    const el = audioRef.current;
    if (!el) return;
    if (!el.paused) {
      el.pause();
      return;
    }
    setFalhou(false);
    try {
      window.dispatchEvent(new CustomEvent(EVENTO_TOCOU, { detail: el }));
      await el.play();
    } catch {
      setFalhou(true);
    }
  }

  const total = durationMs && durationMs > 0 ? durationMs : null;
  const pct = total ? Math.min(100, (posicaoMs / total) * 100) : 0;

  return (
    <div className={cn('flex items-center gap-3 min-w-[12rem]', className)}>
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onEnded={() => {
          setTocando(false);
          setPosicaoMs(0);
        }}
        onTimeUpdate={(e) => setPosicaoMs(e.currentTarget.currentTime * 1000)}
        onError={() => {
          setTocando(false);
          setFalhou(true);
        }}
      />
      <button
        type="button"
        onClick={alternar}
        aria-label={tocando ? `Pausar ${label.toLowerCase()}` : `Ouvir ${label.toLowerCase()}`}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-current/40 hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {tocando ? <Pause className="size-4" aria-hidden /> : <Play className="size-4 translate-x-px" aria-hidden />}
      </button>
      <div className="min-w-0 flex-1 space-y-1">
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          className="h-1 rounded-full bg-current/25 overflow-hidden"
        >
          <div className="h-full rounded-full bg-current" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[0.75rem] tabular-nums opacity-80">
          {falhou ? (
            'Não foi possível carregar o áudio. Toque para tentar de novo.'
          ) : (
            <>
              {formatAudioDuration(posicaoMs)}
              {total != null && ` / ${formatAudioDuration(total)}`}
            </>
          )}
        </p>
      </div>
    </div>
  );
}
