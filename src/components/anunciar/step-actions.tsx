'use client';

import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Rodapé de navegação das etapas.
 *
 * Fica fixo no rodapé no celular: com o teclado virtual aberto, um botão no
 * fim do formulário exige rolar o dedo até lá toda vez.
 */
export function StepActions({
  backHref,
  submitLabel = 'Continuar',
  isLast = false,
}: {
  backHref?: string;
  submitLabel?: string;
  isLast?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <div
      className={
        'sticky bottom-0 -mx-4 sm:mx-0 mt-8 px-4 sm:px-0 py-4 ' +
        'bg-[var(--surface)]/95 backdrop-blur-sm border-t sm:border-t-0 ' +
        'flex items-center gap-3'
      }
    >
      {backHref ? (
        <Link
          href={backHref}
          aria-label="Voltar para a etapa anterior"
          className={
            'shrink-0 inline-flex items-center gap-2 h-13 px-4 rounded-[var(--radius-field)] ' +
            'text-[var(--content)] hover:bg-[var(--surface-sunken)] transition-colors'
          }
        >
          <ArrowLeft className="size-4" aria-hidden />
          <span className="hidden sm:inline">Voltar</span>
        </Link>
      ) : (
        <span />
      )}

      <Button type="submit" size="lg" loading={pending} className="flex-1">
        {submitLabel}
        {!pending && !isLast && <ArrowRight className="size-4" aria-hidden />}
      </Button>
    </div>
  );
}
