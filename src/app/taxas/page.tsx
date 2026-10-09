import type { Metadata } from 'next';
import Link from 'next/link';
import { Percent } from 'lucide-react';
import { settingInt } from '@/lib/settings';
import { loadFeePolicy } from '@/lib/bookings/fees';
import { computeBookingAmounts, decideOwnerFee, formatBRL, formatBps } from '@/lib/money';
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
  const [politica, minRentCents] = await Promise.all([
    loadFeePolicy(),
    settingInt('booking.min_rent_cents', 3500),
  ]);
  const { renterFeeBps, owner } = politica;

  // As contas do exemplo são as mesmas do repasse de verdade (src/lib/money.ts).
  const padrao = computeBookingAmounts(ALUGUEL_EXEMPLO_CENTS, { renterFeeBps, ownerFeeBps: owner.standardBps });
  const decisaoPremium = decideOwnerFee(ALUGUEL_EXEMPLO_CENTS, true, owner);
  const premium = decisaoPremium.reduced
    ? computeBookingAmounts(ALUGUEL_EXEMPLO_CENTS, { renterFeeBps, ownerFeeBps: decisaoPremium.bps })
    : null;
  // Sem taxa reduzida configurada (ou igual à padrão), a página não promete nada.
  const temTaxaPremium = owner.premiumBps < owner.standardBps;

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
              acontece — e é sempre exibida antes de qualquer confirmação.
            </p>
          </div>
        </section>

        <section className="px-4 sm:px-6 pb-12">
          <div className="mx-auto max-w-2xl space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[var(--radius-card)] border p-5 sm:p-6 space-y-1.5">
                <p className="text-[0.8125rem] text-[var(--content-subtle)]">Quem aluga paga</p>
                <p className="text-[1.875rem] font-semibold tabular-nums">{formatBps(renterFeeBps)}</p>
                <p className="text-[0.8125rem] text-[var(--content-muted)] leading-relaxed">
                  Somado ao valor do aluguel, mostrado no checkout antes de confirmar.
                </p>
              </div>
              <div className="rounded-[var(--radius-card)] border p-5 sm:p-6 space-y-1.5">
                <p className="text-[0.8125rem] text-[var(--content-subtle)]">Quem anuncia paga</p>
                <p className="text-[1.875rem] font-semibold tabular-nums">{formatBps(owner.standardBps)}</p>
                <p className="text-[0.8125rem] text-[var(--content-muted)] leading-relaxed">
                  Descontado do repasse mensal — você recebe o valor já líquido.
                  {temTaxaPremium && (
                    <>
                      {' '}
                      Com o{' '}
                      <Link href="/premium" className="underline underline-offset-2">
                        Premium
                      </Link>
                      , {formatBps(owner.premiumBps)}.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="rounded-[var(--radius-card)] border p-5 sm:p-6 space-y-3">
              <p className="text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--content-subtle)]">
                Exemplo — aluguel de {formatBRL(ALUGUEL_EXEMPLO_CENTS)}/mês
              </p>
              <div className="space-y-2 text-[0.9375rem]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--content-muted)]">Locatário paga no total</span>
                  <span className="font-medium tabular-nums">{formatBRL(padrao.totalChargedCents)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--content-muted)]">
                    Proprietário recebe (taxa de {formatBps(owner.standardBps)})
                  </span>
                  <span className="font-medium tabular-nums">{formatBRL(padrao.ownerPayoutCents)}</span>
                </div>
                {premium && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[var(--content-muted)]">
                      Proprietário com Premium recebe (taxa de {formatBps(premium.ownerFeeBps)})
                    </span>
                    <span className="font-medium tabular-nums">{formatBRL(premium.ownerPayoutCents)}</span>
                  </div>
                )}
              </div>
            </div>

            <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
              Aluguel mínimo de {formatBRL(minRentCents)}/mês — abaixo disso a taxa deixaria de
              cobrir o custo real de processar o pagamento.
            </p>
            {temTaxaPremium && (
              <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
                A taxa de {formatBps(owner.premiumBps)} do Premium vale para aluguéis a partir de{' '}
                {formatBRL(owner.premiumMinRentCents)}/mês, porque abaixo disso o custo fixo do pagamento não cabe numa
                taxa menor. Nesses aluguéis vale a taxa de {formatBps(owner.standardBps)}. A taxa de cada locação é
                calculada quando o proprietário aceita o pedido e acompanha o Premium dele: se o Premium acabar, as
                próximas mensalidades voltam a {formatBps(owner.standardBps)}. A taxa de quem aluga não muda com o
                Premium.
              </p>
            )}
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
