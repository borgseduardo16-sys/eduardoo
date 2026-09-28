import Link from 'next/link';
import type { ReviewRow } from '@/lib/reviews/queries';
import { reviewMonthLabel } from '@/lib/reviews/format';
import { displayNameOr } from '@/lib/profiles/format';
import { UserAvatar } from '@/components/profile/user-avatar';
import { ReportDialog } from '@/components/safety/report-dialog';
import { Stars } from './rating-summary';

/**
 * Lista de avaliações reais (anúncio ou perfil).
 *
 * Cada item mostra só o que é público: nome público e foto de quem
 * escreveu (com link para o perfil, se a conta ainda estiver ativa), nota,
 * comentário e o MÊS — não o dia, que ajudaria a cruzar a avaliação com uma
 * reserva específica.
 *
 * "Denunciar avaliação" aparece para quem está logado e não é o autor. A
 * denúncia não tira a avaliação do ar: quem decide é a moderação.
 */
export function ReviewsList({
  reviews,
  avatarUrls,
  viewerId,
  showSpace = false,
}: {
  reviews: ReviewRow[];
  avatarUrls: Map<string, string>;
  viewerId: string | null;
  /** No perfil, diz de qual anúncio foi a locação. */
  showSpace?: boolean;
}) {
  if (reviews.length === 0) return null;

  return (
    <ul className="divide-y">
      {reviews.map((r) => {
        const nome = displayNameOr(r.author.publicName, 'Usuário da MyPlace');
        const avatar = r.author.avatarPath ? (avatarUrls.get(r.author.avatarPath) ?? null) : null;
        return (
          <li key={r.id} className="py-5 first:pt-0 last:pb-0" data-testid="avaliacao">
            <article className="flex items-start gap-3">
              <UserAvatar url={avatar} name={r.author.publicName} size="sm" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  {r.author.active ? (
                    <Link
                      href={`/perfil/${r.author.id}`}
                      className="font-medium text-[0.9375rem] hover:text-[var(--accent)] underline-offset-2 hover:underline break-words"
                    >
                      {nome}
                    </Link>
                  ) : (
                    <span className="font-medium text-[0.9375rem]">{nome}</span>
                  )}
                  <span className="text-[0.8125rem] text-[var(--content-subtle)]">
                    {reviewMonthLabel(r.createdAt)}
                  </span>
                </header>

                <Stars rating={r.rating} />

                {showSpace && r.space && (
                  <p className="text-[0.8125rem] text-[var(--content-muted)]">
                    Locação de{' '}
                    <Link href={`/espacos/${r.space.slug}`} className="underline underline-offset-2 hover:text-[var(--accent)]">
                      {r.space.title}
                    </Link>
                  </p>
                )}

                {r.comment && (
                  <p className="text-[0.9375rem] text-[var(--content-muted)] leading-relaxed whitespace-pre-line break-words">
                    {r.comment}
                  </p>
                )}

                {viewerId && viewerId !== r.author.id && (
                  <ReportDialog
                    targetType="review"
                    targetId={r.id}
                    targetLabel="esta avaliação"
                    triggerLabel="Denunciar avaliação"
                    variant="ghost"
                    className="!h-auto !px-0 !py-0.5 !text-[0.75rem] text-[var(--content-subtle)] hover:!bg-transparent hover:text-[var(--content)] [&_svg]:!size-3"
                  />
                )}
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
