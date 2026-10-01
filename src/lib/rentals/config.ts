/**
 * Configuração de aluguel do anúncio pelo proprietário (Parte 12): quantas
 * unidades, em quais grupos, com quais regras.
 *
 * O formulário manda o que a pessoa digitou (valores como texto, "300,00");
 * este módulo converte em centavos com `parseBRLToCents` e confere tudo,
 * devolvendo mensagens em português por campo. É puro: o navegador usa para
 * avisar na hora, o servidor usa de novo antes de gravar — e o banco ainda
 * confere os pacotes, os preços e as unidades por conta própria.
 */
import { formatBRL, parseBRLToCents } from '@/lib/money';
import {
  MAX_DURATION_UNITS,
  MAX_RENT_CENTS,
  formatDuration,
  temporaryDurationOptions,
  unitWord,
  type GroupRules,
  type RentalTimeUnit,
} from './pricing';
import { minutesOfDay } from './time';

export const MAX_GROUPS = 10;
export const MAX_UNITS_PER_GROUP = 200;
export const MAX_UNITS_PER_SPACE = 500;
export const MAX_PACKAGES = 6;

export type RentalMode = 'continuous' | 'temporary' | 'both';

/** O que o formulário envia (JSON). Valores de dinheiro chegam como texto. */
export type RawGroup = {
  id?: string | null;
  name?: string;
  unitCount?: number | string;
  mode?: RentalMode;
  monthlyPrice?: string;
  tempUnit?: RentalTimeUnit;
  tempPricingMode?: 'per_period' | 'packages';
  tempPrice?: string;
  tempMaxUnits?: number | string;
  tempAllowFraction?: boolean;
  packages?: { units?: number | string; price?: string }[];
  renewalAllowed?: boolean;
  hoursMode?: 'always' | 'daily';
  opensAt?: string;
  closesAt?: string;
};

export type RawRentalConfig = { groups?: RawGroup[]; availableFrom?: string };

export type ParsedGroup = { id: string | null; name: string; unitCount: number; rules: GroupRules };

export type RentalConfigResult =
  | { ok: true; groups: ParsedGroup[]; availableFrom: string }
  | { ok: false; errors: Record<string, string> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const UNIDADES_DE_TEMPO: readonly RentalTimeUnit[] = ['hour', 'day', 'week'];

function inteiro(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.trim()) : NaN;
  return Number.isInteger(n) ? n : null;
}

function centavos(v: unknown): number | null {
  if (typeof v !== 'string' || v.trim() === '') return null;
  try {
    return parseBRLToCents(v);
  } catch {
    return null;
  }
}

/** Nome padrão do grupo único, que a pessoa nem vê. */
export const DEFAULT_GROUP_NAME = 'Padrão';

export function parseRentalConfig(
  raw: unknown,
  ctx: { minChargeCents: number; today: string },
): RentalConfigResult {
  const errors: Record<string, string> = {};
  const cfg = (raw && typeof raw === 'object' ? raw : {}) as RawRentalConfig;
  const grupos = Array.isArray(cfg.groups) ? cfg.groups : [];

  if (grupos.length === 0) return { ok: false, errors: { form: 'Configure pelo menos um grupo de unidades.' } };
  if (grupos.length > MAX_GROUPS) return { ok: false, errors: { form: `No máximo ${MAX_GROUPS} grupos por anúncio.` } };

  const availableFrom = typeof cfg.availableFrom === 'string' ? cfg.availableFrom : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(availableFrom) || Number.isNaN(Date.parse(`${availableFrom}T12:00:00Z`))) {
    errors.availableFrom = 'Informe a partir de quando o espaço está disponível.';
  } else if (availableFrom < ctx.today) {
    errors.availableFrom = 'A data precisa ser hoje ou no futuro.';
  }

  const parsed: ParsedGroup[] = [];
  const nomes = new Set<string>();
  let totalUnidades = 0;

  grupos.forEach((g, i) => {
    const k = (campo: string) => `groups.${i}.${campo}`;
    const varios = grupos.length > 1;

    const id = typeof g.id === 'string' && UUID.test(g.id) ? g.id : null;
    const nome = (g.name ?? '').trim() || (varios ? '' : DEFAULT_GROUP_NAME);
    if (!nome) errors[k('name')] = 'Dê um nome ao grupo (ex.: "Vagas rápidas").';
    else if (nome.length > 60) errors[k('name')] = 'Nome com no máximo 60 caracteres.';
    else if (nomes.has(nome.toLowerCase())) errors[k('name')] = 'Já existe um grupo com este nome.';
    nomes.add(nome.toLowerCase());

    const unitCount = inteiro(g.unitCount);
    if (unitCount == null || unitCount < 1) errors[k('unitCount')] = 'Informe quantas unidades (pelo menos 1).';
    else if (unitCount > MAX_UNITS_PER_GROUP) errors[k('unitCount')] = `No máximo ${MAX_UNITS_PER_GROUP} por grupo.`;
    totalUnidades += unitCount ?? 0;

    const modo: RentalMode = g.mode === 'temporary' || g.mode === 'both' ? g.mode : 'continuous';
    const continuo = modo !== 'temporary';
    const temporario = modo !== 'continuous';

    // ---- Mensal ----
    let monthlyPriceCents: number | null = null;
    if (continuo) {
      monthlyPriceCents = centavos(g.monthlyPrice);
      if (monthlyPriceCents == null || monthlyPriceCents <= 0) errors[k('monthlyPrice')] = 'Informe o valor por mês. Exemplo: 300,00';
      else if (monthlyPriceCents < ctx.minChargeCents) errors[k('monthlyPrice')] = `O valor mínimo é ${formatBRL(ctx.minChargeCents)} por mês.`;
      else if (monthlyPriceCents > MAX_RENT_CENTS) errors[k('monthlyPrice')] = 'Valor acima do limite.';
    }

    // ---- Temporário ----
    const tempUnit: RentalTimeUnit = UNIDADES_DE_TEMPO.includes(g.tempUnit as RentalTimeUnit) ? (g.tempUnit as RentalTimeUnit) : 'hour';
    const tempPricingMode = g.tempPricingMode === 'packages' ? 'packages' : 'per_period';
    let tempPriceCents: number | null = null;
    let tempMaxUnits: number | null = null;
    let tempPackages: { units: number; priceCents: number }[] | null = null;
    const tempAllowFraction = temporario && tempPricingMode === 'per_period' && tempUnit !== 'hour' && g.tempAllowFraction === true;
    const maxDuracao = MAX_DURATION_UNITS[tempUnit];

    if (temporario && tempPricingMode === 'per_period') {
      tempPriceCents = centavos(g.tempPrice);
      tempMaxUnits = inteiro(g.tempMaxUnits);
      if (tempPriceCents == null || tempPriceCents <= 0) {
        errors[k('tempPrice')] = `Informe o valor por ${unitWord(tempUnit)}. Exemplo: 50,00`;
      } else if (tempPriceCents > MAX_RENT_CENTS) {
        errors[k('tempPrice')] = 'Valor acima do limite.';
      }
      if (tempMaxUnits == null || tempMaxUnits < 1) {
        errors[k('tempMaxUnits')] = `Informe o máximo de ${unitWord(tempUnit, true)} por aluguel.`;
      } else if (tempMaxUnits > maxDuracao) {
        errors[k('tempMaxUnits')] = `No máximo ${formatDuration(maxDuracao, tempUnit)}.`;
      }
    }

    if (temporario && tempPricingMode === 'packages') {
      const lista = Array.isArray(g.packages) ? g.packages : [];
      if (lista.length === 0) errors[k('packages')] = 'Adicione pelo menos um pacote.';
      else if (lista.length > MAX_PACKAGES) errors[k('packages')] = `No máximo ${MAX_PACKAGES} pacotes.`;
      const pacotes: { units: number; priceCents: number }[] = [];
      lista.forEach((p, j) => {
        const units = inteiro(p.units);
        const priceCents = centavos(p.price);
        if (units == null || units < 1 || units > maxDuracao) {
          errors[`${k('packages')}.${j}`] = `Duração entre 1 e ${formatDuration(maxDuracao, tempUnit)}.`;
        } else if (priceCents == null || priceCents <= 0) {
          errors[`${k('packages')}.${j}`] = 'Informe o valor do pacote.';
        } else if (priceCents < ctx.minChargeCents) {
          errors[`${k('packages')}.${j}`] = `Cada pacote precisa custar pelo menos ${formatBRL(ctx.minChargeCents)}, o valor mínimo por cobrança.`;
        } else if (priceCents > MAX_RENT_CENTS) {
          errors[`${k('packages')}.${j}`] = 'Valor acima do limite.';
        } else {
          pacotes.push({ units, priceCents });
        }
      });
      pacotes.sort((a, b) => a.units - b.units);
      for (let j = 1; j < pacotes.length; j++) {
        if (pacotes[j]!.units === pacotes[j - 1]!.units) {
          errors[k('packages')] = `Dois pacotes com a mesma duração (${formatDuration(pacotes[j]!.units, tempUnit)}). Deixe só um.`;
        } else if (pacotes[j]!.priceCents < pacotes[j - 1]!.priceCents) {
          errors[k('packages')] = `O pacote de ${formatDuration(pacotes[j]!.units, tempUnit)} não pode custar menos que o de ${formatDuration(pacotes[j - 1]!.units, tempUnit)}.`;
        }
      }
      tempPackages = pacotes;
    }

    // ---- Horário de funcionamento ----
    const daily = g.hoursMode === 'daily';
    const opensAt = daily ? (g.opensAt ?? '') : null;
    const closesAt = daily ? (g.closesAt ?? '') : null;
    if (daily) {
      if (!HORA.test(opensAt!) || !HORA.test(closesAt!)) {
        errors[k('hours')] = 'Informe o horário de abrir e de fechar (ex.: 07:00 e 21:00).';
      } else if (minutesOfDay(opensAt!) >= minutesOfDay(closesAt!)) {
        errors[k('hours')] = 'O horário de fechar precisa ser depois do de abrir.';
      } else if (temporario && tempUnit !== 'hour') {
        errors[k('hours')] = 'Com horário de funcionamento, o aluguel temporário é por hora.';
      } else if (temporario) {
        const horasAbertas = Math.floor((minutesOfDay(closesAt!) - minutesOfDay(opensAt!)) / 60);
        const maiorDuracao = tempPricingMode === 'packages'
          ? Math.max(0, ...(tempPackages ?? []).map((p) => p.units))
          : (tempMaxUnits ?? 0);
        if (maiorDuracao > horasAbertas) {
          errors[k('hours')] = `O espaço fica aberto ${formatDuration(horasAbertas, 'hour')} por dia; nenhum aluguel pode passar disso.`;
        }
      }
    }

    const rules: GroupRules = {
      allowsContinuous: continuo,
      allowsTemporary: temporario,
      monthlyPriceCents: continuo ? monthlyPriceCents : null,
      tempPricingMode: temporario ? tempPricingMode : null,
      tempUnit: temporario ? tempUnit : null,
      tempPriceCents: temporario && tempPricingMode === 'per_period' ? tempPriceCents : null,
      tempMaxUnits: temporario && tempPricingMode === 'per_period' ? tempMaxUnits : null,
      tempAllowFraction,
      tempPackages: temporario && tempPricingMode === 'packages' ? tempPackages : null,
      renewalAllowed: temporario ? g.renewalAllowed !== false : false,
      hoursMode: daily ? 'daily' : 'always',
      opensAt: daily ? opensAt : null,
      closesAt: daily ? closesAt : null,
    };

    // Regra temporária sem nenhuma duração que alcance o mínimo por cobrança
    // seria um anúncio que ninguém consegue alugar.
    if (
      temporario && tempPricingMode === 'per_period'
      && !errors[k('tempPrice')] && !errors[k('tempMaxUnits')]
      && temporaryDurationOptions(rules, ctx.minChargeCents).length === 0
    ) {
      errors[k('tempPrice')] = `Com esse valor e esse máximo, nenhum aluguel chega a ${formatBRL(ctx.minChargeCents)}, o valor mínimo por cobrança.`;
    }

    parsed.push({ id, name: nome, unitCount: unitCount ?? 0, rules });
  });

  if (totalUnidades > MAX_UNITS_PER_SPACE) errors.form = `No máximo ${MAX_UNITS_PER_SPACE} unidades por anúncio.`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, groups: parsed, availableFrom };
}

/** Converte as regras gravadas de volta para o formato do formulário (edição). */
export function groupToRaw(g: {
  id: string;
  name: string;
  unitCount: number;
  rules: GroupRules;
}): RawGroup {
  const r = g.rules;
  const reais = (c: number | null) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));
  return {
    id: g.id,
    name: g.name,
    unitCount: g.unitCount,
    mode: r.allowsContinuous && r.allowsTemporary ? 'both' : r.allowsTemporary ? 'temporary' : 'continuous',
    monthlyPrice: reais(r.monthlyPriceCents),
    tempUnit: r.tempUnit ?? 'hour',
    tempPricingMode: r.tempPricingMode ?? 'per_period',
    tempPrice: reais(r.tempPriceCents),
    tempMaxUnits: r.tempMaxUnits ?? '',
    tempAllowFraction: r.tempAllowFraction,
    packages: (r.tempPackages ?? []).map((p) => ({ units: p.units, price: reais(p.priceCents) })),
    renewalAllowed: r.renewalAllowed,
    hoursMode: r.hoursMode,
    opensAt: r.opensAt?.slice(0, 5) ?? '',
    closesAt: r.closesAt?.slice(0, 5) ?? '',
  };
}
