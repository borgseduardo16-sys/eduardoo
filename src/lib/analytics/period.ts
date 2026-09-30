/**
 * Períodos do painel de desempenho (Fase 23). Módulo puro, datas
 * 'AAAA-MM-DD' no calendário de São Paulo.
 *
 * Plano gratuito: 7 e 30 dias, e o relatório do mês passado e do atual.
 * Premium ("painel de desempenho" é benefício do Premium que já existe):
 * também 3 meses, período personalizado e o histórico mensal completo.
 * Nenhuma cobrança nova.
 */

export type PeriodKey = '7d' | '30d' | '3m' | 'custom';

export type Period = {
  /** 'month' = um mês do relatório mensal (?mes=AAAA-MM). */
  key: PeriodKey | 'month';
  /** Inclusivo. */
  from: string;
  /** Inclusivo. */
  to: string;
  days: number;
  label: string;
};

export const PERIOD_LABEL: Record<Exclude<PeriodKey, 'custom'>, string> = {
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  '3m': 'Últimos 3 meses',
};

export const PREMIUM_ONLY_PERIODS: readonly PeriodKey[] = ['3m', 'custom'];

/** Maior período personalizado aceito (evita consulta gigante). */
export const MAX_CUSTOM_DAYS = 366;

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function addDaysIso(iso: string, n: number): string {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetweenInclusive(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000) + 1;
}

function validIso(v: string | undefined): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = toDate(v);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}

function dataCurta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/**
 * Lê o período da URL. Período de Premium pedido por quem não é Premium
 * cai em 30 dias (e a tela diz por quê). Datas inválidas, invertidas, no
 * futuro ou longas demais também caem no padrão — nunca em erro.
 */
export function resolvePeriod(
  params: { periodo?: string; de?: string; ate?: string },
  opts: { today: string; premium: boolean },
): { period: Period; blockedPremium: boolean } {
  const pedido = (['7d', '30d', '3m', 'custom'] as const).find((k) => k === params.periodo) ?? '30d';
  const bloqueado = !opts.premium && PREMIUM_ONLY_PERIODS.includes(pedido);
  const chave: PeriodKey = bloqueado ? '30d' : pedido;
  const hoje = opts.today;

  if (chave === 'custom') {
    const de = validIso(params.de);
    const ate = validIso(params.ate);
    if (de && ate && de <= ate && ate <= hoje && daysBetweenInclusive(de, ate) <= MAX_CUSTOM_DAYS) {
      return {
        period: { key: 'custom', from: de, to: ate, days: daysBetweenInclusive(de, ate), label: `${dataCurta(de)} a ${dataCurta(ate)}` },
        blockedPremium: false,
      };
    }
    return { period: fixed('30d', hoje), blockedPremium: false };
  }
  return { period: fixed(chave, hoje), blockedPremium: bloqueado };
}

function fixed(key: Exclude<PeriodKey, 'custom'>, hoje: string): Period {
  const dias = key === '7d' ? 7 : key === '30d' ? 30 : 90;
  return { key, from: addDaysIso(hoje, -(dias - 1)), to: hoje, days: dias, label: PERIOD_LABEL[key] };
}

/** Mês 'AAAA-MM' → primeiro e último dia. */
export function monthRange(month: string): { from: string; to: string } | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [y, m] = month.split('-').map(Number) as [number, number];
  const from = `${month}-01`;
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { from, to };
}

export function previousMonth(today: string): string {
  const [y, m] = today.slice(0, 7).split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${MESES[m - 1]} de ${y}`;
}

/** Meses de `first` até `last` ('AAAA-MM'), do mais recente ao mais antigo. */
export function monthsBetween(first: string, last: string): string[] {
  const out: string[] = [];
  let [y, m] = last.split('-').map(Number) as [number, number];
  const [fy, fm] = first.split('-').map(Number) as [number, number];
  while (y > fy || (y === fy && m >= fm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m--;
    if (m === 0) {
      m = 12;
      y--;
    }
    if (out.length > 240) break;
  }
  return out;
}

/**
 * Mês pedido na URL (?mes=AAAA-MM) vira período. Gratuito: mês passado e o
 * atual; Premium: qualquer mês desde o primeiro anúncio publicado. Mês antes
 * do primeiro anúncio ou no futuro não existe para este painel (null) — não
 * há o que mostrar ali, e mostrar zeros seria inventar um histórico.
 */
export function resolveMonthPeriod(
  mes: string | undefined,
  opts: { today: string; premium: boolean; firstMonth: string | null },
): { period: Period | null; blockedPremium: boolean } {
  const range = mes ? monthRange(mes) : null;
  if (!mes || !range || !opts.firstMonth) return { period: null, blockedPremium: false };
  const atual = opts.today.slice(0, 7);
  if (mes > atual || mes < opts.firstMonth) return { period: null, blockedPremium: false };
  if (!opts.premium && mes < previousMonth(opts.today)) return { period: null, blockedPremium: true };
  const to = range.to < opts.today ? range.to : opts.today;
  return {
    period: {
      key: 'month',
      from: range.from,
      to,
      days: daysBetweenInclusive(range.from, to),
      label: mes === atual ? `${monthLabel(mes)} (até hoje)` : monthLabel(mes),
    },
    blockedPremium: false,
  };
}

/** Meses que o histórico mostra: Premium, todos desde o primeiro anúncio; gratuito, só o passado e o atual. */
export function historyMonths(opts: { today: string; premium: boolean; firstMonth: string | null }): { first: string; last: string } | null {
  if (!opts.firstMonth) return null;
  const atual = opts.today.slice(0, 7);
  if (opts.firstMonth > atual) return null;
  const anterior = previousMonth(opts.today);
  const first = opts.premium || opts.firstMonth > anterior ? opts.firstMonth : anterior;
  return { first, last: atual };
}

/**
 * Dias → barras do gráfico. Até `maxDaily` dias, uma barra por dia; acima
 * disso, uma por semana (7 dias a partir do início; a última pode ser mais
 * curta). Semana inteira antes da contagem continua "sem dado" (null).
 */
export function toViewBuckets(
  days: { day: string; views: number | null }[],
  maxDaily = 31,
): { from: string; to: string; value: number | null }[] {
  if (days.length <= maxDaily) return days.map((d) => ({ from: d.day, to: d.day, value: d.views }));
  const out: { from: string; to: string; value: number | null }[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const semana = days.slice(i, i + 7);
    const contados = semana.filter((d) => d.views !== null);
    out.push({
      from: semana[0]!.day,
      to: semana[semana.length - 1]!.day,
      value: contados.length === 0 ? null : contados.reduce((s, d) => s + (d.views ?? 0), 0),
    });
  }
  return out;
}
