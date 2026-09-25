'use client';

import { useActionState, useState } from 'react';
import { Star } from 'lucide-react';
import { createReviewAction, type ReviewActionState } from '@/lib/reviews/actions';
import { Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/auth/form-shell';
import { cn } from '@/lib/utils';

/**
 * Formulário de avaliação — mesmo componente pras duas modalidades
 * (`renter_to_space` e `owner_to_renter`), só muda o rótulo. A trigger
 * `validate_review` (migração 0001) é quem garante que só quem participou
 * do aluguel, já encerrado, consegue avaliar — o formulário só existe onde
 * essas condições já são verdade (ver `EndBookingButton`/status checado
 * antes de renderizar isto).
 */
export function ReviewForm({
  bookingId,
  kind,
  label,
}: {
  bookingId: string;
  kind: 'renter_to_space' | 'owner_to_renter';
  label: string;
}) {
  const [rating, setRating] = useState(0);
  const [state, action] = useActionState<ReviewActionState | undefined, FormData>(
    createReviewAction,
    undefined,
  );

  if (state?.ok) {
    return (
      <div className="pt-1">
        <Alert tone="success">{state.message}</Alert>
      </div>
    );
  }

  return (
    <form action={action} className="pt-1 space-y-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="rating" value={rating || ''} />

      {state?.message && !state.ok && <Alert tone="critical">{state.message}</Alert>}

      <div className="flex items-center gap-2">
        <span className="text-[0.8125rem] text-[var(--content-muted)]">{label}</span>
        <div role="radiogroup" aria-label="Nota de 1 a 5 estrelas" className="flex">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
              onClick={() => setRating(n)}
              className="p-0.5"
            >
              <Star
                className={cn('size-5', n <= rating ? 'text-[var(--accent)]' : 'text-[var(--border-strong)]')}
                fill={n <= rating ? 'currentColor' : 'none'}
                aria-hidden
              />
            </button>
          ))}
        </div>
      </div>

      <Textarea
        name="comment"
        placeholder="Comentário (opcional)"
        maxLength={2000}
        rows={2}
        className="text-[0.875rem] min-h-0"
      />

      <SubmitButton size="sm" block={false} disabled={!rating}>
        Enviar avaliação
      </SubmitButton>
    </form>
  );
}
