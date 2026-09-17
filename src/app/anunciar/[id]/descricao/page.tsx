import type { Metadata } from 'next';
import { loadDraftStep } from '@/lib/spaces/load-step';
import { WizardShell } from '@/components/anunciar/wizard-shell';
import { ContentForm } from '@/components/anunciar/content-form';
import type { SpaceTypeKey } from '@/lib/spaces/types';

export const metadata: Metadata = { title: 'Descrição · Anunciar' };

export default async function DescricaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { space } = await loadDraftStep(id);

  return (
    <WizardShell
      spaceId={id} currentStep="descricao" reachedStep={space.draftStep}
      title="Como as pessoas vão encontrar seu espaço"
      description="Um título direto e uma descrição honesta evitam visita perdida dos dois lados."
    >
      <ContentForm
        spaceId={id}
        spaceType={space.type as SpaceTypeKey}
        initial={{ title: space.title, description: space.description }}
      />
    </WizardShell>
  );
}
