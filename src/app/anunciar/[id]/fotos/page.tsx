import type { Metadata } from 'next';
import { loadDraftStep } from '@/lib/spaces/load-step';
import { signImagePaths } from '@/lib/storage/signed-urls';
import { WizardShell } from '@/components/anunciar/wizard-shell';
import { PhotosForm, type PhotoItem } from '@/components/anunciar/photos-form';

export const metadata: Metadata = { title: 'Fotos · Anunciar' };

export default async function FotosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { space } = await loadDraftStep(id);

  // As fotos ficam em bucket privado: a URL é assinada na hora, com validade.
  const urls = await signImagePaths(space.images.map((i) => i.storagePath));
  const photos: PhotoItem[] = space.images.map((i) => ({
    id: i.id,
    url: urls.get(i.storagePath) ?? null,
    alt: i.alt,
  }));

  return (
    <WizardShell
      spaceId={id}
      currentStep="fotos"
      reachedStep={space.draftStep}
      title="Mostre o espaço"
      description="Anúncios com foto real recebem muito mais contato. Não precisa de câmera boa — precisa mostrar o lugar como ele é."
    >
      <PhotosForm spaceId={id} initialPhotos={photos} />
    </WizardShell>
  );
}
