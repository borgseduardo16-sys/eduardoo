import type { Metadata } from 'next';
import { inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { platformSettings } from '@/db/schema';
import { loadDraftStep } from '@/lib/spaces/load-step';
import { unitNounFor } from '@/lib/spaces/types';
import { getSpaceUnitGroups } from '@/lib/rentals/queries';
import { groupsForEditing } from '@/lib/rentals/owner';
import { groupToRaw } from '@/lib/rentals/config';
import { WizardShell } from '@/components/anunciar/wizard-shell';
import { RentalConfigForm } from '@/components/anunciar/rental-config-form';

export const metadata: Metadata = { title: 'Como alugar · Anunciar' };

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
  const [{ space }, pricing, grupos, edicao] = await Promise.all([
    loadDraftStep(id),
    loadPricingSettings(),
    getSpaceUnitGroups(id),
    groupsForEditing(db, id),
  ]);
  const vivas = new Map(edicao.map((g) => [g.id, g.liveUnits]));
  const nome = unitNounFor(space.type);

  return (
    <WizardShell
      spaceId={id} currentStep="preco" reachedStep={space.draftStep}
      title="Como você quer alugar?"
      description={`Por mês, por hora, por dia ou por semana — e quantas ${nome.plural} você tem. Dá para mudar depois; aluguel em andamento continua com o valor combinado.`}
    >
      <RentalConfigForm
        spaceId={id}
        unitNoun={nome}
        initialGroups={grupos.map((g) => ({
          ...groupToRaw({ id: g.id, name: g.name, unitCount: g.totalUnits, rules: g.rules }),
          id: g.id,
          // Nome do grupo único fica invisível no formulário.
          name: grupos.length === 1 ? '' : g.name,
          liveUnits: vivas.get(g.id) ?? 0,
        }))}
        availableFrom={space.availableFrom}
        minRentCents={pricing.minRent}
        feeOwnerBps={pricing.ownerBps}
        feeRenterBps={pricing.renterBps}
      />
    </WizardShell>
  );
}
