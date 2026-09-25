import type { Metadata } from 'next';
import Link from 'next/link';
import { Percent } from 'lucide-react';
import { settingInt } from '@/lib/settings';
import { formatBRL } from '@/lib/money';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';

export const metadata: Metadata = {
  title: 'Taxas',
  description: 'Quanto a MyPlace cobra de quem aluga e de quem anuncia, sem letra miúda.',
};

export const dynamic = 'force-dynamic';

/** Exemplo fixo só para ilustrar o cálculo — não é o preço de nenhum anúncio real. */
const ALUGUEL_EXEMPLO_CENTS = 30000;

export default async function TaxasPage() {
  const [renterFeeBps, ownerFeeBps, minRentCents] = await Promise.all([
    settingInt('fees.renter_fee_bps', 300),
    settingInt('fees.owner_fee_bps', 300),
    settingInt('booking.min_rent_cents', 3500),
  ]);

  const renterPct = (renterFeeBps / 100).toLocaleString('pt-BR');
  const ownerPct = (ownerFeeBps / 100).toLocaleString('pt-BR');

  const renterFeeExemplo = Math.round((ALUGUEL_EXEMPLO_CENTS * renterFeeBps) / 10_000);
  const ownerFeeExemplo = Math.round((ALUGUEL_EXEMPLO_CENTS * ownerFeeBps) / 10_000);

  return (
    <>
      <SiteHeader />

      <main id="conteudo">
        <section className="px-4 sm:px-6 pt-12 pb-10 sm:pt-16">
          <div className="mx-auto max-w-2xl space-y-4">
            <p className="flex items-center gap-1.5 text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--accent)]">
              <Percent className="size-3.5" aria-hidden />
              Taxas
            </p>
            <h1 className="text-[2rem] sm:text-[2.5rem] leading-[1.1] font-semibold">
              Sem letra miúda
            </h1>
            <p className="text-[1.0625rem] text-[var(--content-muted)] leading-relaxed">
              Publicar um anúncio é grátis. A taxa só existe quando um aluguel de verdade
              acontece — e é a mesma para todo mundo, sempre exibida antes de qualquer
              confirmação.
            </p>
          </div>
        </section>

        <section className="px-4 sm:px-6 pb-12">
          <div className="mx-auto max-w-2xl space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[var(--radius-card)] border p-5 sm:p-6 space-y-1.5">
                <p className="text-[0.8125rem] text-[var(--content-subtle)]">Quem aluga paga</p>
                <p className="text-[1.875rem] font-semibold tabular-nums">{renterPct}%</p>
                <p className="text-[0.8125rem] text-[var(--content-muted)] leading-relaxed">
                  Somado ao valor do aluguel, mostrado no checkout antes de confirmar.
                </p>
              </div>
              <div className="rounded-[var(--radius-card)] border p-5 sm:p-6 space-y-1.5">
                <p className="text-[0.8125rem] text-[var(--content-subtle)]">Quem anuncia paga</p>
                <p className="text-[1.875rem] font-semibold tabular-nums">{ownerPct}%</p>
                <p className="text-[0.8125rem] text-[var(--content-muted)] leading-relaxed">
                  Descontado do repasse mensal — você recebe o valor já líquido.
                </p>
              </div>
            </div>

            <div className="rounded-[var(--radius-card)] border p-5 sm:p-6 space-y-3">
              <p className="text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--content-subtle)]">
                Exemplo — aluguel de {formatBRL(ALUGUEL_EXEMPLO_CENTS)}/mês
              </p>
              <div className="space-y-2 text-[0.9375rem]">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--content-muted)]">Locatário paga no total</span>
                  <span className="font-medium tabular-nums">{formatBRL(ALUGUEL_EXEMPLO_CENTS + renterFeeExemplo)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--content-muted)]">Proprietário recebe</span>
                  <span className="font-medium tabular-nums">{formatBRL(ALUGUEL_EXEMPLO_CENTS - ownerFeeExemplo)}</span>
                </div>
              </div>
            </div>

            <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
              Aluguel mínimo de {formatBRL(minRentCents)}/mês — abaixo disso a taxa deixaria de
              cobrir o custo real de processar o pagamento.
            </p>
          </div>
        </section>

        <section className="px-4 sm:px-6 pb-12 sm:pb-16">
          <div className="mx-auto max-w-2xl space-y-4">
            <h2 className="text-[1.375rem] font-semibold">Destaque e Turbo — opcional</h2>
            <p className="text-[0.9375rem] text-[var(--content-muted)] leading-relaxed">
              Além da taxa por aluguel, você pode pagar para dar mais visibilidade a um
              anúncio específico, por um período curto. É opcional, tem preço fixo e nunca
              altera o valor do aluguel.
            </p>
            <Link href="/premium" className="inline-block text-[0.875rem] text-[var(--accent)] underline underline-offset-4">
              Ver preços de Destaque e Turbo
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
