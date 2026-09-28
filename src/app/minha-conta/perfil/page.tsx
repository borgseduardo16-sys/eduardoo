import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { getOwnProfileForEdit } from '@/lib/profiles/queries';
import { signImagePath } from '@/lib/storage/signed-urls';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { AvatarUploader } from '@/components/profile/avatar-uploader';
import { ProfileEditForm } from '@/components/profile/profile-edit-form';

export const metadata: Metadata = { title: 'Editar perfil', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Edição do perfil público (Fase 21): foto, nome de exibição e apresentação.
 *
 * Avaliações, verificações e locações concluídas aparecem no perfil, mas
 * não se editam — vêm do que aconteceu de verdade na plataforma.
 */
export default async function EditarPerfilPage() {
  const user = await requireUser('/minha-conta/perfil');
  const perfil = await getOwnProfileForEdit(user.id);
  const avatarUrl = await signImagePath(perfil?.avatarPath ?? null);
  const primeiroNome = perfil?.fullName?.trim().split(/\s+/)[0] ?? null;

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-2xl px-4 sm:px-6 py-8 sm:py-10 space-y-8">
        <header className="space-y-2">
          <Link
            href="/minha-conta"
            className="inline-flex items-center gap-1.5 text-[0.875rem] text-[var(--content-muted)] hover:text-[var(--content)]"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Minha conta
          </Link>
          <h1 className="text-[1.75rem] font-semibold">Seu perfil</h1>
          <p className="text-[var(--content-muted)] leading-relaxed">
            O que outras pessoas veem quando olham quem anuncia ou quem pediu um espaço.
          </p>
          <Link
            href={`/perfil/${user.id}`}
            className="inline-flex items-center gap-1.5 text-[0.875rem] text-[var(--accent)] underline-offset-4 hover:underline"
          >
            Ver meu perfil público
            <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        </header>

        <section aria-labelledby="foto-titulo" className="space-y-4">
          <h2 id="foto-titulo" className="font-semibold">
            Foto
          </h2>
          <AvatarUploader currentUrl={avatarUrl} name={perfil?.publicName ?? null} />
        </section>

        <section aria-labelledby="dados-titulo" className="space-y-4 border-t pt-8">
          <h2 id="dados-titulo" className="font-semibold">
            Nome e apresentação
          </h2>
          <ProfileEditForm
            initialDisplayName={perfil?.displayName ?? null}
            initialBio={perfil?.bio ?? null}
            fallbackName={primeiroNome}
          />
        </section>

        <section aria-labelledby="nao-editavel" className="border-t pt-8 space-y-2">
          <h2 id="nao-editavel" className="font-semibold">
            O que não se edita
          </h2>
          <p className="text-[0.9375rem] text-[var(--content-muted)] leading-relaxed">
            Nota, número de avaliações, locações concluídas e verificações vêm do que aconteceu de
            verdade na plataforma e não podem ser editados. A moderação pode apenas ocultar uma
            avaliação que viole as regras — nunca mudar nota ou texto. Para verificar e-mail ou
            telefone, use{' '}
            <Link href="/minha-conta/verificacoes" className="text-[var(--accent)] underline underline-offset-2">
              Verificações
            </Link>
            .
          </p>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
