import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Rocket } from 'lucide-react';
import { db } from '@/db/client';
import { profiles } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { loadDraftStep } from '@/lib/spaces/load-step';
import { getMonthlyBenefitUsage, getActivePromotionForSpace } from '@/lib/promotions/queries';
import { PromoteAfterPublish } from '@/components/promotions/promote-after-publish';

export const metadata: Metadata = { title: 'Turbine seu anúncio' };

/**
 * Etapa opcional exibida uma única vez, logo depois da primeira publicação
 * (ver o redirecionamento condicional em `publishSpaceAction`). Chegar aqui
 * sem o anúncio estar publicado não faz sentido — 404.
 *
 * NÃO redireciona aqui quando `vigente` já existe (ex.: reentrando na URL
 * depois de uma compra confirmada) — um `redirect()' no Server Component
 * dispararia de novo assim que a ATIVAÇÃO GRÁTIS desta própria página
 * terminasse (Server Actions atualizam a árvore de Server Components ao
 * resolver), pulando a confirmação "Promoção ativada" antes de ela aparecer.
 * `PromoteAfterPublish` decide o que mostrar com o dado já em mãos.
 */
export default async function PromoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, space } = await loadDraftStep(id);

  if (space.status !== 'published' || !space.publishedAt) notFound();

  const [uso, vigente, [perfil]] = await Promise.all([
    getMonthlyBenefitUsage(user.id),
    getActivePromotionForSpace(id),
    db.select({ cpfCnpj: profiles.cpfCnpj }).from(profiles).where(eq(profiles.id, user.id)).limit(1),
  ]);

  return (
    <div className="mx-auto max-w-lg px-4 sm:px-6 py-12 sm:py-16 space-y-8">
      <div className="text-center space-y-4">
        <div className="mx-auto size-14 rounded-full grid place-items-center bg-[var(--accent-subtle)]">
          <Rocket className="size-6 text-[var(--accent)]" aria-hidden />
        </div>
        <div className="space-y-2">
          <h1 className="text-[1.5rem] sm:text-[1.75rem] font-semibold">Turbine seu anúncio</h1>
          <p className="text-[var(--content-muted)] leading-relaxed">
            Aumente suas chances de encontrar um interessado, destaque seu imóvel e dê mais
            visibilidade ao anúncio na MyPlace.
          </p>
        </div>
      </div>

      <PromoteAfterPublish
        spaceId={id}
        publishedHref={`/anunciar/${id}/publicado`}
        activePromotion={vigente ? { type: vigente.type } : null}
        premium={uso.premium}
        destaqueBenefit={uso.destaque}
        turboBenefit={uso.turbo}
        cpfSugerido={perfil?.cpfCnpj}
      />
    </div>
  );
}
