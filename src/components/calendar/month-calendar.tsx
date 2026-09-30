import { cn } from '@/lib/utils';
import {
  DAY_STATE_LABEL,
  DIAS_DA_SEMANA,
  longDate,
  type CalendarMonth,
  type DayState,
} from '@/lib/calendar/month';

/**
 * Um mês do calendário de disponibilidade (Fase 23).
 *
 * Tabela de verdade (<table> com cabeçalho de dias da semana), não uma
 * grade de divs: leitor de tela anuncia "sexta, 9 de novembro: bloqueado".
 * Estado nunca depende só de cor: ocupado é preenchido, bloqueado é
 * hachurado, e a legenda repete isso em texto.
 */

const ESTILO: Record<DayState, string> = {
  passado: 'text-[var(--content-subtle)] opacity-50',
  antes_disponivel: 'text-[var(--content-subtle)] bg-[var(--surface-sunken)]',
  ocupado: 'bg-[var(--accent)] text-[var(--accent-content)] font-medium',
  bloqueado: 'text-[var(--content)] font-medium calendario-hachura',
  disponivel: 'text-[var(--content)]',
};

export function MonthCalendar({
  month,
  showBlockLabels = false,
  showRequestMarkers = false,
  className,
}: {
  month: CalendarMonth;
  /** Só o dono vê o motivo do bloqueio. */
  showBlockLabels?: boolean;
  showRequestMarkers?: boolean;
  className?: string;
}) {
  return (
    <table className={cn('w-full table-fixed border-separate border-spacing-1 text-center', className)}>
      <caption className="sr-only">{month.label}</caption>
      <thead>
        <tr>
          {DIAS_DA_SEMANA.map((d) => (
            <th key={d} scope="col" className="text-[0.6875rem] font-medium uppercase tracking-wide text-[var(--content-subtle)] pb-1">
              {d}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {month.weeks.map((semana, i) => (
          <tr key={i}>
            {semana.map((dia) => {
              if (!dia.inMonth) return <td key={dia.date} aria-hidden className="h-10" />;
              const rotulo = [
                `${longDate(dia.date)}: ${DAY_STATE_LABEL[dia.state].toLowerCase()}`,
                showBlockLabels && dia.blockLabel ? `(${dia.blockLabel})` : null,
                showRequestMarkers && dia.hasRequestStart ? '— solicitação pedindo para começar aqui' : null,
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <td
                  key={dia.date}
                  aria-label={rotulo}
                  title={rotulo}
                  data-estado={dia.state}
                  className={cn(
                    'relative h-10 rounded-[0.5rem] text-[0.875rem] tabular-nums align-middle',
                    ESTILO[dia.state],
                  )}
                >
                  {dia.day}
                  {showRequestMarkers && dia.hasRequestStart && (
                    <span
                      aria-hidden
                      className="absolute bottom-1 left-1/2 -translate-x-1/2 size-1.5 rounded-full bg-[var(--color-caution)]"
                    />
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CalendarLegend({ states, withRequests = false }: { states: DayState[]; withRequests?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[0.75rem] text-[var(--content-muted)]">
      {states.map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <span aria-hidden className={cn('inline-block size-3.5 rounded-[0.25rem] border', ESTILO[s])} />
          {DAY_STATE_LABEL[s]}
        </li>
      ))}
      {withRequests && (
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-1.5 rounded-full bg-[var(--color-caution)]" />
          Início pedido numa solicitação
        </li>
      )}
    </ul>
  );
}
