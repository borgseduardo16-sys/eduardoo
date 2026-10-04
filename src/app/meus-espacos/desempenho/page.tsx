import type { Metadata } from 'next';
import { Fragment } from 'react';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/dal';
import { isPremium } from '@/lib/promotions/queries';
import {
  getOwnerPerformance,
  getOwnerPromotionComparisons,
  getOwnerMonthlyHistory,
  ownerFirstPublishedMonth,
  ownerHasAnyActivity,
  MIN_OCCUPANCY_DAYS,
  MIN_VIEWS_FOR_CONVERSION,
} from '@/lib/analytics/queries';
import {
  resolvePeriod,
  resolveMonthPeriod,
  historyMonths,
  toViewBuckets,
  monthLabel,
  type PeriodKey,
} from '@/lib/analytics/period';
import { todayInSaoPaulo } from '@/lib/dates';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { OwnerSubnav } from '@/components/layout/owner-subnav';
import { ViewsChart } from '@/components/analytics/views-chart';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = { title: 'Desempenho' };
export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<string, { label: string; tone: BadgeProps['tone'] }> = {
  published: { label: 'Publicado', tone: 'positive' },
  paused: { label: 'Pausado', tone: 'caution' },
  rented: { label: 'Alugado', tone: 'accent' },
  archived: { label: 'Arquivado', tone: 'neutral' },
  draft: { label: 'Rascunho', tone: 'neutral' },
};

const PRESETS: { key: Exclude<PeriodKey, 'custom'>; label: string }[] = [
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: '3m', label: '3 meses' },
];

const SEM_HISTORICO = 'Os dados de desempenho começarão a aparecer após seu anúncio receber atividade.';

function dataBr(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function n(v: number): string {
  return v.toLocaleString('pt-BR');
}

function plural(v: number, um: string, varios: string): string {
  return `${n(v)} ${v === 1 ? um : varios}`;
}

/** 'AAAA-MM' → 'set/2026' */
function mesCurto(m: string): string {
  return `${monthLabel(m).slice(0, 3)}/${m.slice(0, 4)}`;
}

export default async function DesempenhoPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; de?: string; ate?: string; mes?: string }>;
}) {
  const user = await requireUser('/meus-espacos/desempenho');
  const sp = await searchParams;
  const hoje = todayInSaoPaulo();

  const [premium, primeiroMes] = await Promise.all([isPremium(user.id), ownerFirstPublishedMonth(user.id)]);

  if (!primeiroMes) {
    return (
      <>
        <SiteHeader />
        <main id="conteudo" className="mx-auto max-w-3xl px-4 sm:px-6 py-8 sm:py-10 space-y-8">
          <OwnerSubnav active="desempenho" />
          <header className="space-y-1">
            <h1 className="text-[1.75rem] font-semibold">Desempenho</h1>
          </header>
          <Alert tone="info" title="Nada para mostrar ainda">
            {SEM_HISTORICO}{' '}
            <Link href="/anunciar" className="text-[var(--accent)] underline underline-offset-4">
              Anunciar um espaço
            </Link>
          </Alert>
        </main>
        <SiteFooter />
      </>
    );
  }

  const mes = resolveMonthPeriod(sp.mes, { today: hoje, premium, firstMonth: primeiroMes });
  const base = resolvePeriod(sp, { today: hoje, premium });
  const periodo = mes.period ?? base.period;
  const avisoPremium = sp.mes ? mes.blockedPremium : base.blockedPremium;
  const mesIndisponivel = Boolean(sp.mes) && !mes.period && !mes.blockedPremium;
  const pediuPersonalizado = !sp.mes && sp.periodo === 'custom' && premium;
  // Só é "inválido" quando mandou datas; abrir o formulário sem datas é normal.
  const personalizadoInvalido = pediuPersonalizado && Boolean(sp.de || sp.ate) && base.period.key !== 'custom';

  const meses = historyMonths({ today: hoje, premium, firstMonth: primeiroMes });
  const [perf, promo, historico, teveAtividade] = await Promise.all([
    getOwnerPerformance(user.id, periodo, hoje),
    getOwnerPromotionComparisons(user.id, periodo, hoje),
    meses ? getOwnerMonthlyHistory(user.id, meses, hoje) : Promise.resolve([]),
    ownerHasAnyActivity(user.id),
  ]);

  const t = perf.totals;
  const barras = toViewBuckets(perf.viewsByDay);
  const porSemana = barras.length > 0 && barras[0]!.from !== barras[0]!.to;
  const visualizacoesContadas = perf.viewsByDay.some((d) => d.views !== null);
  const conversao = t.views >= MIN_VIEWS_FOR_CONVERSION
    ? Math.round((t.requests / t.views) * 1000) / 10
    : null;

  const indicadores: { label: string; valor: string; nota?: string }[] = [
    {
      label: 'Visualizações',
      valor: visualizacoesContadas ? n(t.views) : '—',
      nota: visualizacoesContadas ? undefined : 'sem dado neste período',
    },
    { label: 'Compartilhamentos', valor: visualizacoesContadas ? n(t.shares) : '—' },
    { label: 'Favoritos', valor: n(t.favoritesNew), nota: `${n(t.favoritesNow)} salvos agora` },
    { label: 'Solicitações', valor: n(t.requests) },
    { label: 'Reservas iniciadas', valor: n(t.reservationsStarted), nota: 'com pagamento confirmado' },
    { label: 'Receita confirmada', valor: formatBRL(t.revenueCents), nota: 'sua parte, já sem a taxa' },
  ];

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-3xl px-4 sm:px-6 py-8 sm:py-10 space-y-8">
        <OwnerSubnav active="desempenho" />

        <header className="space-y-1">
          <h1 className="text-[1.75rem] font-semibold">Desempenho</h1>
          <p className="text-[var(--content-muted)]">
            Números reais dos seus anúncios. Você vê totais — nunca quem viu, quem salvou ou de onde.
          </p>
        </header>

        {/* Filtro de período: uma linha, acima de tudo o que ele filtra */}
        <section aria-label="Período" className="space-y-3">
          <nav aria-label="Escolher período" className="flex flex-wrap items-center gap-1.5">
            {PRESETS.map((p) => {
              const selecionado = periodo.key === p.key && !pediuPersonalizado;
              const soPremium = p.key === '3m' && !premium;
              if (soPremium) {
                return (
                  <span
                    key={p.key}
                    aria-disabled="true"
                    className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[var(--radius-pill)] border border-dashed text-[0.875rem] text-[var(--content-subtle)]"
                  >
                    {p.label}
                    <span className="text-[0.6875rem] font-medium uppercase tracking-wide">Premium</span>
                  </span>
                );
              }
              return (
                <Link
                  key={p.key}
                  href={`/meus-espacos/desempenho?periodo=${p.key}`}
                  aria-current={selecionado ? 'page' : undefined}
                  className={cn(
                    'shrink-0 inline-flex items-center px-3.5 py-2 rounded-[var(--radius-pill)] text-[0.875rem] border transition-colors',
                    selecionado
                      ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)] font-medium'
                      : 'text-[var(--content-muted)] hover:border-[var(--content-subtle)]',
                  )}
                >
                  {p.label}
                </Link>
              );
            })}
            {premium ? (
              <Link
                href="/meus-espacos/desempenho?periodo=custom"
                aria-current={pediuPersonalizado ? 'page' : undefined}
                className={cn(
                  'shrink-0 inline-flex items-center px-3.5 py-2 rounded-[var(--radius-pill)] text-[0.875rem] border transition-colors',
                  pediuPersonalizado
                    ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)] font-medium'
                    : 'text-[var(--content-muted)] hover:border-[var(--content-subtle)]',
                )}
              >
                Personalizado
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[var(--radius-pill)] border border-dashed text-[0.875rem] text-[var(--content-subtle)]"
              >
                Personalizado
                <span className="text-[0.6875rem] font-medium uppercase tracking-wide">Premium</span>
              </span>
            )}
          </nav>

          {pediuPersonalizado && (
            <form method="get" action="/meus-espacos/desempenho" className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="periodo" value="custom" />
              <label className="space-y-1 text-[0.8125rem] text-[var(--content-muted)]">
                <span className="block">De</span>
                <input
                  type="date"
                  name="de"
                  required
                  min={`${primeiroMes}-01`}
                  max={hoje}
                  defaultValue={periodo.key === 'custom' ? periodo.from : undefined}
                  className="h-10 px-3 rounded-[var(--radius-field)] border bg-[var(--surface)] text-[var(--content)]"
                />
              </label>
              <label className="space-y-1 text-[0.8125rem] text-[var(--content-muted)]">
                <span className="block">Até</span>
                <input
                  type="date"
                  name="ate"
                  required
                  min={`${primeiroMes}-01`}
                  max={hoje}
                  defaultValue={periodo.key === 'custom' ? periodo.to : undefined}
                  className="h-10 px-3 rounded-[var(--radius-field)] border bg-[var(--surface)] text-[var(--content)]"
                />
              </label>
              <button
                type="submit"
                className="h-10 px-4 rounded-[var(--radius-field)] bg-[var(--accent)] text-[var(--accent-content)] font-medium hover:bg-[var(--accent-hover)]"
              >
                Ver período
              </button>
              {periodo.key !== 'custom' && !personalizadoInvalido && (
                <p className="basis-full text-[0.8125rem] text-[var(--content-muted)]">
                  Escolha as datas (até um ano). Enquanto isso, os números abaixo são dos últimos 30 dias.
                </p>
              )}
            </form>
          )}

          {!premium && (
            <p className="text-[0.8125rem] text-[var(--content-muted)]">
              3 meses, período personalizado e o histórico mensal completo fazem parte do{' '}
              <Link href="/premium" className="text-[var(--accent)] underline underline-offset-4">Premium</Link>.
            </p>
          )}

          {avisoPremium && (
            <Alert tone="info" title="Esse período faz parte do Premium">
              Mostrando {periodo.label.toLowerCase()}.
            </Alert>
          )}
          {mesIndisponivel && (
            <Alert tone="info" title="Não há relatório para esse mês">
              Só existem relatórios a partir do mês do seu primeiro anúncio publicado. Mostrando {periodo.label.toLowerCase()}.
            </Alert>
          )}
          {personalizadoInvalido && (
            <Alert tone="warning" title="Não deu para usar essas datas">
              Escolha um início antes do fim, sem datas no futuro, e no máximo um ano. Mostrando {periodo.label.toLowerCase()}.
            </Alert>
          )}

          <p className="text-[0.9375rem]">
            <span className="font-medium">
              {periodo.key === 'month' ? `Relatório de ${periodo.label}` : periodo.key === 'custom' ? 'Período personalizado' : periodo.label}
            </span>
            <span className="text-[var(--content-muted)]"> · {dataBr(periodo.from)} a {dataBr(periodo.to)}</span>
            {periodo.key === 'month' && (
              <>
                {' · '}
                <Link href="/meus-espacos/desempenho" className="text-[var(--accent)] underline underline-offset-4">
                  voltar aos últimos 30 dias
                </Link>
              </>
            )}
          </p>
        </section>

        {!teveAtividade && (
          <Alert tone="info" title="Ainda sem atividade">{SEM_HISTORICO}</Alert>
        )}

        {/* Indicadores do período */}
        <section aria-labelledby="titulo-resumo" className="space-y-3">
          <h2 id="titulo-resumo" className="sr-only">Resumo do período</h2>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-px overflow-hidden rounded-[var(--radius-card)] border bg-[var(--border)]">
            {indicadores.map((k) => (
              <div key={k.label} className="bg-[var(--surface)] p-4 space-y-0.5">
                <dt className="text-[0.75rem] text-[var(--content-subtle)]">{k.label}</dt>
                <dd className="text-[1.375rem] font-semibold leading-tight">{k.valor}</dd>
                {k.nota && <dd className="text-[0.75rem] text-[var(--content-subtle)]">{k.nota}</dd>}
              </div>
            ))}
          </dl>
          <p className="text-[0.8125rem] text-[var(--content-muted)]">
            {conversao !== null
              ? `Conversão: ${conversao.toLocaleString('pt-BR')}% — ${plural(t.requests, 'solicitação', 'solicitações')} para ${plural(t.views, 'visualização', 'visualizações')}.`
              : `A conversão (solicitações ÷ visualizações) aparece a partir de ${MIN_VIEWS_FOR_CONVERSION} visualizações no período.`}
            {t.rentalsEnded > 0 && ` ${plural(t.rentalsEnded, 'locação encerrada', 'locações encerradas')} no período.`}
          </p>
        </section>

        {/* Visualizações ao longo do tempo */}
        <section aria-labelledby="titulo-visualizacoes" className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="titulo-visualizacoes" className="font-semibold">
              Visualizações por {porSemana ? 'semana' : 'dia'}
            </h2>
            {visualizacoesContadas && (
              <p className="text-[0.8125rem] text-[var(--content-muted)]">{n(t.views)} no período</p>
            )}
          </div>

          {!visualizacoesContadas ? (
            <p className="text-[0.9375rem] text-[var(--content-muted)]">
              A contagem de visualizações começou em {perf.countingSince ? dataBr(perf.countingSince) : 'breve'} — não
              existe dado de visitas antes disso, e não mostramos número inventado.
            </p>
          ) : t.views === 0 ? (
            <p className="text-[0.9375rem] text-[var(--content-muted)]">Nenhuma visualização contada neste período.</p>
          ) : (
            <>
              <div className="pt-12">
                <ViewsChart buckets={barras} countingSince={perf.countingSince} />
              </div>
              {perf.viewsByDay.some((d) => d.views === null) && perf.countingSince && (
                <p className="text-[0.8125rem] text-[var(--content-muted)]">
                  A área hachurada é antes de {dataBr(perf.countingSince)}, quando a contagem começou: sem dado, não zero.
                </p>
              )}
              <details className="text-[0.875rem]">
                <summary className="cursor-pointer text-[var(--accent)] font-medium">Ver os números em tabela</summary>
                <div className="mt-3 max-h-80 overflow-y-auto rounded-[var(--radius-field)] border">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-[var(--surface-sunken)] text-[0.75rem] text-[var(--content-subtle)]">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-medium">{porSemana ? 'Semana' : 'Dia'}</th>
                        <th scope="col" className="px-3 py-2 font-medium text-right">Visualizações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {barras.map((b) => (
                        <tr key={b.from} className="border-t">
                          <td className="px-3 py-1.5 tabular-nums">
                            {b.from === b.to ? dataBr(b.from) : `${dataBr(b.from)} a ${dataBr(b.to)}`}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {b.value === null ? <span className="text-[var(--content-subtle)]">sem dado</span> : n(b.value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          )}
        </section>

        {/* Por anúncio */}
        <section aria-labelledby="titulo-anuncios" className="space-y-3">
          <h2 id="titulo-anuncios" className="font-semibold">Por anúncio</h2>
          {perf.spaces.length === 0 ? (
            <p className="text-[0.9375rem] text-[var(--content-muted)]">Nenhum anúncio publicado neste período.</p>
          ) : (
            <ul className="divide-y border-y">
              {perf.spaces.map((s) => {
                const badge = s.removed ? STATUS_BADGE.archived! : (STATUS_BADGE[s.status] ?? STATUS_BADGE.published!);
                const publico = !s.removed && (s.status === 'published' || s.status === 'rented');
                const itens = [
                  visualizacoesContadas ? plural(s.views, 'visualização', 'visualizações') : null,
                  plural(s.favoritesNew, 'favorito', 'favoritos'),
                  plural(s.requests, 'solicitação', 'solicitações'),
                  plural(s.reservationsStarted, 'reserva iniciada', 'reservas iniciadas'),
                  s.rentalsEnded > 0 ? plural(s.rentalsEnded, 'locação encerrada', 'locações encerradas') : null,
                  s.shares > 0 ? plural(s.shares, 'compartilhamento', 'compartilhamentos') : null,
                ].filter((x): x is string => Boolean(x));
                return (
                  <li key={s.spaceId} className="py-4 space-y-1.5">
                    <div className="flex items-start justify-between gap-3">
                      {publico ? (
                        <Link href={`/espacos/${s.slug}`} className="font-medium min-w-0 hover:underline underline-offset-4">
                          {s.title}
                        </Link>
                      ) : (
                        <p className="font-medium min-w-0">{s.title}</p>
                      )}
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </div>
                    <p className="text-[0.875rem] text-[var(--content-muted)]">
                      {/* cada número fica junto do que ele conta ("0 reservas iniciadas" nunca quebra no meio) */}
                      {itens.map((item, i) => (
                        <Fragment key={item}>
                          <span className="whitespace-nowrap">{item}{i < itens.length - 1 && ' ·'}</span>
                          {i < itens.length - 1 && ' '}
                        </Fragment>
                      ))}
                    </p>
                    {s.revenueCents > 0 && (
                      <p className="text-[0.875rem]">Receita confirmada: <span className="font-medium">{formatBRL(s.revenueCents)}</span></p>
                    )}
                    <p className="text-[0.8125rem] text-[var(--content-muted)]">
                      {s.occupancy
                        ? s.occupancy.units > 1
                          ? `Em média, ${s.occupancy.percent}% das ${s.occupancy.units} unidades estiveram alugadas no período analisado (${s.occupancy.occupiedDays} de ${s.occupancy.analyzedDays * s.occupancy.units} unidades-dia).`
                          : `Esteve alugado em aproximadamente ${s.occupancy.percent}% do período analisado (${s.occupancy.occupiedDays} de ${s.occupancy.analyzedDays} dias).`
                        : s.removed
                          ? 'Anúncio arquivado — os números acima são do período em que ele esteve no ar.'
                          : `Ocupação: aparece quando o anúncio tem pelo menos ${MIN_OCCUPANCY_DAYS} dias publicados no período.`}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Destaque e Turbo: antes × durante, sem afirmar causa */}
        {promo.promotionsInPeriod > 0 && (
          <section aria-labelledby="titulo-promocoes" className="space-y-3">
            <h2 id="titulo-promocoes" className="font-semibold">Destaque e Turbo</h2>
            {promo.comparisons.length > 0 && (
              <ul className="divide-y border-y">
                {promo.comparisons.map((c) => {
                  const dif = Math.round((c.viewsPerDayDuring - c.viewsPerDayBefore) * 10) / 10;
                  return (
                    <li key={c.promotionId} className="py-4 space-y-1">
                      <p className="font-medium">
                        {c.type === 'turbo' ? 'Turbo' : 'Destaque'} · {c.spaceTitle}
                      </p>
                      <p className="text-[0.8125rem] text-[var(--content-muted)]">
                        {dataBr(c.start)} a {dataBr(c.end)} ({plural(c.daysDuring, 'dia', 'dias')})
                      </p>
                      <p className="text-[0.875rem]">
                        {c.viewsPerDayDuring.toLocaleString('pt-BR')} visualizações por dia durante, contra{' '}
                        {c.viewsPerDayBefore.toLocaleString('pt-BR')} por dia nos {c.daysDuring} dias antes
                        {dif !== 0 && ` (${Math.abs(dif).toLocaleString('pt-BR')} a ${dif > 0 ? 'mais' : 'menos'} por dia)`}.
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            {promo.promotionsInPeriod > promo.comparisons.length && (
              <p className="text-[0.8125rem] text-[var(--content-muted)]">
                {promo.promotionsInPeriod - promo.comparisons.length === 1
                  ? 'Uma promoção deste período ainda não tem dados suficientes para comparar'
                  : `${promo.promotionsInPeriod - promo.comparisons.length} promoções deste período ainda não têm dados suficientes para comparar`}{' '}
                (é preciso ter pelo menos 3 dias de promoção e o mesmo número de dias antes dela já com a contagem de visualizações ativa).
              </p>
            )}
            <p className="text-[0.8125rem] text-[var(--content-muted)]">
              É só uma comparação de antes e durante. Outras coisas também mudam o movimento — época do ano, preço, fotos —,
              então ela não prova que a promoção causou a diferença.
            </p>
          </section>
        )}

        {/* Histórico mês a mês */}
        {historico.length > 0 && (
          <section aria-labelledby="titulo-historico" className="space-y-3">
            <h2 id="titulo-historico" className="font-semibold">Relatório mensal</h2>
            {/* Celular: lista (6 colunas não cabem em 390px sem rolar de lado) */}
            <ul className="sm:hidden divide-y border-y">
              {historico.map((h) => {
                const selecionado = periodo.key === 'month' && periodo.from.slice(0, 7) === h.month;
                const partes = [
                  h.views === null ? 'visualizações: sem dado' : `${plural(h.views, 'visualização', 'visualizações')}${h.viewsCountedFrom ? '*' : ''}`,
                  plural(h.favoritesNew, 'favorito', 'favoritos'),
                  plural(h.requests, 'solicitação', 'solicitações'),
                  plural(h.reservationsStarted, 'reserva iniciada', 'reservas iniciadas'),
                  `${formatBRL(h.revenueCents)} de receita`,
                ];
                return (
                  <li key={h.month}>
                    <Link
                      href={`/meus-espacos/desempenho?mes=${h.month}`}
                      aria-current={selecionado ? 'page' : undefined}
                      className={cn('block py-3 space-y-0.5', selecionado && 'bg-[var(--accent-subtle)] -mx-4 px-4')}
                    >
                      <span className="block font-medium text-[var(--accent)] underline underline-offset-4">
                        {monthLabel(h.month).replace(/^./, (c) => c.toUpperCase())}
                      </span>
                      <span className="block text-[0.8125rem] text-[var(--content-muted)]">
                        {partes.map((item, i) => (
                          <Fragment key={item}>
                            <span className="whitespace-nowrap">{item}{i < partes.length - 1 && ' ·'}</span>
                            {i < partes.length - 1 && ' '}
                          </Fragment>
                        ))}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="hidden sm:block overflow-x-auto rounded-[var(--radius-field)] border">
              <table className="w-full text-left text-[0.8125rem]">
                <thead className="bg-[var(--surface-sunken)] text-[0.75rem] text-[var(--content-subtle)]">
                  <tr>
                    <th scope="col" className="sticky left-0 bg-[var(--surface-sunken)] px-3 py-2 font-medium">Mês</th>
                    <th scope="col" className="px-3 py-2 font-medium text-right">Visualizações</th>
                    <th scope="col" className="px-3 py-2 font-medium text-right">Favoritos</th>
                    <th scope="col" className="px-3 py-2 font-medium text-right">Solicitações</th>
                    <th scope="col" className="px-3 py-2 font-medium text-right">Reservas</th>
                    <th scope="col" className="px-3 py-2 font-medium text-right">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {historico.map((h) => {
                    const selecionado = periodo.key === 'month' && periodo.from.slice(0, 7) === h.month;
                    return (
                      <tr key={h.month} className={cn('border-t', selecionado && 'bg-[var(--accent-subtle)]')}>
                        <th scope="row" className={cn('sticky left-0 px-3 py-2 font-medium whitespace-nowrap', selecionado ? 'bg-[var(--accent-subtle)]' : 'bg-[var(--surface)]')}>
                          <Link
                            href={`/meus-espacos/desempenho?mes=${h.month}`}
                            aria-current={selecionado ? 'page' : undefined}
                            className="text-[var(--accent)] underline underline-offset-4"
                          >
                            {mesCurto(h.month)}
                          </Link>
                        </th>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {h.views === null ? (
                            <span className="text-[var(--content-subtle)]">sem dado</span>
                          ) : (
                            <>
                              {n(h.views)}
                              {h.viewsCountedFrom && <span className="text-[var(--content-subtle)]" title={`contadas a partir de ${dataBr(h.viewsCountedFrom)}`}>*</span>}
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{n(h.favoritesNew)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{n(h.requests)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{n(h.reservationsStarted)}</td>
                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{formatBRL(h.revenueCents)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[0.8125rem] text-[var(--content-muted)]">
              Abra um mês para ver o relatório completo dele.
              {historico.some((h) => h.viewsCountedFrom) && perf.countingSince &&
                ` * Visualizações contadas a partir de ${dataBr(perf.countingSince)}, quando a contagem começou.`}
              {!premium && ' No plano gratuito aparecem o mês passado e o atual; o histórico completo é do Premium.'}
            </p>
          </section>
        )}

        <details className="rounded-[var(--radius-card)] border p-4 sm:p-5 text-[0.875rem]">
          <summary className="cursor-pointer font-medium">Como contamos cada número</summary>
          <dl className="mt-3 space-y-2.5 text-[var(--content-muted)]">
            <div>
              <dt className="font-medium text-[var(--content)]">Visualizações</dt>
              <dd>
                Aberturas da página do anúncio. A mesma pessoa voltando em menos de 30 minutos conta uma vez; robôs,
                pré-visualizações de link e você mesmo não entram.
                {perf.countingSince && ` A contagem começou em ${dataBr(perf.countingSince)} — antes disso não há dado.`}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-[var(--content)]">Compartilhamentos</dt>
              <dd>Toques em “Compartilhar” na página do anúncio.</dd>
            </div>
            <div>
              <dt className="font-medium text-[var(--content)]">Favoritos</dt>
              <dd>Pessoas que salvaram o anúncio no período e continuam com ele salvo. Quem desfez sai da conta.</dd>
            </div>
            <div>
              <dt className="font-medium text-[var(--content)]">Solicitações</dt>
              <dd>Pedidos de aluguel recebidos no período, qualquer que tenha sido a resposta.</dd>
            </div>
            <div>
              <dt className="font-medium text-[var(--content)]">Reservas iniciadas</dt>
              <dd>Aluguéis que começaram de fato no período — o primeiro pagamento foi confirmado. Pedido aceito sem pagamento não conta.</dd>
            </div>
            <div>
              <dt className="font-medium text-[var(--content)]">Receita confirmada</dt>
              <dd>
                Sua parte dos pagamentos confirmados no período, já sem a taxa da plataforma. Cobrança pendente, atrasada
                ou estornada não entra. Não é estimativa.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-[var(--content)]">Ocupação</dt>
              <dd>
                Dias com aluguel em andamento ÷ dias em que o anúncio esteve publicado no período. Dias pausados contam
                como publicados. Só aparece com pelo menos {MIN_OCCUPANCY_DAYS} dias para analisar.
              </dd>
            </div>
          </dl>
        </details>
      </main>

      <SiteFooter />
    </>
  );
}
