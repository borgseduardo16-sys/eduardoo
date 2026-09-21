import Link from 'next/link';
import { MapPin, MessageCircle, AtSign, Phone, Star, ExternalLink } from 'lucide-react';
import type { LeadRow } from '@/lib/prospecting/queries';
import { Badge } from '@/components/ui/badge';
import { SaveLeadButton } from './save-lead-button';

export function LeadCard({ lead }: { lead: LeadRow }) {
  const cidadeEstado = [lead.city, lead.state].filter(Boolean).join(' - ');

  return (
    <div className="rounded-[var(--radius-card)] border bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-subtle)] space-y-4 flex flex-col h-full">
      <div className="space-y-2">
        <Badge tone="positive" dot>
          SEM SITE IDENTIFICADO
        </Badge>
        {lead.confidence === 'verificacao_recomendada' && (
          <Badge tone="caution">Verificação recomendada</Badge>
        )}
      </div>

      <div className="space-y-1">
        <Link href={`/leads/${lead.id}`} className="font-semibold text-[1.0625rem] leading-snug hover:text-[var(--accent)]">
          {lead.name}
        </Link>
        {lead.category && (
          <p className="text-[0.8125rem] text-[var(--content-muted)]">{lead.category}</p>
        )}
      </div>

      <div className="space-y-1.5 text-[0.875rem] text-[var(--content-muted)]">
        {cidadeEstado && (
          <p className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{cidadeEstado}</span>
          </p>
        )}
        {lead.rating && (
          <p className="flex items-center gap-1.5">
            <Star className="size-3.5 shrink-0 text-[var(--color-caution)]" fill="currentColor" aria-hidden />
            <span className="font-medium text-[var(--content)]">{Number(lead.rating).toFixed(1)}</span>
            <span>
              ({lead.reviewCount ?? 0} {lead.reviewCount === 1 ? 'avaliação' : 'avaliações'})
            </span>
          </p>
        )}
        {lead.phone && (
          <p className="flex items-center gap-1.5">
            <Phone className="size-3.5 shrink-0" aria-hidden />
            {lead.phone}
          </p>
        )}
      </div>

      <p className="text-[0.8125rem] text-[var(--content-muted)] leading-relaxed">
        {lead.classificationDetail ?? 'Não foi identificada presença digital própria semelhante a um site.'}
      </p>

      <div className="mt-auto pt-3 border-t flex flex-wrap items-center gap-2">
        {lead.whatsappUrl && (
          <a
            href={lead.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[0.8125rem] text-[var(--content-muted)] hover:text-[var(--accent)]"
          >
            <MessageCircle className="size-4" aria-hidden /> WhatsApp
          </a>
        )}
        {lead.instagramUrl && (
          <a
            href={lead.instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[0.8125rem] text-[var(--content-muted)] hover:text-[var(--accent)]"
          >
            <AtSign className="size-4" aria-hidden /> Instagram
          </a>
        )}
        {lead.mapsUrl && (
          <a
            href={lead.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[0.8125rem] text-[var(--content-muted)] hover:text-[var(--accent)]"
          >
            <ExternalLink className="size-4" aria-hidden /> Maps
          </a>
        )}
      </div>

      <SaveLeadButton leadId={lead.id} initialSaved={lead.isSaved} />
    </div>
  );
}
