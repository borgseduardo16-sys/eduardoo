/**
 * Aritmetica de dinheiro.
 *
 * Regra unica e inegociavel: dinheiro e INTEIRO EM CENTAVOS.
 * Ponto flutuante acumula erro (0.1 + 0.2 !== 0.3) e em cima de milhares de
 * cobrancas isso vira divergencia de caixa. Nada aqui usa float.
 *
 * Este modulo e puro e nao depende de banco nem de rede — e testavel isolado
 * e e a UNICA fonte de verdade dos valores de uma reserva. O navegador nunca
 * envia preco: ele envia o id do espaco, e o servidor recalcula tudo aqui.
 */

/** Taxas em basis points: 1 bps = 0,01%. 200 bps = 2%. */
export type FeeConfig = {
  renterFeeBps: number;
  ownerFeeBps: number;
};

export type BookingAmounts = {
  /** Preco do espaco definido pelo proprietario. */
  monthlyRentCents: number;
  renterFeeBps: number;
  ownerFeeBps: number;
  /** Taxa somada ao que o locatario paga. */
  renterFeeCents: number;
  /** Taxa descontada do que o proprietario recebe. */
  ownerFeeCents: number;
  /** Total debitado do locatario. */
  totalChargedCents: number;
  /** Valor repassado ao proprietario. */
  ownerPayoutCents: number;
  /** Receita BRUTA da plataforma (antes da tarifa do gateway). */
  platformGrossCents: number;
};

export class InvalidAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAmountError';
  }
}

/** Percentual sobre um valor, com arredondamento meio-para-cima em centavos. */
function applyBps(amountCents: number, bps: number): number {
  return Math.round((amountCents * bps) / 10_000);
}

/**
 * Calcula todos os valores de uma reserva a partir do aluguel e das taxas.
 *
 * Exemplo com aluguel de R$ 100,00 e 2% / 2%:
 *   monthlyRent      10000  (R$ 100,00)
 *   renterFee          200  (R$   2,00)
 *   ownerFee           200  (R$   2,00)
 *   totalCharged     10200  (R$ 102,00)  <- locatario paga
 *   ownerPayout       9800  (R$  98,00)  <- proprietario recebe
 *   platformGross      400  (R$   4,00)  <- receita bruta
 *
 * Atencao: `platformGross` e BRUTO. A tarifa do gateway sai antes do split e e
 * absorvida pela plataforma, entao a receita liquida real e menor.
 * Use `platformNetCents` para saber o que de fato sobra.
 */
export function computeBookingAmounts(
  monthlyRentCents: number,
  fees: FeeConfig,
): BookingAmounts {
  if (!Number.isInteger(monthlyRentCents)) {
    throw new InvalidAmountError('O aluguel precisa ser um inteiro em centavos.');
  }
  if (monthlyRentCents <= 0) {
    throw new InvalidAmountError('O aluguel precisa ser maior que zero.');
  }
  if (!Number.isInteger(fees.renterFeeBps) || !Number.isInteger(fees.ownerFeeBps)) {
    throw new InvalidAmountError('As taxas precisam ser inteiros em basis points.');
  }
  if (fees.renterFeeBps < 0 || fees.ownerFeeBps < 0) {
    throw new InvalidAmountError('As taxas nao podem ser negativas.');
  }
  // 10.000 bps = 100%. Acima disso o proprietario receberia valor negativo.
  if (fees.ownerFeeBps >= 10_000) {
    throw new InvalidAmountError('A taxa do proprietario nao pode chegar a 100%.');
  }

  const renterFeeCents = applyBps(monthlyRentCents, fees.renterFeeBps);
  const ownerFeeCents = applyBps(monthlyRentCents, fees.ownerFeeBps);
  const totalChargedCents = monthlyRentCents + renterFeeCents;
  const ownerPayoutCents = monthlyRentCents - ownerFeeCents;

  if (ownerPayoutCents <= 0) {
    throw new InvalidAmountError(
      'O repasse ao proprietario ficaria zerado ou negativo com estas taxas.',
    );
  }

  return {
    monthlyRentCents,
    renterFeeBps: fees.renterFeeBps,
    ownerFeeBps: fees.ownerFeeBps,
    renterFeeCents,
    ownerFeeCents,
    totalChargedCents,
    ownerPayoutCents,
    platformGrossCents: renterFeeCents + ownerFeeCents,
  };
}

// ---------------------------------------------------------------------------
// Taxa do proprietário no Premium (Etapa 2, Fase B)
// ---------------------------------------------------------------------------

/**
 * Política vigente da taxa do proprietário — lida de `platform_settings` pelo
 * servidor (`fees.owner_fee_bps`, `fees.owner_fee_bps_premium`,
 * `fees.premium_min_rent_cents`). Módulo puro: o servidor decide com isto e o
 * navegador só usa para mostrar a prévia ("Você receberá R$ 294…").
 */
export type OwnerFeePolicy = {
  /** Taxa padrão do proprietário, em pontos-base (300 = 3%). */
  standardBps: number;
  /** Taxa reduzida do Premium pago (200 = 2%). */
  premiumBps: number;
  /** A taxa reduzida só vale para aluguel a partir deste valor, em centavos (R$ 50,00 = 5000). */
  premiumMinRentCents: number;
};

export type OwnerFeeDecision = {
  /** A taxa do proprietário a aplicar, em pontos-base. */
  bps: number;
  /** A taxa reduzida do Premium foi aplicada. */
  reduced: boolean;
  /** Tem direito à taxa reduzida, mas o aluguel está abaixo do piso: vale a taxa padrão. */
  belowFloor: boolean;
};

/**
 * Qual taxa o proprietário paga neste aluguel.
 *
 * Premium PAGO e vigente (`premiumFinancial`, ver `premium_financial_active`)
 * paga a taxa reduzida — mas só em aluguel a partir do piso. Abaixo do piso
 * (ou sem Premium financeiro) vale a taxa padrão. Uma taxa "reduzida" que não
 * fosse menor que a padrão nunca vale como redução (política mal configurada
 * não cobra mais caro por ser Premium).
 */
export function decideOwnerFee(
  monthlyRentCents: number,
  premiumFinancial: boolean,
  policy: OwnerFeePolicy,
): OwnerFeeDecision {
  if (!Number.isInteger(monthlyRentCents) || monthlyRentCents <= 0) {
    throw new InvalidAmountError('O aluguel precisa ser um inteiro positivo em centavos.');
  }
  const { standardBps, premiumBps, premiumMinRentCents } = policy;
  if (![standardBps, premiumBps, premiumMinRentCents].every(Number.isInteger) || standardBps < 0 || premiumBps < 0) {
    throw new InvalidAmountError('A política de taxa do proprietário é inválida.');
  }
  if (!premiumFinancial || premiumBps >= standardBps) {
    return { bps: standardBps, reduced: false, belowFloor: false };
  }
  if (monthlyRentCents < premiumMinRentCents) {
    return { bps: standardBps, reduced: false, belowFloor: true };
  }
  return { bps: premiumBps, reduced: true, belowFloor: false };
}

/**
 * Tarifas de REFERÊNCIA do gateway (a tabela do projeto, docs/PAGAMENTOS.md):
 * Pix R$ 1,99 por recebimento; cartão 2,99% + R$ 0,49. Servem só para conferir
 * se uma combinação de taxas FECHA A CONTA — a tarifa real vem do gateway, no
 * webhook, e nenhum valor cobrado sai daqui.
 */
export const GATEWAY_FEE_REFERENCE = { pixCents: 199, cardBps: 299, cardFixedCents: 49 } as const;

/** O pior caso (Pix ou cartão) das tarifas de referência para uma cobrança deste total. */
export function worstReferenceGatewayFeeCents(totalChargedCents: number): number {
  const cartao = applyBps(totalChargedCents, GATEWAY_FEE_REFERENCE.cardBps) + GATEWAY_FEE_REFERENCE.cardFixedCents;
  return Math.max(GATEWAY_FEE_REFERENCE.pixCents, cartao);
}

/**
 * O líquido da cobrança (depois da tarifa do gateway) cobre o repasse ao
 * proprietário? O split do Asaas é limitado ao líquido: se o repasse passa
 * dele, o Asaas bloqueia a assinatura e desliga o split. É por isso que a taxa
 * reduzida tem piso — e esta conferência é a segunda trava, caso alguém
 * configure um piso baixo demais.
 */
export function splitFitsNet(amounts: Pick<BookingAmounts, 'totalChargedCents' | 'ownerPayoutCents'>): boolean {
  return amounts.totalChargedCents - worstReferenceGatewayFeeCents(amounts.totalChargedCents) >= amounts.ownerPayoutCents;
}

/**
 * Quanto o proprietário recebe por mês de um anúncio com este preço: o aluguel
 * menos a taxa de serviço dele. Mesma conta do repasse de uma locação
 * (`computeBookingAmounts`) — usada para dizer, na hora de anunciar, "Você
 * receberá R$ 291 por mês", antes de existir qualquer locação.
 */
export function ownerNetFor(
  monthlyRentCents: number,
  ownerFeeBps: number,
): { netCents: number; feeCents: number } {
  const valores = computeBookingAmounts(monthlyRentCents, { renterFeeBps: 0, ownerFeeBps });
  return { netCents: valores.ownerPayoutCents, feeCents: valores.ownerFeeCents };
}

/**
 * Receita LIQUIDA da plataforma depois da tarifa do gateway.
 *
 * A tarifa sai do bruto antes do split, entao quem a absorve e a plataforma:
 *   liquido = totalCobrado - tarifaDoGateway - repasseAoProprietario
 *
 * Pode dar NEGATIVO em aluguel baixo. Isso nao e um bug — e a economia real do
 * modelo de 2% + 2%, detalhada em docs/PAGAMENTOS.md. Por isso existe o
 * ajuste `booking.min_rent_cents`.
 */
export function platformNetCents(
  amounts: Pick<BookingAmounts, 'totalChargedCents' | 'ownerPayoutCents'>,
  gatewayFeeCents: number,
): number {
  if (!Number.isInteger(gatewayFeeCents) || gatewayFeeCents < 0) {
    throw new InvalidAmountError('A tarifa do gateway precisa ser inteiro nao-negativo.');
  }
  return amounts.totalChargedCents - gatewayFeeCents - amounts.ownerPayoutCents;
}

/** Formata centavos como moeda brasileira: 10250 -> "R$ 102,50". */
export function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

/**
 * Converte o que o usuario digitou ("1.500,50", "1500.50", "R$ 1.500") em
 * centavos. Rejeita entrada ambigua em vez de adivinhar — errar aqui significa
 * cobrar o valor errado de alguem.
 */
export function parseBRLToCents(input: string): number {
  const cleaned = input.replace(/\s|R\$/g, '').trim();
  if (cleaned === '') throw new InvalidAmountError('Valor vazio.');
  if (!/^-?[\d.,]+$/.test(cleaned)) {
    throw new InvalidAmountError(`Valor invalido: "${input}"`);
  }

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  const decimalSep = lastComma > lastDot ? ',' : lastDot > lastComma ? '.' : null;

  let normalized: string;
  if (decimalSep === null) {
    normalized = cleaned;
  } else {
    const sepIndex = decimalSep === ',' ? lastComma : lastDot;
    const decimals = cleaned.length - sepIndex - 1;
    // 3 casas depois do separador = separador de milhar, nao decimal (1.500).
    if (decimals === 3) {
      normalized = cleaned.replace(/[.,]/g, '');
    } else if (decimals > 2) {
      throw new InvalidAmountError(`Valor com casas decimais demais: "${input}"`);
    } else {
      const intPart = cleaned.slice(0, sepIndex).replace(/[.,]/g, '');
      const decPart = cleaned.slice(sepIndex + 1).padEnd(2, '0');
      normalized = `${intPart}.${decPart}`;
    }
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) throw new InvalidAmountError(`Valor invalido: "${input}"`);

  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents)) throw new InvalidAmountError(`Valor fora da faixa: "${input}"`);
  return cents;
}

/**
 * Acrescenta uma folga percentual a um teto, arredondando PARA BAIXO até o
 * real inteiro — "cerca de R$ 300" com 1000 bps (10%) vira R$ 330. Usado
 * pela busca por necessidade (Fase 23); só inteiros.
 */
export function addToleranceCents(cents: number, bps: number): number {
  if (!Number.isSafeInteger(cents) || cents < 0 || !Number.isInteger(bps) || bps < 0) {
    throw new InvalidAmountError('Folga inválida.');
  }
  const comFolga = cents + Math.floor((cents * bps) / 10_000);
  return comFolga - (comFolga % 100);
}

/**
 * Fração de um valor em pontos-base, só com inteiros — 5000 bps = metade,
 * 16000 bps = 160%. `arredondar` escolhe o lado ('baixo' para piso, 'cima'
 * para teto). Usado na faixa de preço de "espaços semelhantes" (Fase 23).
 */
export function scaleCentsByBps(cents: number, bps: number, arredondar: 'baixo' | 'cima'): number {
  if (!Number.isSafeInteger(cents) || cents < 0 || !Number.isInteger(bps) || bps < 0) {
    throw new InvalidAmountError('Valor inválido.');
  }
  const bruto = cents * bps;
  return arredondar === 'baixo' ? Math.floor(bruto / 10_000) : Math.ceil(bruto / 10_000);
}

/**
 * Centavos no formato que o filtro de preço da busca aceita: 30000 → "300",
 * 29990 → "299,90". O inverso de `parseBRLToCents`, sem ponto flutuante.
 */
export function centsToInputString(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new InvalidAmountError('Valor inválido.');
  const reais = Math.trunc(cents / 100);
  const resto = cents % 100;
  return resto === 0 ? String(reais) : `${reais},${String(resto).padStart(2, '0')}`;
}

/**
 * Como formatBRL, mas sem os centavos quando são zero ("R$ 291", "R$ 1.291") —
 * para frases corridas. Com centavos, volta ao formato completo ("R$ 291,50").
 */
export function formatBRLShort(cents: number): string {
  if (cents % 100 !== 0) return formatBRL(cents);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** 300 bps → "3%"; 250 → "2,5%". So exibicao — conta de dinheiro continua em centavos. */
export function formatBps(bps: number): string {
  return `${(bps / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}
