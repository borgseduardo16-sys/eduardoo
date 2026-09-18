import type { Metadata } from 'next';
import Link from 'next/link';
import { Wallet, CircleCheck } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { listOwnerActiveBookings, listOwnerPayments } from '@/lib/bookings/queries';
import { getOwnerPayoutAccount } from '@/lib/payments/queries';
import { formatBRL } from '@/lib/money';
import { formatBookingDate } from '@/lib/bookings/format';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { OwnerSubnav } from '@/components/layout/owner-subnav';
import { PayoutAccountForm } from '@/components/payments/payout-account-form';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = { title: 'Financeiro' };
export const dynamic = 'force-dynamic';

export default async function FinanceiroPage() {
  const user = await requireUser('/meus-espacos/financeiro');
  const [alugueis, pagamentos, contaDeRecebimento] = await Promise.all([
    listOwnerActiveBookings(user.id),
    listOwnerPayments(user.id),
    getOwnerPayoutAccount(user.id),
  ]);

  const receitaMensalEsperada = alugueis.reduce((soma, a) => soma + a.ownerPayoutCents, 0);

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-3xl px-4 sm:px-6 py-8 sm:py-10 space-y-8">
        <OwnerSubnav active="financeiro" />

        <header className="space-y-1">
          <h1 className="text-[1.75rem] font-semibold">Financeiro</h1>
          <p className="text-[var(--content-muted)]">O que seus aluguéis aceitos representam, e o que já foi pago.</p>
        </header>

        <section className="rounded-[var(--radius-card)] border p-5 sm:p-6 space-y-3">
          <p className="text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--content-subtle)]">
            Conta de recebimento
          </p>
          {contaDeRecebimento?.canReceive ? (
            <p className="flex items-center gap-2 text-[0.9375rem]">
              <CircleCheck className="size-4 text-[var(--color-positive)]" aria-hidden />
              Conta configurada — os repasses vão para ela automaticamente.
            </p>
          ) : (
            <>
              <p className="text-[0.875rem] text-[var(--content-muted)]">
                Sem isso, nenhum pagamento dos seus aluguéis pode ser repassado. Configure agora.
              </p>
              <details className="pt-1">
                <summary className="text-[0.875rem] font-medium text-[var(--accent)] cursor-pointer">
                  Configurar conta de recebimento
                </summary>
                <div className="pt-4">
                  <PayoutAccountForm nomeSugerido={user.fullName ?? undefined} emailSugerido={user.email} />
                </div>
              </details>
            </>
          )}
        </section>

        <section className="rounded-[var(--radius-card)] border p-5 sm:p-6 space-y-1">
          <p className="text-[0.8125rem] text-[var(--content-muted)]">Repasse mensal esperado</p>
          <p className="text-[1.875rem] font-semibold tabular-nums">{formatBRL(receitaMensalEsperada)}</p>
          <p className="text-[0.8125rem] text-[var(--content-subtle)]">
            Soma do que você recebe em {alugueis.length} {alugueis.length === 1 ? 'aluguel aceito' : 'aluguéis aceitos'}, já com a taxa da plataforma descontada — não é lucro, é receita antes dos seus próprios custos.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--content-subtle)]">
            Aluguéis aceitos
          </h2>
          {alugueis.length === 0 ? (
            <p className="text-[0.9375rem] text-[var(--content-muted)]">
              Nenhum aluguel aceito ainda. Solicitações aparecem em{' '}
              <Link href="/meus-espacos/solicitacoes" className="text-[var(--accent)] underline underline-offset-4">
                Solicitações
              </Link>.
            </p>
          ) : (
            <ul className="space-y-2">
              {alugueis.map((a) => (
                <li key={a.id} className="rounded-[var(--radius-field)] border p-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{a.spaceTitle}</p>
                    <p className="text-[0.8125rem] text-[var(--content-muted)]">
                      Aluguel {formatBRL(a.monthlyRentCents)} · taxa {formatBRL(a.ownerFeeCents)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold tabular-nums">{formatBRL(a.ownerPayoutCents)}</p>
                    <p className="text-[0.75rem] text-[var(--content-subtle)]">/mês</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--content-subtle)]">
            Histórico de pagamentos
          </h2>
          {pagamentos.length === 0 ? (
            <Alert tone="info" title="Nenhum pagamento processado ainda">
              A cobrança automática depende da integração com o gateway de pagamento, que
              ainda não está configurada nesta conta. Assim que um pagamento for confirmado
              pelo gateway, ele aparece aqui — nunca antes disso.
            </Alert>
          ) : (
            <ul className="space-y-2">
              {pagamentos.map((p) => (
                <li key={p.id} className="rounded-[var(--radius-field)] border p-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{p.spaceTitle}</p>
                    <p className="text-[0.8125rem] text-[var(--content-muted)]">
                      Vencimento {formatBookingDate(p.dueDate)} · {p.bookingReference}
                    </p>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className="font-semibold tabular-nums">{formatBRL(p.amountCents)}</p>
                    <Badge tone={p.status === 'received' || p.status === 'confirmed' ? 'positive' : p.status === 'overdue' ? 'critical' : 'neutral'}>
                      {p.status}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-dashed p-4">
          <Wallet className="size-4 mt-0.5 shrink-0 text-[var(--content-subtle)]" aria-hidden />
          <p className="text-[0.8125rem] text-[var(--content-muted)] leading-relaxed">
            Valores exibidos aqui são calculados pelo servidor a partir da taxa vigente no
            momento em que cada solicitação foi aceita — nunca digitados manualmente.
          </p>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
