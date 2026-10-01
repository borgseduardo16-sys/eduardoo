'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Contagem regressiva pelo relógio do SERVIDOR (Parte 12).
 *
 * O servidor manda o instante do fim e a hora dele no momento em que montou
 * a página; aqui só se mede quanto tempo passou desde então. O relógio do
 * aparelho pode estar errado à vontade — a diferença inicial é corrigida.
 * Fechar o app e abrir depois recalcula tudo a partir do banco: nada
 * depende da tela ter ficado aberta.
 */
export function Countdown({
  target,
  serverNow,
  className,
  refreshOnEnd = true,
  prefix,
  endedText = 'agora',
}: {
  target: string;
  serverNow: string;
  className?: string;
  refreshOnEnd?: boolean;
  prefix?: string;
  endedText?: string;
}) {
  const router = useRouter();
  const [restante, setRestante] = useState(() => new Date(target).getTime() - new Date(serverNow).getTime());
  const base = useRef<{ alvo: number; inicioLocal: number; restanteInicial: number } | null>(null);
  const atualizou = useRef(false);

  useEffect(() => {
    base.current = {
      alvo: new Date(target).getTime(),
      inicioLocal: Date.now(),
      restanteInicial: new Date(target).getTime() - new Date(serverNow).getTime(),
    };
    atualizou.current = false;
    const tick = () => {
      const b = base.current!;
      const r = b.restanteInicial - (Date.now() - b.inicioLocal);
      setRestante(r);
      if (r <= 0 && refreshOnEnd && !atualizou.current) {
        atualizou.current = true;
        // Um pouco depois do fim: dá tempo de o banco já ter registrado.
        setTimeout(() => router.refresh(), 1500);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target, serverNow, refreshOnEnd, router]);

  return (
    <span className={cn('tabular-nums', className)} role="timer" aria-live="off">
      {prefix}
      {restante <= 0 ? endedText : formatRemaining(restante)}
    </span>
  );
}

/** 3 h 05 min · 12 min 30 s · 45 s */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const dias = Math.floor(total / 86_400);
  const horas = Math.floor((total % 86_400) / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const segundos = total % 60;
  if (dias > 0) return `${dias} d ${horas} h`;
  if (horas > 0) return `${horas} h ${String(minutos).padStart(2, '0')} min`;
  if (minutos > 0) return `${minutos} min ${String(segundos).padStart(2, '0')} s`;
  return `${segundos} s`;
}

/**
 * Atualiza a página de tempos em tempos enquanto se espera algo que só o
 * servidor sabe (o Asaas confirmar o pagamento pelo webhook). Nunca conclui
 * nada sozinho: só pergunta de novo.
 */
export function AutoRefresh({ everyMs = 5000, active = true }: { everyMs?: number; active?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(id);
  }, [active, everyMs, router]);
  return null;
}

export function CopyButton({ text, label = 'Copiar código Pix' }: { text: string; label?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2500);
        } catch {
          setCopiado(false);
        }
      }}
      className="inline-flex items-center justify-center gap-2 h-11 px-4 w-full sm:w-auto rounded-[var(--radius-field)] border font-medium hover:bg-[var(--surface-sunken)] transition-colors"
    >
      {copiado ? <Check className="size-4 text-[var(--color-positive)]" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {copiado ? 'Código copiado' : label}
    </button>
  );
}
