/**
 * Relógio de Brasília (Parte 12).
 *
 * Todo horário que a pessoa vê ou escolhe — início da reserva, horário de
 * funcionamento, "o espaço fecha às 21:00" — é hora de Brasília, não do
 * servidor nem do navegador. As contas usam o fuso pelo nome
 * (`America/Sao_Paulo`), nunca um "-03:00" fixo: se o horário de verão
 * voltar, nada aqui precisa mudar.
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

/** Diferença (ms) entre o relógio de Brasília e o UTC naquele instante. */
function brOffsetMs(d: Date): number {
  const p = brParts(d);
  const comoUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return comoUtc - Math.floor(d.getTime() / 1000) * 1000;
}

/** Instante de uma data + hora de Brasília (`2026-10-02`, `14:30`). */
export function brInstant(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const relogio = Date.UTC(y!, m! - 1, d!, h!, mi!);
  // Duas passadas: a segunda corrige a fronteira de uma mudança de fuso.
  let instante = relogio - brOffsetMs(new Date(relogio));
  instante = relogio - brOffsetMs(new Date(instante));
  return new Date(instante);
}

/** `HH:MM` ou `HH:MM:SS` → minutos desde a meia-noite. "24:00" = 1440. */
export function minutesOfDay(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** `07:00:00` → `07:00`. */
export function shortTime(time: string): string {
  return time.slice(0, 5);
}

/** Soma dias a uma data `YYYY-MM-DD` (calendário, sem fuso). */
export function addDaysToDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d! + days));
  return t.toISOString().slice(0, 10);
}
