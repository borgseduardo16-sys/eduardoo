import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink, MessageCircle, AtSign, Link2, Phone, MapPin, Star } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { getLeadForUser } from '@/lib/prospecting/queries';
import { Badge } from '@/components/ui/badge';
import { SaveLeadButton } from '@/components/prospecting/save-lead-button';
import { LeadStatusSelect } from '@/components/prospecting/lead-status-select';
import { LeadNotesForm } from '@/components/prospecting/lead-notes-form';

export const metadata: Metadata = { title: 'Detalhes do lead' };
export const dynamic = 'force-dynamic';

const NAO_ENCONTRADO = 'Não encontrado';

function buildReason(lead: NonNullable<Awaited<ReturnType<typeof getLeadForUser>>>): string {
  const canais: string[] = [];
  if (lead.instagramUrl) canais.push('Instagram');
  if (lead.whatsappUrl) canais.push('WhatsApp');
  if (lead.facebookUrl) canais.push('Facebook');

  const partes: string[] = [];
  if (lead.reviewCount) {
    partes.push(
      `Esta empresa possui ${lead.reviewCount} ${lead.reviewCount === 1 ? 'avaliação' : 'avaliações'} no Google`,
    );
  } else {
    partes.push('Esta empresa não tem avaliações suficientes registradas no Google');
  }

  if (canais.length > 0) {
    partes.push(`e ${canais.length === 1 ? 'foi encontrado' : 'foram encontrados'} ${canais.join(' e ')}`);
  }

  const conclusao =
    lead.confidence === 'verificacao_recomendada'
      ? 'mas não foi possível confirmar com segurança se ela já tem uma página própria — verificação recomendada.'
      : 'mas não foi identificada nenhuma página própria que funcione como site.';

  return `${partes.join(', ')}, ${conclusao}`;
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/leads/${id}`);
  const lead = await getLeadForUser(user.id, id);
  if (!lead) notFound();

  const links = [
    { label: 'Site informado no perfil', href: lead.websiteRaw, icon: ExternalLink },
    { label: 'WhatsApp', href: lead.whatsappUrl, icon: MessageCircle },
    { label: 'Instagram', href: lead.instagramUrl, icon: AtSign },
    { label: 'Facebook', href: lead.facebookUrl, icon: Link2 },
    { label: 'Google Maps', href: lead.mapsUrl, icon: MapPin },
  ].filter((l) => l.href);

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <Link href="/leads" className="text-[0.875rem] text-[var(--content-muted)] hover:text-[var(--content)]">
          ← Meus Leads
        </Link>
      </div>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="positive" dot>
            SEM SITE IDENTIFICADO
          </Badge>
          {lead.confidence === 'verificacao_recomendada' && (
            <Badge tone="caution">Verificação recomendada</Badge>
          )}
        </div>
        <h1 className="text-[1.75rem] font-semibold">{lead.name}</h1>
        <p className="text-[var(--content-muted)]">{lead.category ?? NAO_ENCONTRADO}</p>
      </header>

      <div className="rounded-[var(--radius-card)] border bg-[var(--surface-raised)] p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-semibold">Status do lead</h2>
          <LeadStatusSelect leadId={lead.id} status={lead.savedStatus ?? 'novo'} />
        </div>
        <SaveLeadButton leadId={lead.id} initialSaved={lead.isSaved} />
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">Por que esta empresa é um lead</h2>
        <p className="text-[0.9375rem] text-[var(--content-muted)] leading-relaxed rounded-[var(--radius-card)] border bg-[var(--surface-sunken)] p-4">
          {buildReason(lead)}
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-[0.75rem] uppercase tracking-wide text-[var(--content-subtle)]">Endereço</p>
          <p className="flex items-start gap-1.5">
            <MapPin className="size-4 shrink-0 mt-0.5 text-[var(--content-subtle)]" aria-hidden />
            {lead.address ?? NAO_ENCONTRADO}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-[0.75rem] uppercase tracking-wide text-[var(--content-subtle)]">Telefone</p>
          <p className="flex items-center gap-1.5">
            <Phone className="size-4 shrink-0 text-[var(--content-subtle)]" aria-hidden />
            {lead.phone ?? NAO_ENCONTRADO}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-[0.75rem] uppercase tracking-wide text-[var(--content-subtle)]">Avaliação</p>
          <p className="flex items-center gap-1.5">
            <Star className="size-4 shrink-0 text-[var(--color-caution)]" fill="currentColor" aria-hidden />
            {lead.rating ? Number(lead.rating).toFixed(1) : NAO_ENCONTRADO}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-[0.75rem] uppercase tracking-wide text-[var(--content-subtle)]">Número de avaliações</p>
          <p>{lead.reviewCount ?? NAO_ENCONTRADO}</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Links encontrados</h2>
        {links.length === 0 ? (
          <p className="text-[0.875rem] text-[var(--content-muted)]">Nenhum link encontrado no perfil do Google.</p>
        ) : (
          <ul className="space-y-2">
            {links.map((l) => (
              <li key={l.label}>
                <a
                  href={l.href!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-[0.9375rem] text-[var(--accent)] hover:underline underline-offset-4"
                >
                  <l.icon className="size-4" aria-hidden />
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Observações</h2>
        <LeadNotesForm leadId={lead.id} initialNotes={lead.notes} />
      </section>
    </div>
  );
}
