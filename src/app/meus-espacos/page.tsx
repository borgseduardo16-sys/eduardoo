import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ImageOff, Plus } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { listOwnerSpaces, countOwnerSpacesByStatus } from '@/lib/spaces/queries';
import { signImagePaths } from '@/lib/storage/signed-urls';
import { formatBRL } from '@/lib/money';
import { spaceTypeLabel, type SpaceTypeKey } from '@/lib/spaces/types';
import { TOTAL_STEPS } from '@/lib/spaces/schemas';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { OwnerSubnav } from '@/components/layout/owner-subnav';
import { SpaceCardActions } from '@/components/anunciar/space-card-actions';
import { PromotionBadge } from '@/components/promotions/promotion-badge';
import { getMonthlyBenefitUsage, getActivePromotionsForSpaces } from '@/lib/promotions/queries';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Meus espaços' };

const FILTROS = [
  { key: 'todos', label: 'Todos', status: undefined },
  { key: 'ativos', label: 'Ativos', status: ['published'] },
  { key: 'rascunhos', label: 'Rascunhos', status: ['draft'] },
  { key: 'alugados', label: 'Alugados', status: ['rented'] },
  { key: 'pausados', label: 'Pausados', status: ['paused'] },
] as const;

const STATUS_BADGE: Record<string, { label: string; tone: BadgeProps['tone'] }> = {
  draft: { label: 'Rascunho', tone: 'neutral' },
  published: { label: 'Publicado', tone: 'positive' },
  paused: { label: 'Pausado', tone: 'caution' },
  rented: { label: 'Alugado', tone: 'accent' },
  archived: { label: 'Arquivado', tone: 'neutral' },
};

export default async function MeusEspacosPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const user = await requireUser('/meus-espacos');
  const { filtro = 'todos' } = await searchParams;

  const ativo = FILTROS.find((f) => f.key === filtro) ?? FILTROS[0];
  const [spaces, contagem, benefitUsage] = await Promise.all([
    listOwnerSpaces(user.id, ativo.status ? [...ativo.status] : undefined),
    countOwnerSpacesByStatus(user.id),
    getMonthlyBenefitUsage(user.id),
  ]);

  const [urls, promocoesPorEspaco] = await Promise.all([
    signImagePaths(spaces.map((s) => s.coverPath).filter(Boolean) as string[]),
    getActivePromotionsForSpaces(spaces.map((s) => s.id)),
  ]);
  const total = Object.values(contagem).reduce((a, b) => a + b, 0);

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <OwnerSubnav active="espacos" />

        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-[1.75rem] font-semibold">Meus espaços</h1>
            <p className="text-[var(--content-muted)]">
              {total === 0
                ? 'Você ainda não tem nenhum anúncio.'
                : `${total} ${total === 1 ? 'anúncio' : 'anúncios'} no total.`}
            </p>
          </div>
          <Link
            href="/anunciar"
            className="shrink-0 inline-flex items-center gap-2 h-11 px-4 font-medium rounded-[var(--radius-field)] bg-[var(--accent)] text-[var(--accent-content)] hover:bg-[var(--accent-hover)] transition-colors"
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden sm:inline">Novo espaço</span>
          </Link>
        </header>

        {total > 0 && (
          <nav aria-label="Filtrar por situação" className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
            {FILTROS.map((f) => {
              const n = f.status ? f.status.reduce((a, s) => a + (contagem[s] ?? 0), 0) : total;
              const selecionado = f.key === ativo.key;
              return (
                <Link
                  key={f.key}
                  href={f.key === 'todos' ? '/meus-espacos' : `/meus-espacos?filtro=${f.key}`}
                  aria-current={selecionado ? 'page' : undefined}
                  className={cn(
                    'shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[var(--radius-pill)]',
                    'text-[0.875rem] border transition-colors',
                    selecionado
                      ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)] font-medium'
                      : 'text-[var(--content-muted)] hover:border-[var(--content-subtle)]',
                  )}
                >
                  {f.label}
                  <span className="tabular-nums text-[0.75rem] opacity-70">{n}</span>
                </Link>
              );
            })}
          </nav>
        )}

        {spaces.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed p-12 text-center space-y-3">
            <p className="font-medium">
              {total === 0 ? 'Nenhum anúncio ainda' : `Nenhum anúncio em "${ativo.label.toLowerCase()}"`}
            </p>
            <p className="text-[0.9375rem] text-[var(--content-muted)] max-w-sm mx-auto leading-relaxed">
              {total === 0
                ? 'Uma garagem parada, um cômodo sem uso, um galpão ocioso — anunciar leva poucos minutos e é gratuito.'
                : 'Tente outro filtro para ver seus outros anúncios.'}
            </p>
            {total === 0 && (
              <Link
                href="/anunciar"
                className="inline-flex items-center gap-2 h-11 px-5 mt-2 font-medium rounded-[var(--radius-field)] bg-[var(--accent)] text-[var(--accent-content)] hover:bg-[var(--accent-hover)] transition-colors"
              >
                <Plus className="size-4" aria-hidden />
                Anunciar meu primeiro espaço
              </Link>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {spaces.map((s) => {
              const badge = STATUS_BADGE[s.status] ?? STATUS_BADGE.draft!;
              const url = s.coverPath ? urls.get(s.coverPath) : null;
              const promocao = promocoesPorEspaco.get(s.id) ?? null;

              return (
                <li key={s.id} className="rounded-[var(--radius-card)] border overflow-hidden">
                  <div className="flex gap-4 p-3 sm:p-4">
                    <div className="relative shrink-0 size-20 sm:size-24 rounded-[var(--radius-field)] overflow-hidden bg-[var(--surface-sunken)] border">
                      {url ? (
                        <Image src={url} alt="" fill sizes="96px" className="object-cover" unoptimized />
                      ) : (
                        <div className="absolute inset-0 grid place-items-center">
                          <ImageOff className="size-5 text-[var(--content-subtle)]" aria-hidden />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="font-medium truncate">
                          {s.title?.trim() || `${spaceTypeLabel(s.type as SpaceTypeKey)} sem título`}
                        </h2>
                        <span className="flex items-center gap-1.5 shrink-0">
                          {promocao && <PromotionBadge type={promocao.type} size="xs" data-testid="promocao-badge" />}
                          <Badge tone={badge.tone}>{badge.label}</Badge>
                        </span>
                      </div>

                      <p className="text-[0.875rem] text-[var(--content-muted)] truncate">
                        {spaceTypeLabel(s.type as SpaceTypeKey)}
                        {s.city && ` · ${s.district ? `${s.district}, ` : ''}${s.city}`}
                      </p>

                      <p className="text-[0.875rem]">
                        {s.status === 'draft' ? (
                          <span className="text-[var(--content-muted)]">
                            Etapa {s.draftStep} de {TOTAL_STEPS}
                            {s.photoCount > 0 && ` · ${s.photoCount} ${s.photoCount === 1 ? 'foto' : 'fotos'}`}
                          </span>
                        ) : (
                          <span className="font-medium tabular-nums">
                            {formatBRL(s.priceMonthlyCents)}
                            <span className="font-normal text-[var(--content-muted)]"> /mês</span>
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="px-3 sm:px-4 pb-3 sm:pb-4">
                    <SpaceCardActions
                      spaceId={s.id} slug={s.slug} title={s.title} status={s.status} draftStep={s.draftStep}
                      activePromotion={promocao} benefitUsage={benefitUsage}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
