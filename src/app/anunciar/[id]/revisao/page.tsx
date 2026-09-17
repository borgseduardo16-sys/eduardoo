import type { Metadata } from 'next';
import { inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { features as featuresTable } from '@/db/schema';
import { loadDraftStep } from '@/lib/spaces/load-step';
import { signImagePaths } from '@/lib/storage/signed-urls';
import { MIN_PHOTOS_TO_PUBLISH } from '@/lib/spaces/schemas';
import { WizardShell } from '@/components/anunciar/wizard-shell';
import { SpacePreview } from '@/components/anunciar/space-preview';
import { PublishActions } from '@/components/anunciar/publish-actions';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = { title: 'Revisão · Anunciar' };

export default async function RevisaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { space } = await loadDraftStep(id);

  const [urls, feats] = await Promise.all([
    signImagePaths(space.images.map((i) => i.storagePath)),
    space.featureKeys.length
      ? db
          .select({ key: featuresTable.key, label: featuresTable.label, icon: featuresTable.icon })
          .from(featuresTable)
          .where(inArray(featuresTable.key, space.featureKeys))
          .orderBy(featuresTable.sortOrder)
      : Promise.resolve([]),
  ]);

  // As mesmas exigências que a action confere no servidor. Mostrar aqui evita
  // a pessoa clicar em publicar para só então descobrir o que falta.
  const pendencias: string[] = [];
  if (space.lat == null || space.lng == null) pendencias.push('marcar o local no mapa');
  if (!space.city?.trim() || !space.district?.trim()) pendencias.push('completar o endereço');
  if ((space.title?.trim().length ?? 0) < 10) pendencias.push('escrever um título');
  if ((space.description?.trim().length ?? 0) < 20) pendencias.push('escrever a descrição');
  if (space.images.length < MIN_PHOTOS_TO_PUBLISH) pendencias.push('adicionar pelo menos uma foto');
  if (!space.availableFrom) pendencias.push('informar a data de disponibilidade');
  if (!space.priceMonthlyCents || space.priceMonthlyCents <= 1) pendencias.push('definir o preço');

  const publicado = Boolean(space.publishedAt);

  return (
    <WizardShell
      spaceId={id} currentStep="revisao" reachedStep={space.draftStep}
      title="Revise seu anúncio"
      description="É assim que ele vai aparecer para quem procura espaço."
    >
      {pendencias.length > 0 && (
        <Alert tone="warning" title="Ainda falta um pouco" className="mb-6">
          Para publicar, você precisa {pendencias.join(', ')}. Use a barra de etapas acima para
          voltar.
        </Alert>
      )}

      <div className="rounded-[var(--radius-card)] border p-4 sm:p-6 mb-8">
        <SpacePreview
          data={{
            type: space.type,
            title: space.title,
            description: space.description,
            district: space.district,
            city: space.city,
            state: space.state,
            sizeM2: space.sizeM2,
            ceilingHeightM: space.ceilingHeightM,
            priceMonthlyCents: space.priceMonthlyCents,
            availableFrom: space.availableFrom,
            accessHours: space.accessHours,
            allowedItems: space.allowedItems,
            forbiddenItems: space.forbiddenItems,
            rulesText: space.rulesText,
            photos: space.images.map((i) => ({
              id: i.id, url: urls.get(i.storagePath) ?? null, alt: i.alt,
            })),
            features: feats,
          }}
        />
      </div>

      <PublishActions spaceId={id} alreadyPublished={publicado} />
    </WizardShell>
  );
}
