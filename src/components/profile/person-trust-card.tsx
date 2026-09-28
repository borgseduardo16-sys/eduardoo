import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { buildTrustSignals, shouldEmphasizeVisit } from '@/lib/safety/trust';
import { displayNameOr, memberSinceLabel } from '@/lib/profiles/format';
import { UserAvatar } from '@/components/profile/user-avatar';
import { TrustSignalList } from '@/components/safety/trust-badges';
import { RatingSummaryLine } from '@/components/reviews/rating-summary';
import { PremiumBadge } from '@/components/promotions/premium-badge';
import { cn } from '@/lib/utils';

export type TrustPerson = {
  id: string;
  publicName: string | null;
  avatarUrl: string | null;
  bio?: string | null;
  createdAt: Date;
  emailVerified: boolean;
  phoneVerified: boolean;
  identityVerified?: boolean;
  completedBookingsCount: number;
  activeSpacesCount?: number;
  isPremium?: boolean;
  /** Interno (ver `underReview` em safety/trust.ts): nunca exibido, só reforça a visita. */
  underReview?: boolean;
};

/**
 * "Sobre o proprietário" / "Sobre o interessado" (Fase 21).
 *
 * Um componente só para os dois lados da negociação, para os dois verem o
 * mesmo tipo de sinal — e só sinais reais: nota apenas com avaliação,
 * selo apenas com verificação concluída. Premium aparece discreto e à parte:
 * é benefício comercial, não entra na lista de confiança.
 *
 * - `role="owner"`: página do anúncio e tela de solicitação. Reputação
 *   recebida como proprietário.
 * - `role="renter"`: o proprietário olhando quem pediu o espaço.
 *   Reputação recebida como locatário.
 */
export function PersonTrustCard({
  person,
  rating,
  role,
  compact = false,
  className,
}: {
  person: TrustPerson;
  rating: { average: string | null; count: number };
  role: 'owner' | 'renter';
  compact?: boolean;
  className?: string;
}) {
  const nome = displayNameOr(person.publicName);
  // Nota e "desde quando" ficam no cabeçalho; a lista traz o que foi verificado e o histórico.
  const sinais = buildTrustSignals({
    createdAt: person.createdAt,
    emailVerified: person.emailVerified,
    phoneVerified: person.phoneVerified,
    identityVerified: person.identityVerified,
    completedBookings: person.completedBookingsCount,
    rating,
  }).filter((s) => s.key !== 'member_since' && s.key !== 'rating');

  const semAvaliacao =
    role === 'owner'
      ? 'Este proprietário ainda não recebeu avaliações.'
      : 'Ainda não recebeu avaliações como locatário.';

  const enfatizarVisita = shouldEmphasizeVisit({
    createdAt: person.createdAt,
    emailVerified: person.emailVerified,
    phoneVerified: person.phoneVerified,
    completedBookings: person.completedBookingsCount,
    rating,
    underReview: person.underReview,
  });
  const semHistorico = person.completedBookingsCount === 0 && rating.count === 0;

  if (compact) {
    return (
      <div className={cn('space-y-3', className)} data-testid="sobre-pessoa">
        <div className="flex items-start gap-3">
          <UserAvatar url={person.avatarUrl} name={person.publicName} size="md" />
          <div className="min-w-0 space-y-0.5">
            <p className="font-medium break-words">{nome}</p>
            <p className="text-[0.8125rem] text-[var(--content-muted)]">{memberSinceLabel(person.createdAt)}</p>
            {rating.count > 0 ? (
              <RatingSummaryLine average={rating.average} count={rating.count} size="sm" />
            ) : (
              <p className="text-[0.8125rem] text-[var(--content-muted)]">{semAvaliacao}</p>
            )}
          </div>
        </div>
        <TrustSignalList signals={sinais} compact />
        <Link
          href={`/perfil/${person.id}`}
          className="inline-flex items-center gap-1 text-[0.8125rem] text-[var(--accent)] underline-offset-4 hover:underline"
        >
          Ver perfil completo
          <ChevronRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <section
      aria-labelledby={`sobre-${person.id}`}
      className={cn('rounded-[var(--radius-card)] border p-5 sm:p-6 space-y-5', className)}
      data-testid="sobre-pessoa"
    >
      <div className="space-y-4">
        <h2 id={`sobre-${person.id}`} className="font-semibold text-[1.125rem]">
          {role === 'owner' ? 'Sobre o proprietário' : 'Sobre o interessado'}
        </h2>

        <div className="flex items-start gap-4">
          <UserAvatar url={person.avatarUrl} name={person.publicName} size="lg" />
          <div className="min-w-0 space-y-1">
            <p className="font-semibold text-[1.0625rem] break-words">Sobre {nome}</p>
            <p className="text-[0.875rem] text-[var(--content-muted)]">{memberSinceLabel(person.createdAt)}</p>
            {rating.count > 0 ? (
              <RatingSummaryLine average={rating.average} count={rating.count} />
            ) : (
              <p className="text-[0.875rem] text-[var(--content-muted)]">{semAvaliacao}</p>
            )}
            {/* div, não p: PremiumBadge renderiza um <dialog>. */}
            {(Boolean(person.activeSpacesCount) || person.isPremium) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5 text-[0.875rem] text-[var(--content-muted)]">
                {Boolean(person.activeSpacesCount) && (
                  <span>
                    {person.activeSpacesCount === 1 ? '1 espaço ativo' : `${person.activeSpacesCount} espaços ativos`}
                  </span>
                )}
                {person.isPremium && <PremiumBadge />}
              </div>
            )}
          </div>
        </div>

        {person.bio && (
          <p className="text-[0.9375rem] text-[var(--content-muted)] leading-relaxed whitespace-pre-line break-words line-clamp-4">
            {person.bio}
          </p>
        )}

        <Link
          href={`/perfil/${person.id}`}
          className="inline-flex items-center gap-1 text-[0.875rem] font-medium text-[var(--accent)] underline-offset-4 hover:underline"
        >
          Ver perfil de {nome}
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>

      <div className="border-t pt-5 space-y-3">
        <h3 className="font-semibold">
          {role === 'owner' ? 'Por que confiar neste anúncio?' : 'Sinais de confiança'}
        </h3>
        {sinais.length > 0 ? (
          <>
            <TrustSignalList signals={sinais} />
            <p className="text-[0.75rem] text-[var(--content-subtle)]">Toque em um item para ver o que ele significa.</p>
          </>
        ) : (
          <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
            {role === 'owner' ? 'Este proprietário' : 'Esta pessoa'} ainda está começando na MyPlace: ainda
            não há verificações concluídas nem locações encerradas para mostrar.
          </p>
        )}
        {enfatizarVisita && (
          <p className="text-[0.8125rem] text-[var(--content-muted)] leading-relaxed">
            {/* Com histórico, o destaque vem da moderação — e o motivo não é público. */}
            {semHistorico
              ? role === 'owner'
                ? 'Como ainda não há histórico de locações, vale combinar uma visita ao espaço antes de fechar — use o checklist mais abaixo.'
                : 'Como ainda não há histórico de locações, vale conversar pelo chat e combinar uma visita antes de aceitar.'
              : role === 'owner'
                ? 'Recomendamos combinar uma visita ao espaço antes de fechar — use o checklist mais abaixo.'
                : 'Recomendamos conversar pelo chat e combinar uma visita antes de aceitar.'}
          </p>
        )}
      </div>
    </section>
  );
}
