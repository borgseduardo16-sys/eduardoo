'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Heart } from 'lucide-react';
import { toggleFavoriteAction } from '@/lib/favorites/actions';
import { cn } from '@/lib/utils';

/**
 * Coração de favoritar.
 *
 * `useOptimistic` em cima da prop, não em `useState` copiado: o estado real
 * é sempre o que o servidor confirmou. Um clique enche o coração na hora;
 * se o servidor recusar (sessão expirada, por exemplo), a tela volta
 * sozinha e a mensagem explica o motivo — nunca fica um coração cheio que
 * na verdade não foi salvo.
 */
export function FavoriteButton({
  spaceId,
  initialFavorited,
  loggedIn,
  variant = 'card',
  className,
}: {
  spaceId: string;
  initialFavorited: boolean;
  /** Sem sessão, o clique explica o que fazer em vez de tentar e falhar. */
  loggedIn: boolean;
  variant?: 'card' | 'page';
  className?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [favorited, setFavorited] = useOptimistic(initialFavorited);
  const [aviso, setAviso] = useState<string | null>(null);

  function alternar(e: React.MouseEvent) {
    e.preventDefault(); // o botao costuma ficar dentro do <a> do card
    e.stopPropagation();

    if (!loggedIn) {
      setAviso('Entre na sua conta para favoritar.');
      return;
    }
    setAviso(null);

    startTransition(async () => {
      setFavorited(!favorited);
      const fd = new FormData();
      fd.set('spaceId', spaceId);
      const res = await toggleFavoriteAction(fd);
      if (!res.ok) {
        setAviso(res.message ?? 'Não foi possível favoritar agora.');
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={alternar}
        aria-pressed={favorited}
        aria-label={favorited ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
        title={favorited ? 'Remover dos favoritos' : 'Favoritar'}
        data-testid="botao-favoritar"
        className={cn(
          variant === 'card'
            ? 'size-8 grid place-items-center rounded-full bg-[var(--surface)]/90 backdrop-blur-sm shadow-[var(--shadow-subtle)] hover:bg-[var(--surface)]'
            : 'h-11 px-4 inline-flex items-center gap-2 rounded-[var(--radius-field)] border border-[var(--border-strong)] font-medium text-[0.9375rem] hover:bg-[var(--surface-sunken)]',
          className,
        )}
      >
        <Heart
          className={cn(variant === 'card' ? 'size-4' : 'size-4.5')}
          fill={favorited ? 'currentColor' : 'none'}
          strokeWidth={favorited ? 0 : 2}
          aria-hidden
          style={favorited ? { color: 'var(--color-critical)' } : undefined}
        />
        {variant === 'page' && (favorited ? 'Favoritado' : 'Favoritar')}
      </button>

      {aviso && (
        <span
          role="alert"
          className="absolute z-10 top-full mt-2 right-0 w-max max-w-[14rem] px-2.5 py-1.5 rounded-[var(--radius-field)] bg-[var(--content)] text-[var(--surface)] text-[0.75rem] shadow-[var(--shadow-raised)]"
        >
          {aviso}
        </span>
      )}
    </span>
  );
}
