'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, BellOff } from 'lucide-react';
import { setPriceAlertAction } from '@/lib/favorites/actions';
import { cn } from '@/lib/utils';

/**
 * "Me avise quando o preço baixar" (Fase 23) — só aparece para quem já
 * favoritou. Interruptor de verdade (role=switch), com o estado confirmado
 * pelo servidor: se ele recusar, a tela volta e explica.
 */
export function PriceAlertToggle({
  spaceId,
  initialEnabled,
  className,
}: {
  spaceId: string;
  initialEnabled: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [ligado, setLigado] = useOptimistic(initialEnabled);
  const [aviso, setAviso] = useState<string | null>(null);

  function alternar(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setAviso(null);
    startTransition(async () => {
      setLigado(!ligado);
      const fd = new FormData();
      fd.set('spaceId', spaceId);
      fd.set('enabled', ligado ? '0' : '1');
      const res = await setPriceAlertAction(fd);
      if (!res.ok) {
        setAviso(res.message ?? 'Não foi possível alterar o aviso agora.');
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className={cn('inline-flex flex-col gap-1', className)}>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        onClick={alternar}
        data-testid="aviso-preco"
        className="inline-flex items-center gap-2 text-left text-[0.8125rem] text-[var(--content-muted)] hover:text-[var(--content)] min-h-9"
      >
        <span
          aria-hidden
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors',
            ligado ? 'bg-[var(--accent)] border-[var(--accent)]' : 'bg-[var(--surface-sunken)]',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 size-3.5 rounded-full bg-white shadow-[var(--shadow-subtle)] transition-transform',
              ligado ? 'translate-x-[1.125rem]' : 'translate-x-0.5',
            )}
          />
        </span>
        {ligado ? <Bell className="size-3.5" aria-hidden /> : <BellOff className="size-3.5" aria-hidden />}
        Me avise quando o preço baixar
      </button>
      {aviso && (
        <span role="alert" className="text-[0.75rem] text-[var(--color-critical)]">
          {aviso}
        </span>
      )}
    </span>
  );
}
