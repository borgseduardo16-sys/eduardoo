'use client';

import { useFormStatus } from 'react-dom';
import { Check, Loader2 } from 'lucide-react';

/** "Marcar como lida" de UM item, sem abrir o destino. */
export function MarkReadButton({ title }: { title: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={`Marcar como lida: ${title}`}
      title="Marcar como lida"
      className="grid place-items-center size-10 shrink-0 rounded-[var(--radius-field)] text-[var(--content-subtle)] hover:text-[var(--content)] hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-50"
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
    </button>
  );
}
