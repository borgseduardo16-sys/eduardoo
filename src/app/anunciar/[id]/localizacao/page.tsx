import type { Metadata } from 'next';
import { loadDraftStep } from '@/lib/spaces/load-step';
import { WizardShell } from '@/components/anunciar/wizard-shell';
import { LocationForm } from '@/components/anunciar/location-form';

export const metadata: Metadata = { title: 'Localização · Anunciar' };

export default async function LocalizacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { space } = await loadDraftStep(id);

  return (
    <WizardShell
      spaceId={id}
      currentStep="localizacao"
      reachedStep={space.draftStep}
      title="Onde fica o espaço?"
      description="O endereço completo só aparece para quem alugar. No mapa público, mostramos apenas a região aproximada."
    >
      <LocationForm
        spaceId={id}
        initial={{
          postalCode: space.postalCode, state: space.state, city: space.city,
          district: space.district, street: space.street, number: space.number,
          complement: space.complement, lat: space.lat, lng: space.lng,
        }}
      />
    </WizardShell>
  );
}
