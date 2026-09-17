import type { Metadata } from 'next';
import { inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { platformSettings } from '@/db/schema';
import { formatBRL } from '@/lib/money';
import { loadDraftStep } from '@/lib/spaces/load-step';
import { WizardShell } from '@/components/anunciar/wizard-shell';
import { PriceForm } from '@/components/anunciar/price-form';
import type { SpaceTypeKey } from '@/lib/spaces/types';

export const metadata: Metadata = { title: 'Preço · Anunciar' };

/** As taxas e o mínimo vêm do banco: mudar a política não exige alterar código. */
async function loadPricingSettings() {
  const rows = await db
    .select({ key: platformSettings.key, value: platformSettings.value })
    .from(platformSettings)
    .where(
      inArray(platformSettings.key, [
        'fees.renter_fee_bps',
        'fees.owner_fee_bps',
        'booking.min_rent_cents',
      ]),
    );

  const map = Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
  return {
    renterBps: Number.isFinite(map['fees.renter_fee_bps']) ? map['fees.renter_fee_bps']! : 300,
    ownerBps: Number.isFinite(map['fees.owner_fee_bps']) ? map['fees.owner_fee_bps']! : 300,
    minRent: Number.isFinite(map['booking.min_rent_cents']) ? map['booking.min_rent_cents']! : 3500,
  };
}

export default async function PrecoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ space }, pricing] = await Promise.all([loadDraftStep(id), loadPricingSettings()]);

  return (
    <WizardShell
      spaceId={id} currentStep="preco" reachedStep={space.draftStep}
      title="Quanto você quer cobrar?"
      description="Você define o valor. Dá para mudar depois, e a alteração não afeta locação já em andamento."
    >
      <PriceForm
        spaceId={id}
        spaceType={space.type as SpaceTypeKey}
        initial={{
          priceMonthlyCents: space.priceMonthlyCents,
          availableFrom: space.availableFrom,
        }}
        minRentLabel={formatBRL(pricing.minRent)}
        feeRenterBps={pricing.renterBps}
        feeOwnerBps={pricing.ownerBps}
      />
    </WizardShell>
  );
}
