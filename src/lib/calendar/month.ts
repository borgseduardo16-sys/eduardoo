/**
 * Calendário de disponibilidade (Fase 23) — parte pura, sem banco.
 *
 * Recebe os períodos reais (reserva vigente, bloqueios, "disponível a partir
 * de") e devolve o mês pronto para desenhar. O modelo de aluguel é mensal e
 * sem data para terminar: uma reserva vigente ocupa do início em diante, e
 * isso aparece assim no calendário — nunca como uma data de saída inventada.
 */

export type DayState =
  | 'passado'
  | 'antes_disponivel'
  | 'ocupado'
  | 'bloqueado'
  | 'disponivel';

export type CalendarRange = {
  startsOn: string;
  /** Inclusivo. Null = sem fim (aluguel mensal sem data para terminar). */
  endsOn: string | null;
};

export type CalendarInput = {
  today: string;
  availableFrom: string | null;
  occupied: CalendarRange[];
  blocked: (CalendarRange & { label?: string })[];
  /** Datas de início pedidas em solicitações pendentes (só o dono vê). */
  requestStarts?: string[];
};

export type CalendarDay = {
  date: string;
  day: number;
  inMonth: boolean;
  state: DayState;
  /** Motivo do bloqueio — só preenchido quando quem pede pode ver (o dono). */
  blockLabel?: string;
  hasRequestStart: boolean;
};

export type CalendarMonth = {
  year: number;
  month: number; // 1..12
  label: string;
  weeks: CalendarDay[][];
};

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export const DIAS_DA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

function iso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function inRange(date: string, r: CalendarRange): boolean {
  return date >= r.startsOn && (r.endsOn == null || date <= r.endsOn);
}

/** Estado de UM dia. Ordem de precedência explícita: passado, ocupado, bloqueado, antes de disponível, disponível. */
export function dayState(date: string, input: CalendarInput): { state: DayState; blockLabel?: string } {
  if (date < input.today) return { state: 'passado' };
  if (input.occupied.some((r) => inRange(date, r))) return { state: 'ocupado' };
  const bloqueio = input.blocked.find((r) => inRange(date, r));
  if (bloqueio) return { state: 'bloqueado', blockLabel: bloqueio.label };
  if (input.availableFrom && date < input.availableFrom) return { state: 'antes_disponivel' };
  return { state: 'disponivel' };
}

/** "2026-10" → { year, month }. Entrada inválida cai no mês de `today`. */
export function parseMonthParam(value: string | undefined, today: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? '');
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (month >= 1 && month <= 12) return { year, month };
  }
  return { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

export function monthParam(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Semanas de domingo a sábado, com os dias vizinhos do mês anterior/seguinte marcados `inMonth: false`. */
export function buildMonth(year: number, month: number, input: CalendarInput): CalendarMonth {
  const primeiro = new Date(Date.UTC(year, month - 1, 1));
  const diasNoMes = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const inicioSemana = primeiro.getUTCDay(); // 0 = domingo
  const pedidos = new Set(input.requestStarts ?? []);

  const dias: CalendarDay[] = [];
  const cursor = new Date(Date.UTC(year, month - 1, 1 - inicioSemana));
  const totalCelulas = Math.ceil((inicioSemana + diasNoMes) / 7) * 7;
  for (let i = 0; i < totalCelulas; i++) {
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth() + 1;
    const d = cursor.getUTCDate();
    const date = iso(y, m, d);
    const { state, blockLabel } = dayState(date, input);
    dias.push({ date, day: d, inMonth: m === month, state, blockLabel, hasRequestStart: pedidos.has(date) });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < dias.length; i += 7) weeks.push(dias.slice(i, i + 7));
  return { year, month, label: `${MESES[month - 1]} de ${year}`, weeks };
}

export const DAY_STATE_LABEL: Record<DayState, string> = {
  passado: 'Já passou',
  antes_disponivel: 'Ainda não disponível',
  ocupado: 'Alugado',
  bloqueado: 'Bloqueado',
  disponivel: 'Disponível',
};

/** "9 de novembro" — para leitor de tela e listas. */
export function longDate(isoDate: string): string {
  const [, m, d] = isoDate.split('-').map(Number);
  return `${d} de ${MESES[m - 1]}`;
}
