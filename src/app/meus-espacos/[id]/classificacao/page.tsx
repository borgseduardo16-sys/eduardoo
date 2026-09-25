import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { getOwnedSpace, SpaceNotFoundError, NotSpaceOwnerError } from '@/lib/spaces/queries';
import { listQualityAssessments } from '@/lib/quality/queries';
import { spaceTypeLabel, type SpaceTypeKey } from '@/lib/spaces/types';
import { isIntegrationConfigured } from '@/lib/env';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { AssessmentForm } from '@/components/quality/assessment-form';
import { AssessmentResult, AssessmentHistoryList } from '@/components/quality/assessment-result';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = { title: 'Classificação de padrão · Meus espaços' };
export const dynamic = 'force-dynamic';

/**
 * Ferramenta do proprietário (Fase 16) — não é selo público. Ajuda a
 * entender o padrão percebido do próprio espaço (fotos analisadas por IA +
 * localização/estrutura/extras reais), nunca aparece pra quem busca.
 */
export default async function ClassificacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/meus-espacos/${id}/classificacao`);

  let space;
  try {
    space = await getOwnedSpace(id, user.id);
  } catch (err) {
    if (err instanceof SpaceNotFoundError || err instanceof NotSpaceOwnerError) notFound();
    throw err;
  }

  const historico = await listQualityAssessments(id);
  const [mais_recente, ...resto] = historico;
  const configurado = isIntegrationConfigured('aiVision');

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-2xl px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <Link
          href="/meus-espacos"
          className="inline-flex items-center gap-1.5 text-[0.875rem] text-[var(--content-muted)] hover:text-[var(--content)]"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Meus espaços
        </Link>

        <header className="space-y-1">
          <h1 className="text-[1.75rem] font-semibold">Classificação de padrão</h1>
          <p className="text-[var(--content-muted)]">
            {space.title || spaceTypeLabel(space.type as SpaceTypeKey)} · {spaceTypeLabel(space.type as SpaceTypeKey)}
          </p>
        </header>

        {!configurado && (
          <Alert tone="info" title="Classificação por IA ainda não configurada">
            Este recurso precisa de uma credencial real da Anthropic pra analisar as fotos — sem ela, não
            finge um resultado. Veja <code className="text-[0.8125rem]">docs/SETUP.md §10</code>.
          </Alert>
        )}

        {mais_recente && <AssessmentResult assessment={mais_recente} />}
        {resto.length > 0 && <AssessmentHistoryList history={resto} />}

        {space.images.length === 0 ? (
          <Alert tone="info" title="Adicione fotos primeiro">
            A classificação analisa as fotos do anúncio — publique ao menos uma antes de continuar.
          </Alert>
        ) : (
          configurado && <AssessmentForm spaceId={id} hasResult={Boolean(mais_recente)} />
        )}
      </main>

      <SiteFooter />
    </>
  );
}
