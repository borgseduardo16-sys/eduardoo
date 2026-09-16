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
