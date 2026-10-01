import { CalendarDays } from 'lucide-react';
import { buildMonth, shiftMonth, type CalendarInput } from '@/lib/calendar/month';
import { formatBookingDate } from '@/lib/bookings/format';
import { MonthCalendar, CalendarLegend } from './month-calendar';

/**
 * Disponibilidade na página pública do anúncio (Fase 23).
 *
 * Só períodos — nunca o motivo de um bloqueio, nem quem aluga. O resumo em
 * texto vem primeiro (é o que a maioria precisa: "posso começar quando?");
 * o calendário fica recolhido para não pesar no celular.
 */
export function PublicAvailability({
  today,
  earliestStart,
  input,
}: {
  today: string;
  /** Primeira data em que um aluguel pode começar (já considerando bloqueios). */
  earliestStart: string;
  input: CalendarInput;
}) {
  const hoje = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
  const seguinte = shiftMonth(hoje.year, hoje.month, 1);
  const meses = [buildMonth(hoje.year, hoje.month, input), buildMonth(seguinte.year, seguinte.month, input)];
  const bloqueiosFuturos = input.blocked.filter((b) => (b.endsOn ?? b.startsOn) >= today);

  return (
    <section aria-labelledby="disponibilidade-titulo" className="space-y-3" data-testid="disponibilidade-publica">
      <h2 id="disponibilidade-titulo" className="font-semibold flex items-center gap-2">
        <CalendarDays className="size-4 text-[var(--accent)]" aria-hidden />
        Disponibilidade
      </h2>
      <p className="text-[0.9375rem]">
        {earliestStart <= today
          ? 'Disponível para começar a partir de hoje.'
          : `Disponível para começar a partir de ${formatBookingDate(earliestStart)}.`}
      </p>
      {bloqueiosFuturos.length > 0 && (
        <ul className="text-[0.8125rem] text-[var(--content-muted)] space-y-0.5">
          {bloqueiosFuturos.map((b) => (
            <li key={b.startsOn}>
              Indisponível de {formatBookingDate(b.startsOn)} a {formatBookingDate(b.endsOn ?? b.startsOn)}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[0.75rem] text-[var(--content-subtle)]">
        O aluguel mensal não tem data para terminar: você fica com o espaço até cancelar.
      </p>
      <details className="rounded-[var(--radius-card)] border group">
        <summary className="cursor-pointer select-none px-4 py-3 text-[0.875rem] font-medium">
          Ver calendário
        </summary>
        <div className="px-2 sm:px-4 pb-4 space-y-4">
          {meses.map((m) => (
            <div key={`${m.year}-${m.month}`} className="space-y-1">
              <p className="text-[0.8125rem] font-medium capitalize px-1">{m.label}</p>
              <MonthCalendar month={m} />
            </div>
          ))}
          <CalendarLegend states={['disponivel', 'bloqueado', 'antes_disponivel']} />
        </div>
      </details>
    </section>
  );
}
