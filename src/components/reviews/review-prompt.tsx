'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ReviewForm } from './review-form';

/**
 * Decide o que mostrar pra um aluguel encerrado: nada (ainda em andamento),
 * "Você já avaliou" (autor já mandou essa avaliação), botão "Avaliar", ou o
 * formulário depois de clicar — mesmo padrão de confirmação em duas etapas
 * de `CancelBookingButton`/`EndBookingButton`.
 */
export function ReviewPrompt({
  bookingId,
  kind,
  status,
  alreadyReviewed,
  label,
  buttonLabel = 'Avaliar',
}: {
  bookingId: string;
  kind: 'renter_to_space' | 'owner_to_renter';
  status: string;
  alreadyReviewed: boolean;
  label: string;
  buttonLabel?: string;
}) {
  const [aberto, setAberto] = useState(false);

  if (status !== 'ended') return null;

  if (alreadyReviewed) {
    return (
      <p className="pt-1 text-[0.8125rem] text-[var(--content-subtle)]">Você já avaliou.</p>
    );
  }

  if (!aberto) {
    return (
      <div className="pt-1">
        <Button type="button" variant="quiet" size="sm" onClick={() => setAberto(true)}>
          {buttonLabel}
        </Button>
      </div>
    );
  }

  return <ReviewForm bookingId={bookingId} kind={kind} label={label} />;
}
