import type { Metadata } from 'next';
import { loadDraftStep } from '@/lib/spaces/load-step';
import { WizardShell } from '@/components/anunciar/wizard-shell';
import { RulesForm } from '@/components/anunciar/rules-form';

export const metadata: Metadata = { title: 'Regras · Anunciar' };

export default async function RegrasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { space } = await loadDraftStep(id);

  return (
    <WizardShell
      spaceId={id} currentStep="regras" reachedStep={space.draftStep}
      title="Quais são as regras?"
      description="Tudo opcional, mas deixar claro agora evita desentendimento depois."
    >
      <RulesForm
        spaceId={id}
        initial={{
          allowedItems: space.allowedItems, forbiddenItems: space.forbiddenItems,
          accessHours: space.accessHours, rulesText: space.rulesText,
        }}
      />
    </WizardShell>
  );
}
