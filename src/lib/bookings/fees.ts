import 'server-only';
import { inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { platformSettings } from '@/db/schema';
import {
  InvalidAmountError,
  computeBookingAmounts,
  decideOwnerFee,
  splitFitsNet,
  type FeeConfig,
  type OwnerFeePolicy,
} from '@/lib/money';

/**
 * Taxas de uma locação — a ÚNICA decisão, centralizada no servidor.
 *
 * - Taxa do LOCATÁRIO: sempre a padrão (`fees.renter_fee_bps`, 3%).
 * - Taxa do PROPRIETÁRIO: a padrão (`fees.owner_fee_bps`, 3%) ou, com Premium
 *   PAGO e vigente e aluguel a partir do piso (R$ 50,00), a reduzida
 *   (`fees.owner_fee_bps_premium`, 2%).
 *
 * "Premium pago e vigente" = ciclo pago cujo período cobre agora
 * (`premium_financial_active`, migração 0034). Premium concedido pela
 * administração em modo teste NÃO conta, a menos que a concessão tenha a marca
 * de teste financeiro.
 *
 * A taxa é CONGELADA no aceite (a linha da locação guarda `owner_fee_bps`, e o
 * `terms_snapshot` guarda por quê); o banco confere (`bookings_guard_price_fee`,
 * migração 0035). O navegador nunca manda taxa.
 */

type Executor = Pick<typeof db, 'execute' | 'select'>;

export type FeePolicy = { renterFeeBps: number; owner: OwnerFeePolicy };

const KEYS = ['fees.renter_fee_bps', 'fees.owner_fee_bps', 'fees.owner_fee_bps_premium', 'fees.premium_min_rent_cents'] as const;

/** A política vigente, de `platform_settings` (uma consulta só). Chave ausente cai no padrão do produto. */
export async function loadFeePolicy(executor: Executor = db): Promise<FeePolicy> {
  const linhas = await executor
    .select({ key: platformSettings.key, value: platformSettings.value })
    .from(platformSettings)
    .where(inArray(platformSettings.key, [...KEYS]));
  const valor = (chave: string, padrao: number) => {
    const n = Number(linhas.find((l) => l.key === chave)?.value);
    return Number.isFinite(n) ? n : padrao;
  };
  return {
    renterFeeBps: valor('fees.renter_fee_bps', 300),
    owner: {
      standardBps: valor('fees.owner_fee_bps', 300),
      premiumBps: valor('fees.owner_fee_bps_premium', 200),
      premiumMinRentCents: valor('fees.premium_min_rent_cents', 5000),
    },
  };
}

export type ResolvedFees = FeeConfig & {
  /** A taxa reduzida do Premium foi aplicada. */
  ownerFeeReduced: boolean;
  /** Tinha direito à taxa reduzida, mas o aluguel está abaixo do piso (vale a padrão). */
  ownerFeeBelowFloor: boolean;
  /** A taxa padrão do proprietário na hora da decisão (para o registro e a explicação). */
  standardOwnerFeeBps: number;
  /** Ciclo do Premium que justificou a redução (para a trilha de auditoria), quando houve. */
  premiumCycleId: string | null;
  policy: FeePolicy;
};

/**
 * Decide as taxas desta locação. Dentro de uma transação, passe o `tx` — a leitura
 * do Premium acontece junto do que vai ser gravado.
 */
export async function resolveBookingFees(opts: {
  ownerId: string;
  monthlyRentCents: number;
  executor?: Executor;
}): Promise<ResolvedFees> {
  const executor = opts.executor ?? db;
  const policy = await loadFeePolicy(executor);

  const [ciclo] = (await executor.execute(sql`
    SELECT id FROM premium_cycles
     WHERE id = public.premium_current_cycle_id(${opts.ownerId}::uuid) AND financial_eligible
  `)) as unknown as { id: string }[];
  const premiumFinancial = Boolean(ciclo);

  let decisao = decideOwnerFee(opts.monthlyRentCents, premiumFinancial, policy.owner);

  // Segunda trava: a taxa reduzida só vale se o líquido da cobrança ainda cobre o repasse
  // (senão o Asaas recusaria o split). Piso mal configurado nunca chega ao gateway.
  if (decisao.reduced) {
    const amounts = computeBookingAmounts(opts.monthlyRentCents, {
      renterFeeBps: policy.renterFeeBps,
      ownerFeeBps: decisao.bps,
    });
    if (!splitFitsNet(amounts)) {
      decisao = { bps: policy.owner.standardBps, reduced: false, belowFloor: true };
    }
  }

  return {
    renterFeeBps: policy.renterFeeBps,
    ownerFeeBps: decisao.bps,
    ownerFeeReduced: decisao.reduced,
    ownerFeeBelowFloor: decisao.belowFloor,
    standardOwnerFeeBps: policy.owner.standardBps,
    premiumCycleId: decisao.reduced && ciclo ? ciclo.id : null,
    policy,
  };
}

export { InvalidAmountError };
