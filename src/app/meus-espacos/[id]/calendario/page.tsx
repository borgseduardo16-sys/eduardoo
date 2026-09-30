import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { getOwnerCalendarData, occupationRanges, BLOCK_REASON_LABEL } from '@/lib/calendar/queries';
import { buildMonth, parseMonthParam, shiftMonth, monthParam } from '@/lib/calendar/month';
import { formatBookingDate } from '@/lib/bookings/format';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { MonthCalendar, CalendarLegend } from '@/components/calendar/month-calendar';
import { BlockDatesForm, CancelBlockButton } from '@/components/calendar/block-dates-form';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = { title: 'Calendário · Meus espaços' };
export const dynamic = 'force-dynamic';

/** Até quantos meses à frente o calendário navega. */
const MESES_A_FRENTE = 12;

/**
 * Calendário de disponibilidade do proprietário (Fase 23).
 *
 * Mostra o que existe de verdade: a reserva vigente (que ocupa do início em
 * diante — o aluguel é mensal e sem data para terminar), os bloqueios
 * manuais com motivo, "disponível a partir de" e onde começam as
 * solicitações pendentes. Nada aqui é previsão.
 */
export default async function CalendarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireUser(`/meus-espacos/${id}/calendario`);

  const dados = await getOwnerCalendarData(id, user.id);
  if (!dados) notFound();

  const hoje = new Date().toISOString().slice(0, 10);
  const atual = parseMonthParam(undefined, hoje);
  let alvo = parseMonthParam(sp.mes, hoje);
  const limite = shiftMonth(atual.year, atual.month, MESES_A_FRENTE);
  const indice = (m: { year: number; month: number }) => m.year * 12 + m.month;
  if (indice(alvo) < indice(atual)) alvo = atual;
  if (indice(alvo) > indice(limite)) alvo = limite;

  const mes = buildMonth(alvo.year, alvo.month, {
    today: hoje,
    availableFrom: dados.space.availableFrom,
    occupied: occupationRanges(dados.occupations),
    blocked: dados.blocks.map((b) => ({ startsOn: b.startsOn, endsOn: b.endsOn, label: BLOCK_REASON_LABEL[b.reason] })),
    requestStarts: dados.pendingRequests.map((p) => p.startDate),
  });
  const anterior = indice(alvo) > indice(atual) ? shiftMonth(alvo.year, alvo.month, -1) : null;
  const proximo = indice(alvo) < indice(limite) ? shiftMonth(alvo.year, alvo.month, 1) : null;
  const ocupacao = dados.occupations[0] ?? null;

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
          <h1 className="text-[1.75rem] font-semibold">Calendário</h1>
          <p className="text-[var(--content-muted)] break-words">{dados.space.title}</p>
        </header>

        {ocupacao && (
          <Alert tone="info" title="Alugado">
            Desde {formatBookingDate(ocupacao.startDate)}
            {ocupacao.renterPublicName ? `, por ${ocupacao.renterPublicName}` : ''} (código {ocupacao.reference}).
            {ocupacao.endDate
              ? ` Termina em ${formatBookingDate(ocupacao.endDate)}.`
              : ' O aluguel é mensal e sem data para terminar: o espaço fica ocupado até alguém encerrar.'}
          </Alert>
        )}
        {dados.space.status === 'paused' && (
          <Alert tone="warning" title="Anúncio pausado">
            Enquanto estiver pausado, ninguém consegue solicitar, mesmo nos dias livres.
          </Alert>
        )}

        <section aria-labelledby="mes-titulo" className="rounded-[var(--radius-card)] border p-3 sm:p-5 space-y-3" data-testid="calendario-dono">
          <div className="flex items-center justify-between gap-2">
            {anterior ? (
              <Link
                href={`/meus-espacos/${id}/calendario?mes=${monthParam(anterior.year, anterior.month)}`}
                aria-label="Mês anterior"
                className="size-10 grid place-items-center rounded-[var(--radius-field)] hover:bg-[var(--surface-sunken)]"
              >
                <ChevronLeft className="size-5" aria-hidden />
              </Link>
            ) : (
              <span className="size-10" aria-hidden />
            )}
            <h2 id="mes-titulo" className="font-semibold capitalize">
              {mes.label}
            </h2>
            {proximo ? (
              <Link
                href={`/meus-espacos/${id}/calendario?mes=${monthParam(proximo.year, proximo.month)}`}
                aria-label="Próximo mês"
                className="size-10 grid place-items-center rounded-[var(--radius-field)] hover:bg-[var(--surface-sunken)]"
              >
                <ChevronRight className="size-5" aria-hidden />
              </Link>
            ) : (
              <span className="size-10" aria-hidden />
            )}
          </div>
          <MonthCalendar month={mes} showBlockLabels showRequestMarkers />
          <CalendarLegend states={['disponivel', 'ocupado', 'bloqueado', 'antes_disponivel']} withRequests />
        </section>

        {dados.pendingRequests.length > 0 && (
          <p className="text-[0.875rem] text-[var(--content-muted)]">
            {dados.pendingRequests.length === 1
              ? '1 solicitação aguardando sua resposta.'
              : `${dados.pendingRequests.length} solicitações aguardando sua resposta.`}{' '}
            <Link href="/meus-espacos/solicitacoes?filtro=pendentes" className="text-[var(--accent)] underline underline-offset-4">
              Ver solicitações
            </Link>
          </p>
        )}

        <section aria-labelledby="bloqueios-titulo" className="space-y-3">
          <h2 id="bloqueios-titulo" className="font-semibold">
            Datas bloqueadas
          </h2>
          {dados.blocks.length === 0 ? (
            <p className="text-[0.875rem] text-[var(--content-muted)]">Nenhum bloqueio. Todos os dias livres aparecem como disponíveis.</p>
          ) : (
            <ul className="rounded-[var(--radius-card)] border divide-y" data-testid="lista-bloqueios">
              {dados.blocks.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-[0.9375rem]">
                      {formatBookingDate(b.startsOn)}
                      {b.endsOn !== b.startsOn ? ` a ${formatBookingDate(b.endsOn)}` : ''}
                    </p>
                    <p className="text-[0.8125rem] text-[var(--content-muted)] break-words">
                      {BLOCK_REASON_LABEL[b.reason]}
                      {b.note ? ` · ${b.note}` : ''}
                    </p>
                  </div>
                  <CancelBlockButton blockId={b.id} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="bloquear-titulo" className="rounded-[var(--radius-card)] border p-4 sm:p-5 space-y-3">
          <div className="space-y-1">
            <h2 id="bloquear-titulo" className="font-semibold">
              Bloquear datas
            </h2>
            <p className="text-[0.8125rem] text-[var(--content-muted)] leading-relaxed">
              Para manutenção, uso próprio ou viagem. Como o aluguel é mensal e sem data para terminar, um
              bloqueio também impede que um aluguel comece antes dele.
            </p>
          </div>
          <BlockDatesForm spaceId={id} minDate={hoje} />
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
