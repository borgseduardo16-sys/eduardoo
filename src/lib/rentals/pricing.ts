/**
 * Regras de aluguel e preço (Parte 12) — puro, em centavos inteiros.
 *
 * É a fonte única do valor de uma reserva temporária: o servidor calcula
 * aqui e o banco confere com a MESMA regra (`temporary_rent_cents` na
 * migração 0032) — se as duas divergirem, o INSERT falha. O navegador só
 * usa este módulo para MOSTRAR o valor antes de enviar; o que vale é o que o
 * servidor recalcula.
 *
 * Arredondamento do proporcional: uma única vez, meio para cima, sobre o
 * total (6 horas de uma diária de R$ 200 = R$ 50,00; 5 horas = R$ 41,67).
 * Nunca soma valores já arredondados hora a hora.
 */
import { formatBRL } from '@/lib/money';
import { brParts, minutesOfDay, shortTime } from './time';

export type RentalTimeUnit = 'hour' | 'day' | 'week';
export type TemporaryPricingMode = 'per_period' | 'packages';
export type TemporaryPackage = { units: number; priceCents: number };

/** As regras de um grupo de unidades, como estão no banco. */
export type GroupRules = {
  allowsContinuous: boolean;
  allowsTemporary: boolean;
  monthlyPriceCents: number | null;
  tempPricingMode: TemporaryPricingMode | null;
  tempUnit: RentalTimeUnit | null;
  tempPriceCents: number | null;
  tempMaxUnits: number | null;
  tempAllowFraction: boolean;
  tempPackages: TemporaryPackage[] | null;
  renewalAllowed: boolean;
  hoursMode: 'always' | 'daily';
  opensAt: string | null;
  closesAt: string | null;
};

// ---- Prazos fixos (pedidos na especificação; não são configuráveis) ----
/** Depois do fim, a unidade fica protegida para quem quiser renovar. */
export const RENEWAL_WINDOW_MINUTES = 7;
/** Aviso "Seu aluguel termina em 10 minutos." */
export const ENDING_NOTICE_MINUTES = 10;
/** Cobrança automática falhou: primeira janela para regularizar… */
export const PAYMENT_FIRST_WINDOW_MINUTES = 40;
/** …e a segunda, depois da primeira. Passou disso, o aluguel é encerrado. */
export const PAYMENT_SECOND_WINDOW_MINUTES = 60;
export const PAYMENT_TOTAL_WINDOW_MINUTES = PAYMENT_FIRST_WINDOW_MINUTES + PAYMENT_SECOND_WINDOW_MINUTES;

/** Teto de sanidade de uma cobrança (R$ 1.000.000,00), igual ao do banco. */
export const MAX_RENT_CENTS = 100_000_000;

/** Duração de 1 unidade de tempo. Dia = 24 h, semana = 168 h (igual ao banco). */
export const UNIT_MS: Record<RentalTimeUnit, number> = {
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
};

/** Maior duração que o proprietário pode configurar, por unidade. */
export const MAX_DURATION_UNITS: Record<RentalTimeUnit, number> = { hour: 72, day: 60, week: 26 };

/**
 * Preço proporcional: diária aceita horas (÷ 24); semanal aceita dias (÷ 7).
 * Por hora não tem fração — já é a menor unidade.
 */
function fractionDivisor(rules: GroupRules, unit: RentalTimeUnit): number | null {
  if (!rules.tempAllowFraction || rules.tempPricingMode !== 'per_period') return null;
  if (rules.tempUnit === 'day' && unit === 'hour') return 24;
  if (rules.tempUnit === 'week' && unit === 'day') return 7;
  return null;
}

/**
 * Valor do aluguel temporário (antes da taxa), ou `null` se a duração não
 * vale para este grupo. Espelho exato de `public.temporary_rent_cents`.
 */
export function temporaryRentCents(rules: GroupRules, units: number, unit: RentalTimeUnit): number | null {
  if (!rules.allowsTemporary || !Number.isInteger(units) || units < 1) return null;

  let preco: number;
  if (rules.tempPricingMode === 'packages') {
    if (unit !== rules.tempUnit) return null;
    const pacote = (rules.tempPackages ?? []).find((p) => p.units === units);
    if (!pacote) return null;
    preco = pacote.priceCents;
  } else if (rules.tempPricingMode === 'per_period') {
    if (rules.tempPriceCents == null || rules.tempMaxUnits == null) return null;
    if (unit === rules.tempUnit) {
      if (units > rules.tempMaxUnits) return null;
      preco = rules.tempPriceCents * units;
    } else {
      const divisor = fractionDivisor(rules, unit);
      if (divisor == null || units > rules.tempMaxUnits * divisor) return null;
      preco = Math.floor((rules.tempPriceCents * units * 2 + divisor) / (2 * divisor));
    }
  } else {
    return null;
  }

  if (!Number.isSafeInteger(preco) || preco < 1 || preco > MAX_RENT_CENTS) return null;
  return preco;
}

// ---------------------------------------------------------------------------
// Textos (sem termo técnico: "por hora", "até 5 horas", "máximo 5 horas")
// ---------------------------------------------------------------------------

const UNIT_WORDS: Record<RentalTimeUnit, [string, string]> = {
  hour: ['hora', 'horas'],
  day: ['dia', 'dias'],
  week: ['semana', 'semanas'],
};

export function unitWord(unit: RentalTimeUnit, plural = false): string {
  return UNIT_WORDS[unit][plural ? 1 : 0];
}

/** "1 hora", "5 horas", "2 semanas". */
export function formatDuration(units: number, unit: RentalTimeUnit): string {
  return `${units} ${unitWord(unit, units !== 1)}`;
}

/** Linhas da regra temporária, como o locatário lê no anúncio. */
export function temporaryRuleLines(rules: GroupRules): string[] {
  if (!rules.allowsTemporary || !rules.tempUnit) return [];
  if (rules.tempPricingMode === 'packages') {
    return (rules.tempPackages ?? []).map(
      (p) => `Até ${formatDuration(p.units, rules.tempUnit!)} — ${formatBRL(p.priceCents)}`,
    );
  }
  if (rules.tempPriceCents == null || rules.tempMaxUnits == null) return [];
  const linhas = [`${formatBRL(rules.tempPriceCents)} por ${unitWord(rules.tempUnit)} — máximo ${formatDuration(rules.tempMaxUnits, rules.tempUnit)}`];
  if (rules.tempAllowFraction) {
    linhas.push(
      rules.tempUnit === 'day'
        ? 'Aceita algumas horas, com preço proporcional à diária'
        : 'Aceita alguns dias, com preço proporcional à semana',
    );
  }
  return linhas;
}

export function operatingHoursLabel(rules: Pick<GroupRules, 'hoursMode' | 'opensAt' | 'closesAt'>): string {
  if (rules.hoursMode === 'daily' && rules.opensAt && rules.closesAt) {
    return `Das ${shortTime(rules.opensAt)} às ${shortTime(rules.closesAt)}`;
  }
  return 'Aberto 24 horas';
}

/** Resumo de preço do anúncio (colunas derivadas de `spaces`). */
export type PriceSummary = {
  priceMonthlyCents: number | null;
  tempFromCents: number | null;
  tempFromUnits: number | null;
  tempFromUnit: RentalTimeUnit | null;
};

/**
 * Preço principal de um cartão/mapa: o mensal quando existe; senão a
 * entrada do temporário ("R$ 50 /hora", "R$ 120 por até 5 horas").
 */
export function priceHeadline(s: PriceSummary): { amount: string; suffix: string; secondary: string | null } | null {
  const temporario =
    s.tempFromCents != null && s.tempFromUnits != null && s.tempFromUnit != null
      ? s.tempFromUnits === 1
        ? { amount: formatBRL(s.tempFromCents), suffix: `/${unitWord(s.tempFromUnit)}` }
        : { amount: formatBRL(s.tempFromCents), suffix: ` por até ${formatDuration(s.tempFromUnits, s.tempFromUnit)}` }
      : null;
  if (s.priceMonthlyCents != null) {
    return {
      amount: formatBRL(s.priceMonthlyCents),
      suffix: '/mês',
      secondary: temporario && s.tempFromUnit ? `Também por ${unitWord(s.tempFromUnit)}` : null,
    };
  }
  if (temporario) return { ...temporario, secondary: null };
  return null;
}

// ---------------------------------------------------------------------------
// Durações que a pessoa pode escolher
// ---------------------------------------------------------------------------

export type DurationOption = {
  units: number;
  unit: RentalTimeUnit;
  rentCents: number;
  /** "3 horas", "Até 5 horas" (pacote). */
  label: string;
};

/** Duração com o que a pessoa paga de fato — aluguel + taxa de serviço —, calculado no servidor. */
export type PricedDurationOption = DurationOption & { feeCents: number; totalCents: number };

/**
 * Todas as durações válidas do grupo, já sem as que ficam abaixo do valor
 * mínimo por cobrança. Lista vazia = o grupo não tem como ser alugado por
 * tempo (o formulário do proprietário impede chegar nisso).
 */
export function temporaryDurationOptions(rules: GroupRules, minChargeCents: number): DurationOption[] {
  if (!rules.allowsTemporary || !rules.tempUnit) return [];
  const unidade = rules.tempUnit;
  const opcoes: DurationOption[] = [];
  const add = (units: number, unit: RentalTimeUnit, label: string) => {
    const rentCents = temporaryRentCents(rules, units, unit);
    if (rentCents != null && rentCents >= minChargeCents) opcoes.push({ units, unit, rentCents, label });
  };

  if (rules.tempPricingMode === 'packages') {
    for (const p of rules.tempPackages ?? []) add(p.units, unidade, `Até ${formatDuration(p.units, unidade)}`);
    return opcoes;
  }
  if (rules.tempMaxUnits == null) return [];
  if (rules.tempAllowFraction && unidade === 'day') {
    for (let h = 1; h < 24; h++) add(h, 'hour', formatDuration(h, 'hour'));
  }
  if (rules.tempAllowFraction && unidade === 'week') {
    for (let d = 1; d < 7; d++) add(d, 'day', formatDuration(d, 'day'));
  }
  for (let n = 1; n <= rules.tempMaxUnits; n++) add(n, unidade, formatDuration(n, unidade));
  return opcoes;
}

// ---------------------------------------------------------------------------
// Conferência de um pedido de aluguel temporário (servidor)
// ---------------------------------------------------------------------------

export type TemporaryRequest = { startsAt: Date; units: number; unit: RentalTimeUnit };

export type TemporaryCheck =
  | { ok: true; rentCents: number; endsAt: Date; occupiedUntil: Date }
  | { ok: false; message: string };

/**
 * Confere duração, valor mínimo, antecedência e horário de funcionamento.
 * As mensagens são as que a pessoa lê — "Máximo permitido: 5 horas.",
 * "O espaço fecha às 21:00." — e o banco recusa as mesmas coisas de novo.
 */
export function checkTemporaryRequest(
  rules: GroupRules,
  req: TemporaryRequest,
  ctx: { now: Date; minChargeCents: number; maxAdvanceDays: number; isRenewal?: boolean },
): TemporaryCheck {
  if (!rules.allowsTemporary || !rules.tempUnit) {
    return { ok: false, message: 'Estas unidades não são alugadas por hora, dia ou semana.' };
  }

  const rentCents = temporaryRentCents(rules, req.units, req.unit);
  if (rentCents == null) {
    if (rules.tempPricingMode === 'per_period' && rules.tempMaxUnits != null && Number.isInteger(req.units) && req.units > 0) {
      const maximoEmMs = rules.tempMaxUnits * UNIT_MS[rules.tempUnit];
      if (req.units * UNIT_MS[req.unit] > maximoEmMs) {
        return { ok: false, message: `Máximo permitido: ${formatDuration(rules.tempMaxUnits, rules.tempUnit)}.` };
      }
    }
    return { ok: false, message: 'Escolha uma das durações disponíveis.' };
  }
  if (rentCents < ctx.minChargeCents) {
    return {
      ok: false,
      message: `O valor mínimo de um aluguel é ${formatBRL(ctx.minChargeCents)}. Escolha uma duração maior.`,
    };
  }

  const inicio = req.startsAt.getTime();
  if (!Number.isFinite(inicio)) return { ok: false, message: 'Escolha o dia e o horário de início.' };
  if (!ctx.isRenewal && inicio < ctx.now.getTime() - 60_000) {
    return { ok: false, message: 'Esse horário já passou. Escolha um horário a partir de agora.' };
  }
  if (inicio > ctx.now.getTime() + ctx.maxAdvanceDays * UNIT_MS.day) {
    return { ok: false, message: `Dá para reservar com até ${ctx.maxAdvanceDays} dias de antecedência.` };
  }

  const endsAt = new Date(inicio + req.units * UNIT_MS[req.unit]);

  if (rules.hoursMode === 'daily' && rules.opensAt && rules.closesAt) {
    const ini = brParts(req.startsAt);
    const minutoInicio = ini.hour * 60 + ini.minute;
    // Fim em minutos desde a meia-noite do DIA DO INÍCIO (passar da
    // meia-noite conta como 24:00 em diante).
    const minutoFim = minutoInicio + Math.round((endsAt.getTime() - inicio) / 60_000);
    if (minutoInicio < minutesOfDay(rules.opensAt)) {
      return { ok: false, message: `O espaço abre às ${shortTime(rules.opensAt)}.` };
    }
    if (minutoFim > minutesOfDay(rules.closesAt)) {
      return { ok: false, message: `O espaço fecha às ${shortTime(rules.closesAt)}.` };
    }
  }

  const occupiedUntil = new Date(endsAt.getTime() + (rules.renewalAllowed ? RENEWAL_WINDOW_MINUTES * 60_000 : 0));
  return { ok: true, rentCents, endsAt, occupiedUntil };
}

// ---------------------------------------------------------------------------
// Estados derivados do relógio — nunca gravados (ficariam errados sozinhos)
// ---------------------------------------------------------------------------

export type TemporaryPhase = 'awaiting_payment' | 'upcoming' | 'in_use' | 'renewal_window' | 'finished';

export function temporaryPhase(
  b: { status: string; startsAt: Date; endsAt: Date; occupiedUntil: Date },
  now: Date,
): TemporaryPhase {
  if (b.status === 'awaiting_payment') return 'awaiting_payment';
  if (b.status !== 'active') return 'finished';
  const t = now.getTime();
  if (t < b.startsAt.getTime()) return 'upcoming';
  if (t < b.endsAt.getTime()) return 'in_use';
  if (t < b.occupiedUntil.getTime()) return 'renewal_window';
  return 'finished';
}

export type PaymentWindowState = {
  phase: 'first' | 'second' | 'over';
  /** Fim da janela atual (40 min, depois o prazo final). */
  phaseEndsAt: Date;
  deadlineAt: Date;
};

/** Em que janela de regularização o pagamento pendente está. */
export function paymentWindowState(startedAt: Date, deadlineAt: Date, now: Date): PaymentWindowState {
  const fimPrimeira = new Date(startedAt.getTime() + PAYMENT_FIRST_WINDOW_MINUTES * 60_000);
  if (now.getTime() < fimPrimeira.getTime()) return { phase: 'first', phaseEndsAt: fimPrimeira, deadlineAt };
  if (now.getTime() < deadlineAt.getTime()) return { phase: 'second', phaseEndsAt: deadlineAt, deadlineAt };
  return { phase: 'over', phaseEndsAt: deadlineAt, deadlineAt };
}
