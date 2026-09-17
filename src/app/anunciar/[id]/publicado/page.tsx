import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CircleCheckBig, ExternalLink, LayoutGrid } from 'lucide-react';
import { loadDraftStep } from '@/lib/spaces/load-step';

export const metadata: Metadata = { title: 'Anúncio publicado' };

export default async function PublicadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { space } = await loadDraftStep(id);

  // Chegar aqui sem ter publicado seria uma confirmação falsa.
  if (!space.publishedAt) notFound();

  return (
    <div className="mx-auto max-w-lg px-4 sm:px-6 py-16 text-center space-y-8">
      <div className="space-y-4">
        <div className="mx-auto size-14 rounded-full grid place-items-center bg-[var(--accent-subtle)]">
          <CircleCheckBig className="size-6 text-[var(--accent)]" aria-hidden />
        </div>
        <div className="space-y-2">
          <h1 className="text-[1.75rem] font-semibold">Seu espaço está no ar</h1>
          <p className="text-[var(--content-muted)] leading-relaxed">
            Já aparece para quem procura espaço na sua região. Quando alguém se interessar, você
            recebe a mensagem por aqui.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <Link
          href={`/espacos/${space.slug}`}
          className="flex items-center justify-center gap-2 h-13 px-6 font-medium rounded-[var(--radius-field)] bg-[var(--accent)] text-[var(--accent-content)] hover:bg-[var(--accent-hover)] transition-colors"
        >
          Ver meu anúncio publicado
          <ExternalLink className="size-4" aria-hidden />
        </Link>
        <Link
          href="/meus-espacos"
          className="flex items-center justify-center gap-2 h-13 px-6 font-medium rounded-[var(--radius-field)] border hover:bg-[var(--surface-sunken)] transition-colors"
        >
          <LayoutGrid className="size-4" aria-hidden />
          Ir para meus espaços
        </Link>
      </div>

      <div className="rounded-[var(--radius-card)] border p-5 text-left space-y-2">
        <h2 className="font-semibold text-[0.9375rem]">O que vem agora</h2>
        <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
          Quem se interessar vai poder conversar com você pela plataforma antes de fechar. O
          endereço completo só é revelado depois que você aceitar a reserva.
        </p>
        <p className="text-[0.8125rem] text-[var(--content-subtle)] leading-relaxed pt-1">
          As conversas e o pagamento entram nas próximas fases. Por enquanto, o anúncio fica
          visível e você pode editá-lo quando quiser.
        </p>
      </div>
    </div>
  );
}
