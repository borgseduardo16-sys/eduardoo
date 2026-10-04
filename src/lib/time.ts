/**
 * Relógio de Brasília.
 *
 * Todo horário que a pessoa vê — prazo para responder, prazo para pagar,
 * "regularize até 15:42" — é hora de Brasília, não do servidor nem do
 * navegador. As contas usam o fuso pelo nome (`America/Sao_Paulo`), nunca um
 * "-03:00" fixo: se o horário de verão voltar, nada aqui precisa mudar.
 *
 * Módulo puro: roda no servidor e no navegador.
 */

export const BR_TIME_ZONE = 'America/Sao_Paulo';

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BR_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export type BrParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

export function brParts(d: Date): BrParts {
  const p: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(d)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return {
    year: p.year!,
    month: p.month!,
    day: p.day!,
    hour: p.hour === 24 ? 0 : p.hour!,
    minute: p.minute!,
    second: p.second!,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Data de Brasília em `YYYY-MM-DD`. */
export function brDate(d: Date): string {
  const p = brParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Hora de Brasília em `HH:MM`. */
export function brTime(d: Date): string {
  const p = brParts(d);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Soma dias a uma data `YYYY-MM-DD` (calendário, sem fuso). */
export function addDaysToDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d! + days));
  return t.toISOString().slice(0, 10);
}

/** Data + hora de Brasília para o usuário: "21/11/2026 às 13:00". */
export function formatBrDateTime(d: Date): string {
  const [ano, mes, dia] = brDate(d).split('-');
  return `${dia}/${mes}/${ano} às ${brTime(d)}`;
}

/** Data de Brasília para o usuário: "21/11/2026". */
export function formatBrDate(d: Date): string {
  const [ano, mes, dia] = brDate(d).split('-');
  return `${dia}/${mes}/${ano}`;
}
