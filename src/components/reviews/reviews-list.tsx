import { Star } from 'lucide-react';
import { formatBookingDate } from '@/lib/bookings/format';
import type { SpaceReviewRow } from '@/lib/reviews/queries';

/** Lista de avaliações do espaço — só renderiza quando existe pelo menos uma real. */
export function ReviewsList({ reviews }: { reviews: SpaceReviewRow[] }) {
  if (reviews.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="font-semibold">Avaliações</h2>
      <ul className="space-y-4">
        {reviews.map((r) => (
          <li key={r.id} className="space-y-1 pb-4 border-b last:border-b-0 last:pb-0">
            <div className="flex items-center gap-2">
              <div className="flex" aria-hidden>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={n <= r.rating ? 'size-3.5 text-[var(--accent)]' : 'size-3.5 text-[var(--border-strong)]'}
                    fill={n <= r.rating ? 'currentColor' : 'none'}
                  />
                ))}
              </div>
              <p className="text-[0.8125rem] font-medium">{r.authorName ?? 'Locatário'}</p>
              <p className="text-[0.75rem] text-[var(--content-subtle)]">{formatBookingDate(r.createdAt)}</p>
            </div>
            {r.comment && (
              <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">{r.comment}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
