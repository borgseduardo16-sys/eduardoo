import type { Metadata } from 'next';
import Link from 'next/link';
import { Rocket } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { listOwnerPromotions, getMonthlyBenefitUsage } from '@/lib/promotions/queries';
import {
  formatPromotionDateTime, formatPromotionDuration, formatTimeRemaining,
  PROMOTION_STATUS_INFO, PROMOTION_SOURCE_LABEL,
} from '@/lib/promotions/format';
import { formatBRL } from '@/lib/money';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { OwnerSubnav } from '@/components/layout/owner-subnav';
import { PromotionBadge } from '@/components/promotions/promotion-badge';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = { title: 'Promoções' };
export const dynamic = 'force-dynamic';

export default async function PromocoesPage() {
  const user = await requireUser('/meus-espacos/promocoes');
  const [todas, uso] = await Promise.all([
    listOwnerPromotions(user.id, 50),
    getMonthlyBenefitUsage(user.id),
  ]);

  const ativas = todas.filter((p) => p.status === 'active' || p.status === 'scheduled');
  const destaqueAtivos = ativas.filter((p) => p.type === 'destaque').length;
  const turboAtivos = ativas.filter((p) => p.type === 'turbo').length;

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-3xl px-4 sm:px-6 py-8 sm:py-10 space-y-8">
        <OwnerSubnav active="promocoes" />

        <header className="space-y-1">
          <h1 className="text-[1.75rem] font-semibold">Promoções</h1>
          <p className="text-[var(--content-muted)]">
            Destaque e Turbo dos seus anúncios: o que está ativo agora e o histórico completo.
          </p>
        </header>

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-[var(--radius-card)] border p-4 space-y-0.5">
            <p className="text-[0.75rem] text-[var(--content-subtle)]">Em Destaque agora</p>
            <p className="text-[1.375rem] font-semibold tabular-nums">{destaqueAtivos}</p>
          </div>
          <div className="rounded-[var(--radius-card)] border p-4 space-y-0.5">
            <p className="text-[0.75rem] text-[var(--content-subtle)]">Em Turbo agora</p>
            <p className="text-[1.375rem] font-semibold tabular-nums">{turboAtivos}</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--content-subtle)]">
            Ativas agora
          </h2>
          {ativas.length === 0 ? (
            <Alert tone="info" title="Nenhuma promoção ativa">
              Destaque um anúncio em{' '}
              <Link href="/meus-espacos" className="underline underline-offset-2">Meus espaços</Link> pra
              ele aparecer aqui.
            </Alert>
          ) : (
            <ul className="space-y-2">
              {ativas.map((p) => (
                <PromocaoCard key={p.id} promocao={p} mostrarRestante />
              ))}
            </ul>
          )}
        </section>

        {uso.premium && (
          <div className="rounded-[var(--radius-card)] border border-dashed p-4 space-y-1">
            <p className="text-[0.8125rem] font-medium">Benefício Premium deste mês</p>
            <p className="text-[0.8125rem] text-[var(--content-muted)]">
              {uso.destaque.remaining} de {uso.destaque.limit} Destaque{uso.destaque.limit === 1 ? '' : 's'} e{' '}
              {uso.turbo.remaining} de {uso.turbo.limit} Turbo restantes — não acumula pro mês seguinte.
            </p>
          </div>
        )}

        <section className="space-y-3">
          <h2 className="text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--content-subtle)]">
            Histórico
          </h2>
          {todas.length === 0 ? (
            <Alert tone="info" title="Nenhuma promoção ainda">
              Quando você usar um benefício grátis ou comprar Destaque/Turbo, o registro fica
              guardado aqui — modalidade, período, valor pago e datas.
            </Alert>
          ) : (
            <ul className="space-y-2">
              {todas.map((p) => (
                <PromocaoCard key={p.id} promocao={p} />
              ))}
            </ul>
          )}
        </section>

        <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-dashed p-4">
          <Rocket className="size-4 mt-0.5 shrink-0 text-[var(--content-subtle)]" aria-hidden />
          <p className="text-[0.8125rem] text-[var(--content-muted)] leading-relaxed">
            O status muda sozinho quando o período contratado termina — não precisa cancelar nem
            atualizar a página. Cancelar antes do fim não devolve o valor pago nem o benefício usado.
          </p>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

type Row = Awaited<ReturnType<typeof listOwnerPromotions>>[number];

function PromocaoCard({ promocao: p, mostrarRestante = false }: { promocao: Row; mostrarRestante?: boolean }) {
  const statusInfo = PROMOTION_STATUS_INFO[p.status];
  return (
    <li className="rounded-[var(--radius-field)] border p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <PromotionBadge type={p.type} />
            <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
          </div>
          <Link
            href={`/espacos/${p.spaceSlug}`}
            className="block font-medium truncate hover:underline underline-offset-2"
          >
            {p.spaceTitle}
          </Link>
        </div>
        <div className="text-right shrink-0 space-y-0.5">
          <p className="font-semibold tabular-nums">{p.priceCents != null ? formatBRL(p.priceCents) : 'Grátis'}</p>
          <p className="text-[0.75rem] text-[var(--content-subtle)]">{PROMOTION_SOURCE_LABEL[p.source]}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem] text-[var(--content-muted)]">
        <span>Período contratado: {formatPromotionDuration(p.startedAt, p.expiresAt)}</span>
        <span>Início: {formatPromotionDateTime(p.startedAt)}</span>
        <span>Término: {formatPromotionDateTime(p.expiresAt)}</span>
        {mostrarRestante && (p.status === 'active' || p.status === 'scheduled') && (
          <span className="font-medium text-[var(--accent)]">{formatTimeRemaining(p.expiresAt)}</span>
        )}
      </div>
    </li>
  );
}
