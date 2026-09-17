import type { Metadata } from 'next';
import { loadDraftStep } from '@/lib/spaces/load-step';
import { listFeaturesForType } from '@/lib/spaces/queries';
import { WizardShell } from '@/components/anunciar/wizard-shell';
import { FeaturesForm } from '@/components/anunciar/features-form';
import type { SpaceTypeKey } from '@/lib/spaces/types';

export const metadata: Metadata = { title: 'Características · Anunciar' };

export default async function CaracteristicasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { space } = await loadDraftStep(id);
  const catalog = await listFeaturesForType(space.type);

  return (
    <WizardShell
      spaceId={id}
      currentStep="caracteristicas"
      reachedStep={space.draftStep}
      title="O que seu espaço tem?"
      description="Quem procura filtra por essas características — quanto mais preciso, mais certeiro o contato."
    >
      <FeaturesForm
        spaceId={id}
        spaceType={space.type as SpaceTypeKey}
        catalog={catalog}
        initial={{
          sizeM2: space.sizeM2, ceilingHeightM: space.ceilingHeightM,
          featureKeys: space.featureKeys,
        }}
      />
    </WizardShell>
  );
}
