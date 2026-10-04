import type { Metadata } from 'next';
import Link from 'next/link';
import { Wallet, CircleCheck } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { listOwnerPayments } from '@/lib/bookings/queries';
import {
  getOwnerPayoutAccount,
  listOwnerPayouts,
  getOwnerPayoutSummary,
  listOwnerDeposits,
  listOwnerStatement,
} from '@/lib/payments/queries';
import {
  payoutStatusLabel,
  PAYOUT_STATUS_INFO,
  paymentStatusLabel,
  PAYMENT_STATUS_INFO,
  depositReleaseStatusLabel,
  DEPOSIT_RELEASE_STATUS_INFO,
} from '@/lib/payments/format';
import { formatBRL, formatBps } from '@/lib/money';
import { BOOKING_STATUS_INFO, formatBookingDate, formatDateShort } from '@/lib/bookings/format';
import type { BookingStatus } from '@/lib/bookings/queries';
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
  const [extrato, pagamentos, contaDeRecebimento, repasses, resumoRepasses, caucoes] = await Promise.all([
    listOwnerStatement(user.id),
    listOwnerPayments(user.id),
    getOwnerPayoutAccount(user.id),
    listOwnerPayouts(user.id),
    getOwnerPayoutSummary(user.id),
    listOwnerDeposits(user.id),
  ]);

  // O que entra por mês: só locações já pagas e em andamento. Aceita que ainda não pagou não conta.
  const emAndamento = extrato.filter((l) => l.status === 'active' || l.status === 'past_due');
  const receitaMensal = emAndamento.reduce((soma, l) => soma + l.ownerPayoutCents, 0);
  const totalRecebido = extrato.reduce((soma, l) => soma + l.receivedCents, 0);

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-3xl px-4 sm:px-6 py-8 sm:py-10 space-y-8">
        <OwnerSubnav active="financeiro" />

        <header className="space-y-1">
          <h1 className="text-[1.75rem] font-semibold">Financeiro</h1>
          <p className="text-[var(--content-muted)]">Quanto você recebe por mês em cada locação, já com a taxa de serviço descontada, e o total até agora.</p>
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

        <section className="rounded-[var(--radius-card)] border p-5 sm:p-6 space-y-4" data-testid="resumo-financeiro">
          <div className="space-y-1">
            <p className="text-[0.8125rem] text-[var(--content-muted)]">Você recebe por mês</p>
            <p className="text-[1.875rem] font-semibold tabular-nums">{formatBRL(receitaMensal)}</p>
            <p className="text-[0.8125rem] text-[var(--content-subtle)]">
              Soma de {emAndamento.length} {emAndamento.length === 1 ? 'locação em andamento' : 'locações em andamento'}, já com a taxa de serviço descontada.
              Não é lucro: é receita antes dos seus próprios custos.
            </p>
          </div>
          <div className="space-y-0.5 border-t pt-3">
            <p className="text-[0.8125rem] text-[var(--content-muted)]">Total recebido até agora</p>
            <p className="text-[1.25rem] font-semibold tabular-nums">{formatBRL(totalRecebido)}</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--content-subtle)]">
            Repasses
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[var(--radius-card)] border p-4 space-y-0.5">
              <p className="text-[0.75rem] text-[var(--content-subtle)]">Já pago</p>
              <p className="text-[1.375rem] font-semibold tabular-nums text-[var(--color-positive)]">
                {formatBRL(resumoRepasses.settledCents)}
              </p>
            </div>
            <div className="rounded-[var(--radius-card)] border p-4 space-y-0.5">
              <p className="text-[0.75rem] text-[var(--content-subtle)]">Pendente</p>
              <p className="text-[1.375rem] font-semibold tabular-nums">{formatBRL(resumoRepasses.pendingCents)}</p>
            </div>
          </div>

          {repasses.length === 0 ? (
            <Alert tone="info" title="Nenhum repasse ainda">
              O repasse só existe depois que um pagamento de aluguel é confirmado e recebido
              pela plataforma. Assim que isso acontecer, aparece aqui.
            </Alert>
          ) : (
            <ul className="space-y-2">
              {repasses.map((r) => (
                <li key={r.id} className="rounded-[var(--radius-field)] border p-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.spaceTitle}</p>
                    <p className="text-[0.8125rem] text-[var(--content-muted)]">
                      {r.bookingReference} · {formatBookingDate(r.settledAt ?? r.createdAt)}
                    </p>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className="font-semibold tabular-nums">{formatBRL(r.amountCents)}</p>
                    <Badge tone={PAYOUT_STATUS_INFO[r.status]?.tone ?? 'neutral'}>{payoutStatusLabel(r.status)}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--content-subtle)]">
            Extrato por locação
          </h2>
          {extrato.length === 0 ? (
            <p className="text-[0.9375rem] text-[var(--content-muted)]">
              Nenhuma locação aceita ainda. Solicitações aparecem em{' '}
              <Link href="/meus-espacos/solicitacoes" className="text-[var(--accent)] underline underline-offset-4">
                Solicitações
              </Link>.
            </p>
          ) : (
            <ul className="space-y-2" data-testid="extrato-locacoes">
              {extrato.map((l) => {
                const selo = BOOKING_STATUS_INFO[l.status as BookingStatus] ?? { label: l.status, tone: 'neutral' as const };
                return (
                  <li key={l.bookingId} className="rounded-[var(--radius-field)] border p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/reservas/${l.bookingId}`} className="font-medium truncate block hover:underline">{l.spaceTitle}</Link>
                        <p className="text-[0.8125rem] text-[var(--content-muted)] truncate">
                          {l.renterName ? `${l.renterName} · ` : ''}início em {formatDateShort(l.startDate)} · {l.reference}
                        </p>
                      </div>
                      <Badge tone={selo.tone} className="shrink-0">{selo.label}</Badge>
                    </div>
                    <p className="text-[0.9375rem]">
                      <span className="font-semibold tabular-nums">Você recebe {formatBRL(l.ownerPayoutCents)} por mês</span>
                    </p>
                    <p className="text-[0.8125rem] text-[var(--content-muted)] tabular-nums">
                      Aluguel {formatBRL(l.monthlyRentCents)} − taxa de serviço ({formatBps(l.ownerFeeBps)}) {formatBRL(l.ownerFeeCents)}
                    </p>
                    <p className="text-[0.8125rem] text-[var(--content-muted)] tabular-nums">
                      {l.months > 0
                        ? `Recebido até agora: ${formatBRL(l.receivedCents)} em ${l.months} ${l.months === 1 ? 'mensalidade' : 'mensalidades'}`
                        : 'Nada recebido ainda — o primeiro pagamento ainda não foi confirmado.'}
                    </p>
                  </li>
                );
              })}
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
                    <Badge tone={PAYMENT_STATUS_INFO[p.status]?.tone ?? 'neutral'}>
                      {paymentStatusLabel(p.status)}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--content-subtle)]">
            Cauções (proteção contra dano)
          </h2>
          {caucoes.length === 0 ? (
            <Alert tone="info" title="Nenhuma caução ainda">
              Caução só existe em aluguéis de anúncios com essa proteção ativada. Ative em
              “Editar anúncio → Regras” se algum dos seus espaços não tiver.
            </Alert>
          ) : (
            <ul className="space-y-2">
              {caucoes.map((c) => {
                const cobrada = c.status === 'confirmed' || c.status === 'received';
                return (
                  <li key={c.id} className="rounded-[var(--radius-field)] border p-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{c.spaceTitle}</p>
                      <p className="text-[0.8125rem] text-[var(--content-muted)]">{c.bookingReference}</p>
                      {(c.releaseStatus === 'forfeited' || c.releaseStatus === 'partially_forfeited') && (
                        <p className="text-[0.75rem] text-[var(--content-subtle)]">
                          {formatBRL(c.forfeitedCents ?? 0)} retidos a seu favor — repasse manual, ainda não automático.
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <p className="font-semibold tabular-nums">{formatBRL(c.amountCents)}</p>
                      {cobrada ? (
                        <Badge tone={DEPOSIT_RELEASE_STATUS_INFO[c.releaseStatus]?.tone ?? 'neutral'}>
                          {depositReleaseStatusLabel(c.releaseStatus)}
                        </Badge>
                      ) : (
                        <Badge tone={PAYMENT_STATUS_INFO[c.status]?.tone ?? 'neutral'}>
                          {paymentStatusLabel(c.status)}
                        </Badge>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-dashed p-4">
          <Wallet className="size-4 mt-0.5 shrink-0 text-[var(--content-subtle)]" aria-hidden />
          <p className="text-[0.8125rem] text-[var(--content-muted)] leading-relaxed">
            Valores exibidos aqui são calculados pelo servidor a partir da taxa vigente no
            momento em que cada solicitação foi aceita — nunca digitados manualmente. A taxa
            de uma locação não muda depois do aceite.
          </p>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
