import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { isIntegrationConfigured } from '@/lib/env';
import { getOwnedSpace, NotSpaceOwnerError, SpaceNotFoundError } from '@/lib/spaces/queries';
import { getLatestListingSuggestion, getListingAiUsage } from '@/lib/listing-ai/queries';
import { MISSING_FIELD_STEP, type MissingField } from '@/lib/listing-ai/schema';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import {
  ApplySuggestionButton,
  DismissSuggestionButton,
  RequestSuggestionForm,
} from '@/components/listing-ai/suggestion-forms';

export const metadata: Metadata = { title: 'Melhorar anúncio · Meus espaços' };
export const dynamic = 'force-dynamic';

/**
 * "Melhorar meu anúncio" (Fase 23). A IA lê o que o anúncio já informa e
 * sugere; nada muda sem o proprietário aceitar, campo por campo. Sem cara
 * de chat: é uma ferramenta de edição, com o atual ao lado do sugerido.
 */
export default async function MelhorarAnuncioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/meus-espacos/${id}/melhorar`);

  let space;
  try {
    space = await getOwnedSpace(id, user.id);
  } catch (err) {
    if (err instanceof NotSpaceOwnerError || err instanceof SpaceNotFoundError) notFound();
    throw err;
  }

  const [ultima, uso] = await Promise.all([getLatestListingSuggestion(id, user.id), getListingAiUsage(user.id, id)]);
  const configurada = isIntegrationConfigured('aiText');
  const semConteudo = (space.title?.trim().length ?? 0) < 10 || (space.description?.trim().length ?? 0) < 20;

  const motivoBloqueio = !configurada
    ? 'As sugestões por IA ainda não estão disponíveis neste app.'
    : semConteudo
      ? 'Escreva o título e a descrição do anúncio antes de pedir sugestões.'
      : uso.usedLast24h >= uso.limitPerDay
        ? `Você já usou os ${uso.limitPerDay} pedidos das últimas 24 horas.`
        : uso.spaceCooldownLeftMinutes > 0
          ? `Você pode pedir de novo para este anúncio em ${uso.spaceCooldownLeftMinutes} ${uso.spaceCooldownLeftMinutes === 1 ? 'minuto' : 'minutos'}.`
          : null;

  const aberta = ultima && ['ready', 'partially_applied', 'applied'].includes(ultima.status) ? ultima : null;
  const c = aberta?.content ?? null;
  const nadaASugerir = c && !c.title && !c.description && c.missingInfo.length === 0 && c.tips.length === 0;

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-3xl px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <Link
          href="/meus-espacos"
          className="inline-flex items-center gap-1.5 text-[0.875rem] text-[var(--content-muted)] hover:text-[var(--content)]"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Meus espaços
        </Link>

        <header className="space-y-1">
          <h1 className="text-[1.75rem] font-semibold">Melhorar anúncio</h1>
          <p className="text-[var(--content-muted)] break-words">{space.title}</p>
        </header>

        <section className="space-y-3">
          <p className="text-[0.9375rem] leading-relaxed">
            A ferramenta lê o que o anúncio já informa e sugere um título e uma descrição mais claros, além do que
            vale acrescentar. Ela não inventa nada: o que o anúncio não diz vira pergunta para você, nunca
            afirmação. <strong className="font-medium">Nada muda no anúncio sem você aceitar.</strong>
          </p>
          <RequestSuggestionForm
            spaceId={id}
            disabledReason={motivoBloqueio}
            hasPrevious={Boolean(ultima)}
            lastFailed={ultima?.status === 'failed'}
          />
          {configurada && (
            <p className="text-[0.75rem] text-[var(--content-subtle)]">
              {uso.usedLast24h} de {uso.limitPerDay} pedidos usados nas últimas 24 horas.
            </p>
          )}
        </section>

        {ultima?.status === 'dismissed' && (
          <p className="text-[0.875rem] text-[var(--content-muted)]">Você descartou as últimas sugestões. O anúncio ficou como estava.</p>
        )}

        {aberta && c && (
          <section aria-labelledby="sugestoes-titulo" className="space-y-5" data-testid="sugestoes">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="sugestoes-titulo" className="text-[1.125rem] font-semibold">
                Sugestões
              </h2>
              {aberta.status !== 'applied' && <DismissSuggestionButton suggestionId={aberta.id} />}
            </div>

            {nadaASugerir && (
              <p className="text-[0.9375rem] text-[var(--content-muted)]">
                Não encontramos melhorias que possam ser feitas só com o que o anúncio informa.
              </p>
            )}

            {c.title && (
              <div className="rounded-[var(--radius-card)] border p-4 space-y-3">
                <h3 className="font-medium">Título</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-[0.75rem] uppercase tracking-wide text-[var(--content-subtle)]">Atual</p>
                    <p className="text-[0.9375rem] break-words">{space.title}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[0.75rem] uppercase tracking-wide text-[var(--accent)]">Sugerido</p>
                    <p className="text-[0.9375rem] font-medium break-words" data-testid="titulo-sugerido">{c.title}</p>
                  </div>
                </div>
                <ApplySuggestionButton suggestionId={aberta.id} field="title" applied={aberta.appliedFields.includes('title')} />
              </div>
            )}

            {c.description && (
              <div className="rounded-[var(--radius-card)] border p-4 space-y-3">
                <h3 className="font-medium">Descrição</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-[0.75rem] uppercase tracking-wide text-[var(--content-subtle)]">Atual</p>
                    <p className="text-[0.875rem] whitespace-pre-line break-words text-[var(--content-muted)]">{space.description}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[0.75rem] uppercase tracking-wide text-[var(--accent)]">Sugerida</p>
                    <p className="text-[0.875rem] whitespace-pre-line break-words" data-testid="descricao-sugerida">{c.description}</p>
                  </div>
                </div>
                <ApplySuggestionButton
                  suggestionId={aberta.id}
                  field="description"
                  applied={aberta.appliedFields.includes('description')}
                />
              </div>
            )}

            {c.missingInfo.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-medium">O que vale acrescentar</h3>
                <ul className="rounded-[var(--radius-card)] border divide-y">
                  {c.missingInfo.map((m) => (
                    <li key={`${m.field}:${m.text}`}>
                      <Link
                        href={`/anunciar/${id}/${MISSING_FIELD_STEP[m.field as MissingField] ?? 'descricao'}`}
                        className="flex items-center justify-between gap-3 px-4 py-3 text-[0.9375rem] hover:bg-[var(--surface-sunken)]"
                      >
                        <span>{m.text}</span>
                        <ChevronRight className="size-4 shrink-0 text-[var(--content-subtle)]" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {c.tips.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-medium">Dicas de organização</h3>
                <ul className="list-disc pl-5 space-y-1 text-[0.9375rem] text-[var(--content-muted)]">
                  {c.tips.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            )}

            {aberta.removedCount > 0 && (
              <p className="text-[0.8125rem] text-[var(--content-subtle)]" data-testid="trechos-retirados">
                {aberta.removedCount === 1
                  ? 'Retiramos 1 trecho da sugestão porque afirmava algo que o anúncio não informa.'
                  : `Retiramos ${aberta.removedCount} trechos da sugestão porque afirmavam algo que o anúncio não informa.`}
              </p>
            )}
          </section>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
