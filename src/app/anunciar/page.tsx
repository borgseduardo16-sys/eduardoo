import type { Metadata } from 'next';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { listOwnerSpaces } from '@/lib/spaces/queries';
import { spaceTypeLabel } from '@/lib/spaces/types';
import { STEPS, TOTAL_STEPS } from '@/lib/spaces/schemas';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { TypePicker } from '@/components/anunciar/type-picker';
import type { SpaceTypeKey } from '@/lib/spaces/types';

export const metadata: Metadata = { title: 'Anunciar meu espaço' };

export default async function AnunciarPage() {
  const user = await requireUser('/anunciar');
  const drafts = (await listOwnerSpaces(user.id, ['draft'])).slice(0, 5);

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-2xl px-4 sm:px-6 py-8 sm:py-12">
        {drafts.length > 0 && (
          <section className="mb-10 space-y-3">
            <h2 className="text-[0.8125rem] font-semibold uppercase tracking-wide text-[var(--content-subtle)]">
              Continuar de onde parou
            </h2>
            <ul className="space-y-2">
              {drafts.map((d) => {
                const etapa = STEPS.find((s) => s.n === d.draftStep) ?? STEPS[0];
                return (
                  <li key={d.id}>
                    <Link
                      href={`/anunciar/${d.id}/${etapa.key}`}
                      className="flex items-center justify-between gap-3 p-4 rounded-[var(--radius-card)] border hover:bg-[var(--surface-sunken)] transition-colors"
                    >
                      <span className="min-w-0">
                        <span className="block font-medium truncate">
                          {d.title?.trim() || `${spaceTypeLabel(d.type as SpaceTypeKey)} sem título`}
                        </span>
                        <span className="block text-[0.8125rem] text-[var(--content-muted)]">
                          Etapa {d.draftStep} de {TOTAL_STEPS} · {etapa.label}
                        </span>
                      </span>
                      <Pencil className="size-4 shrink-0 text-[var(--content-subtle)]" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <header className="mb-6 space-y-2">
          <h1 className="text-[1.75rem] sm:text-[2rem] font-semibold">
            {drafts.length > 0 ? 'Ou comece um anúncio novo' : 'O que você quer anunciar?'}
          </h1>
          <p className="text-[var(--content-muted)] leading-relaxed">
            Anunciar é gratuito. Você define o preço e decide quem aceita — a plataforma só
            cobra quando você recebe.
          </p>
        </header>

        <TypePicker />
      </main>

      <SiteFooter />
    </>
  );
}
