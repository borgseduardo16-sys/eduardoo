'use client';

import { useActionState, useId, useState } from 'react';
import { Star } from 'lucide-react';
import { createReviewAction, type ReviewActionState } from '@/lib/reviews/actions';
import { Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/auth/form-shell';
import { cn } from '@/lib/utils';

const NOTA_TEXTO = ['', 'Ruim', 'Regular', 'Boa', 'Muito boa', 'Excelente'] as const;

/**
 * Formulário de avaliação — mesmo componente pras duas modalidades
 * (`renter_to_space` e `owner_to_renter`), só muda a pergunta.
 *
 * O formulário manda só reserva, tipo, nota e comentário. Quem é o autor
 * sai da sessão; quem recebe, da própria reserva (trigger `validate_review`)
 * — o navegador não escolhe nenhum dos dois, nem consegue avaliar reserva
 * que não encerrou ou da qual não participou.
 *
 * As estrelas são rádios nativos (escondidos visualmente): setas do teclado
 * trocam a nota e o leitor de tela anuncia "3 estrelas, Boa, 3 de 5".
 */
export function ReviewForm({
  bookingId,
  kind,
  label,
}: {
  bookingId: string;
  kind: 'renter_to_space' | 'owner_to_renter';
  /** Pergunta específica do lado: "Como foi alugar este espaço?". */
  label: string;
}) {
  const [rating, setRating] = useState(0);
  const id = useId();
  const [state, action] = useActionState<ReviewActionState | undefined, FormData>(
    createReviewAction,
    undefined,
  );

  if (state?.ok) {
    return (
      <div className="pt-1 animate-rise">
        <Alert tone="success" title="Avaliação enviada">
          Obrigado! Ela já aparece para quem visitar {kind === 'renter_to_space' ? 'o anúncio e o perfil do proprietário' : 'o perfil do locatário'}.
        </Alert>
      </div>
    );
  }

  return (
    <form action={action} className="pt-2 space-y-3 animate-rise">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="kind" value={kind} />

      <div className="space-y-0.5">
        <p className="font-medium">Como foi sua experiência?</p>
        <p className="text-[0.8125rem] text-[var(--content-muted)]">{label}</p>
      </div>

      {state?.message && !state.ok && <Alert tone="critical">{state.message}</Alert>}

      <fieldset className="space-y-1">
        <legend className="sr-only">Nota de 1 a 5 estrelas</legend>
        <div className="flex items-center gap-3">
          <div className="flex">
            {[1, 2, 3, 4, 5].map((n) => (
              <label
                key={n}
                className={cn(
                  'p-1 cursor-pointer rounded-[var(--radius-field)]',
                  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--accent)]',
                )}
              >
                <input
                  type="radio"
                  name="rating"
                  value={n}
                  checked={rating === n}
                  onChange={() => setRating(n)}
                  className="sr-only"
                  required
                />
                <Star
                  className={cn(
                    'size-7 transition-colors',
                    n <= rating ? 'text-[var(--accent)]' : 'text-[var(--border-strong)]',
                  )}
                  fill={n <= rating ? 'currentColor' : 'none'}
                  aria-hidden
                />
                <span className="sr-only">
                  {n} {n === 1 ? 'estrela' : 'estrelas'}, {NOTA_TEXTO[n]}
                </span>
              </label>
            ))}
          </div>
          <span className="text-[0.875rem] text-[var(--content-muted)] min-w-[5rem]" aria-live="polite">
            {rating > 0 ? NOTA_TEXTO[rating] : ''}
          </span>
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor={`${id}-comentario`} className="text-[0.875rem] font-medium">
          Conte como foi sua experiência.{' '}
          <span className="font-normal text-[var(--content-subtle)]">(opcional)</span>
        </label>
        <Textarea
          id={`${id}-comentario`}
          name="comment"
          maxLength={2000}
          rows={3}
          className="text-[0.9375rem]"
          placeholder="O que foi bom, o que poderia melhorar…"
        />
        <p className="text-[0.75rem] text-[var(--content-subtle)]">
          A avaliação fica pública e não pode ser editada depois de enviada. Não inclua telefone,
          e-mail ou endereço.
        </p>
      </div>

      <SubmitButton size="sm" block={false} disabled={!rating}>
        Enviar avaliação
      </SubmitButton>
    </form>
  );
}
