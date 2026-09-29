import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/dal';
import { getPublicProfile } from '@/lib/profiles/queries';
import { displayNameOr, memberSinceLabel } from '@/lib/profiles/format';
import { getReputation } from '@/lib/reviews/reputation';
import { getOwnerResponseStats } from '@/lib/bookings/response-stats';
import { listReviewsReceived, parsePage } from '@/lib/reviews/queries';
import { listPublishedSpaces } from '@/lib/spaces/queries';
import { listUserFavoriteIds } from '@/lib/favorites/queries';
import { hasBlocked } from '@/lib/safety/queries';
import { buildTrustSignals } from '@/lib/safety/trust';
import { signImagePaths } from '@/lib/storage/signed-urls';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { UserAvatar } from '@/components/profile/user-avatar';
import { TrustSignalList } from '@/components/safety/trust-badges';
import { RatingDistribution, RatingSummaryLine } from '@/components/reviews/rating-summary';
import { ReviewsList } from '@/components/reviews/reviews-list';
import { ResultCard } from '@/components/espacos/result-card';
import { PremiumBadge } from '@/components/promotions/premium-badge';
import { ReportDialog } from '@/components/safety/report-dialog';
import { BlockButton, UnblockButton } from '@/components/safety/block-button';
import { Pager } from '@/components/ui/pager';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const SPACES_PAGE_SIZE = 6;

type Papel = 'proprietario' | 'locatario';
type SearchParams = { papel?: string; avaliacoes?: string; espacos?: string };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const profile = await getPublicProfile(id);
  // Perfil é de pessoa, não de anúncio: não vai para buscador. Quem chega
  // aqui chega pelo anúncio, pela avaliação ou pela solicitação.
  const robots = { index: false, follow: false };
  if (!profile) return { title: 'Perfil não encontrado', robots };
  return { title: `${displayNameOr(profile.publicName)} · Perfil`, robots };
}

/**
 * Perfil público (Fase 21) — o mesmo para quem anuncia, quem aluga e quem
 * faz os dois.
 *
 * Tudo aqui vem do banco e só existe se for real: sem avaliação não há
 * nota, sem anúncio não há seção de espaços, sem verificação não há selo.
 * Nada de telefone, e-mail, CPF, nome completo ou endereço — a consulta
 * nem seleciona esses campos.
 */
export default async function PerfilPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [profile, viewer] = await Promise.all([getPublicProfile(id), getCurrentUser()]);
  if (!profile) notFound();

  const isSelf = viewer?.id === profile.id;
  const nome = displayNameOr(profile.publicName);
  const [reputation, respostas] = await Promise.all([getReputation(profile.id), getOwnerResponseStats(profile.id)]);

  // Aba de avaliações: a que a pessoa pediu, ou a que tem mais a mostrar.
  const papelPadrao: Papel =
    reputation.asOwner.count > 0 || (reputation.asRenter.count === 0 && profile.activeSpacesCount > 0)
      ? 'proprietario'
      : 'locatario';
  const papel: Papel = sp.papel === 'proprietario' || sp.papel === 'locatario' ? sp.papel : papelPadrao;
  const paginaAvaliacoes = parsePage(sp.avaliacoes);
  const paginaEspacos = parsePage(sp.espacos);

  const [reviewsPage, espacos, favoritos, bloqueadoPorMim] = await Promise.all([
    listReviewsReceived(profile.id, papel === 'proprietario' ? 'renter_to_space' : 'owner_to_renter', {
      page: paginaAvaliacoes,
    }),
    profile.activeSpacesCount > 0
      ? listPublishedSpaces({
          ownerId: profile.id,
          sort: 'recent',
          limit: SPACES_PAGE_SIZE + 1,
          offset: (paginaEspacos - 1) * SPACES_PAGE_SIZE,
        })
      : Promise.resolve([]),
    viewer ? listUserFavoriteIds(viewer.id) : Promise.resolve(new Set<string>()),
    viewer && !isSelf ? hasBlocked(viewer.id, profile.id) : Promise.resolve(false),
  ]);

  const espacosVisiveis = espacos.slice(0, SPACES_PAGE_SIZE);
  const urls = await signImagePaths(
    [
      profile.avatarPath,
      ...reviewsPage.rows.map((r) => r.author.avatarPath),
      ...espacosVisiveis.map((s) => s.coverPath),
    ].filter(Boolean) as string[],
  );

  const resumo = papel === 'proprietario' ? reputation.asOwner : reputation.asRenter;
  const signals = buildTrustSignals({
    createdAt: profile.createdAt,
    emailVerified: profile.emailVerified,
    phoneVerified: profile.phoneVerified,
    identityVerified: profile.identityVerified,
    completedBookings: profile.completedBookingsCount,
    rating: reputation.overall,
    // Só aparece para quem anuncia e já tem solicitações suficientes.
    responseStats: respostas,
  });

  const href = (mudar: Partial<Record<keyof SearchParams, string | number | null>>) => {
    const q = new URLSearchParams();
    const atual: Record<string, string | undefined> = { papel: sp.papel, avaliacoes: sp.avaliacoes, espacos: sp.espacos };
    for (const [k, v] of Object.entries({ ...atual, ...mudar })) {
      if (v != null && v !== '' && !(k !== 'papel' && String(v) === '1')) q.set(k, String(v));
    }
    const s = q.toString();
    return `/perfil/${profile.id}${s ? `?${s}` : ''}`;
  };

  const temAvaliacoes = reputation.overall.count > 0;
  const mostrarAbas = reputation.asOwner.count > 0 && reputation.asRenter.count > 0;

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-3xl px-4 sm:px-6 py-8 sm:py-12 space-y-10">
        {isSelf && (
          <Alert tone="info" title="Este é o seu perfil público">
            É assim que as outras pessoas veem você.{' '}
            <Link href="/minha-conta/perfil" className="underline underline-offset-2">
              Editar perfil
            </Link>
          </Alert>
        )}

        {/* Cabeçalho: foto, nome, desde quando, nota geral */}
        <header className="flex flex-col sm:flex-row sm:items-center gap-5">
          <UserAvatar url={profile.avatarPath ? (urls.get(profile.avatarPath) ?? null) : null} name={profile.publicName} size="xl" />
          <div className="min-w-0 space-y-2">
            <h1 className="text-[1.75rem] sm:text-[2rem] leading-tight font-semibold break-words">{nome}</h1>
            <p className="text-[var(--content-muted)]">{memberSinceLabel(profile.createdAt)}</p>
            {/* div, não p: PremiumBadge renderiza um <dialog>. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <RatingSummaryLine average={reputation.overall.average} count={reputation.overall.count} />
              {profile.isPremium && <PremiumBadge />}
            </div>
          </div>
        </header>

        {/* Apresentação */}
        {profile.bio ? (
          <section aria-label="Apresentação">
            <p className="text-[1rem] leading-relaxed whitespace-pre-line break-words">{profile.bio}</p>
          </section>
        ) : (
          isSelf && (
            <p className="text-[0.9375rem] text-[var(--content-muted)]">
              Você ainda não escreveu uma apresentação.{' '}
              <Link href="/minha-conta/perfil" className="text-[var(--accent)] underline underline-offset-2">
                Escrever agora
              </Link>
            </p>
          )
        )}

        {/* Verificações e histórico — só o que é real, cada item explicável */}
        <section aria-labelledby="perfil-confianca" className="space-y-3">
          <h2 id="perfil-confianca" className="font-semibold text-[1.125rem]">
            Verificações e histórico
          </h2>
          <TrustSignalList signals={signals} />
          <p className="text-[0.8125rem] text-[var(--content-subtle)]">
            Toque em um item para ver o que ele significa.
          </p>
        </section>

        {/* Espaços anunciados */}
        {profile.activeSpacesCount > 0 && (
          <section aria-labelledby="perfil-espacos" className="space-y-4">
            <h2 id="perfil-espacos" className="font-semibold text-[1.125rem]">
              {profile.activeSpacesCount === 1 ? '1 espaço anunciado' : `${profile.activeSpacesCount} espaços anunciados`}
            </h2>
            <ul className="grid gap-5 sm:grid-cols-2">
              {espacosVisiveis.map((s) => (
                <ResultCard
                  key={s.id}
                  space={s}
                  coverUrl={s.coverPath ? (urls.get(s.coverPath) ?? null) : null}
                  favorited={favoritos.has(s.id)}
                  loggedIn={Boolean(viewer)}
                />
              ))}
            </ul>
            <Pager
              page={paginaEspacos}
              hasMore={espacos.length > SPACES_PAGE_SIZE}
              href={(p) => `${href({ espacos: p })}#perfil-espacos`}
              label="espaços"
            />
          </section>
        )}

        {/* Avaliações recebidas */}
        <section aria-labelledby="perfil-avaliacoes" className="space-y-5" id="avaliacoes">
          <h2 id="perfil-avaliacoes" className="font-semibold text-[1.125rem]">
            Avaliações
          </h2>

          {!temAvaliacoes ? (
            <div className="rounded-[var(--radius-card)] border border-dashed p-6 sm:p-8 text-center space-y-2">
              <p className="text-[0.9375rem]">
                {isSelf ? 'Você ainda não recebeu avaliações.' : `${nome} ainda não recebeu avaliações.`}
              </p>
              <p className="text-[0.8125rem] text-[var(--content-subtle)] max-w-sm mx-auto leading-relaxed">
                Avaliações aparecem depois de uma locação concluída na plataforma — só avalia
                quem alugou de verdade.
              </p>
            </div>
          ) : (
            <>
              {mostrarAbas && (
                <nav aria-label="Tipo de avaliação" className="flex gap-1 border-b">
                  {(
                    [
                      ['proprietario', 'Como proprietário', reputation.asOwner.count],
                      ['locatario', 'Como locatário', reputation.asRenter.count],
                    ] as const
                  ).map(([valor, rotulo, n]) => (
                    <Link
                      key={valor}
                      href={`${href({ papel: valor, avaliacoes: null })}#avaliacoes`}
                      scroll={false}
                      aria-current={papel === valor ? 'page' : undefined}
                      className={cn(
                        '-mb-px px-3 py-2.5 text-[0.9375rem] border-b-2 transition-colors',
                        papel === valor
                          ? 'border-[var(--accent)] text-[var(--content)] font-medium'
                          : 'border-transparent text-[var(--content-muted)] hover:text-[var(--content)]',
                      )}
                    >
                      {rotulo} <span className="tabular-nums text-[var(--content-subtle)]">({n})</span>
                    </Link>
                  ))}
                </nav>
              )}

              {resumo.count > 0 ? (
                <>
                  <div className="space-y-3">
                    {!mostrarAbas && (
                      <p className="text-[0.875rem] text-[var(--content-muted)]">
                        {papel === 'proprietario'
                          ? 'De quem alugou os espaços desta pessoa.'
                          : 'Dos proprietários de quem esta pessoa alugou.'}
                      </p>
                    )}
                    <RatingSummaryLine average={resumo.average} count={resumo.count} size="lg" />
                    <RatingDistribution distribution={resumo.distribution} count={resumo.count} />
                  </div>
                  <ReviewsList
                    reviews={reviewsPage.rows}
                    avatarUrls={urls}
                    viewerId={viewer?.id ?? null}
                    showSpace={papel === 'proprietario'}
                  />
                  <Pager
                    page={reviewsPage.page}
                    hasMore={reviewsPage.hasMore}
                    href={(p) => `${href({ avaliacoes: p })}#avaliacoes`}
                    label="avaliações"
                  />
                </>
              ) : (
                <p className="text-[0.9375rem] text-[var(--content-muted)]">
                  {papel === 'proprietario'
                    ? 'Nenhuma avaliação como proprietário ainda.'
                    : 'Nenhuma avaliação como locatário ainda.'}
                </p>
              )}
            </>
          )}
        </section>

        {/* Denunciar / bloquear — só para quem está logado e não é a própria pessoa */}
        {viewer && !isSelf && (
          <section aria-label="Segurança" className="border-t pt-6 space-y-3">
            <div className="flex flex-wrap items-start gap-3">
              <ReportDialog
                targetType="user"
                targetId={profile.id}
                targetLabel={`o perfil de ${nome}`}
                triggerLabel="Denunciar usuário"
                variant="secondary"
              />
              {bloqueadoPorMim ? <UnblockButton userId={profile.id} /> : <BlockButton userId={profile.id} userName={nome} />}
            </div>
            <p className="text-[0.8125rem] text-[var(--content-subtle)] leading-relaxed max-w-xl">
              {bloqueadoPorMim
                ? 'Você bloqueou esta pessoa. Vocês não conseguem conversar nem iniciar uma nova reserva entre si.'
                : 'Bloquear impede conversa e novas reservas entre vocês, nos dois sentidos. Reservas e pagamentos já em andamento continuam valendo.'}
            </p>
          </section>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
