'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Sparkle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Selo "✦ Membro Premium" — aparece no perfil do proprietário e nos
 * anúncios dele. Clicar abre um painel explicativo: é também o caminho de
 * descoberta orgânica do Premium (pedido explícito), não só um enfeite.
 *
 * Estrela verde de quatro pontas (`Sparkle`, lucide-react) — pedido
 * explícito de qual ícone usar.
 */
export function PremiumBadge({ className }: { className?: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-1 rounded-[0.375rem] px-2 py-1 text-[0.75rem] font-medium leading-none whitespace-nowrap',
          'bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent)]/25',
          'hover:bg-[var(--accent)]/15 transition-colors',
          className,
        )}
      >
        <Sparkle className="size-3" aria-hidden fill="currentColor" />
        Membro Premium
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false);
        }}
        className={cn(
          'w-[min(24rem,calc(100vw-2rem))] p-0 rounded-[var(--radius-card)]',
          'bg-[var(--surface-raised)] text-[var(--content)]',
          'shadow-[var(--shadow-overlay)] border',
          'backdrop:bg-black/40 backdrop:backdrop-blur-[2px]',
          'open:animate-rise',
        )}
      >
        <div className="flex items-start justify-between gap-4 p-5 pb-3">
          <div className="flex items-center gap-2">
            <Sparkle className="size-4 text-[var(--accent)]" aria-hidden fill="currentColor" />
            <h2 className="text-[1.0625rem] font-semibold">Membro Premium</h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fechar"
            className="shrink-0 -mt-1 -mr-1 p-2 rounded-[var(--radius-field)] text-[var(--content-muted)] hover:bg-[var(--surface-sunken)]"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="p-5 pt-2 space-y-4">
          <ul className="space-y-2 text-[0.875rem] text-[var(--content-muted)]">
            <li>• 2 Destaques gratuitos por mês</li>
            <li>• 1 Turbo gratuito por mês</li>
            <li>• Benefícios renovados mensalmente</li>
            <li>• Não acumulativos</li>
          </ul>
          <Link href="/premium" onClick={() => setOpen(false)}>
            <Button type="button" block>
              Torne-se membro
            </Button>
          </Link>
        </div>
      </dialog>
    </>
  );
}
