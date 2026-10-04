import type { Metadata } from 'next';
import { loadDraftStep } from '@/lib/spaces/load-step';
import { WizardShell } from '@/components/anunciar/wizard-shell';
import { LocationForm } from '@/components/anunciar/location-form';
import { isExactLocationType } from '@/lib/spaces/privacy';

export const metadata: Metadata = { title: 'Localização · Anunciar' };

export default async function LocalizacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { space } = await loadDraftStep(id);
  const pontoExato = await isExactLocationType(space.type);

  return (
    <WizardShell
      spaceId={id}
      currentStep="localizacao"
      reachedStep={space.draftStep}
      title="Onde fica o espaço?"
      description={
        pontoExato
          ? 'Este tipo de espaço é comercial: o mapa do anúncio mostra o ponto exato do local. O endereço por extenso e as instruções só aparecem para quem tiver a locação confirmada.'
          : 'O endereço completo só aparece para quem tiver a locação confirmada. No mapa público, mostramos apenas a região aproximada.'
      }
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
