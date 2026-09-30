import Link from 'next/link';
import { X } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import type { NeedSummary } from '@/lib/search/need/params';

/**
 * O que a busca por necessidade entendeu (Fase 23).
 *
 * Continua parecendo busca, não conversa: uma linha "Resultados para:" com
 * os critérios que ESTÃO valendo (cada um sai com um toque), e embaixo, em
 * texto pequeno, o que foi lido mas não vira filtro. Nenhuma menção a IA —
 * ela é ferramenta interna, não personagem.
 */
export function NeedSummaryView({ summary }: { summary: NeedSummary }) {
  const nadaEntendido = summary.chips.length === 0;

  return (
    <section aria-label="Critérios da sua busca" className="space-y-2" data-testid="busca-entendida">
      {nadaEntendido ? (
        <p className="text-[0.875rem] text-[var(--content-muted)]">
          Não identificamos um critério em “{summary.text}”. Tente algo como “garagem coberta no centro até R$ 300”,
          ou use os filtros abaixo.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span id="criterios-da-busca" className="text-[0.875rem] text-[var(--content-muted)]">
            Resultados para:
          </span>
          <ul aria-labelledby="criterios-da-busca" className="flex flex-wrap gap-1.5">
            {summary.chips.map((c) => (
              <li key={c.id}>
                <Link
                  href={c.removeHref}
                  data-chip={c.id}
                  aria-label={`${c.label} — tirar da busca`}
                  className="inline-flex items-center gap-1 h-8 pl-3 pr-2 rounded-[var(--radius-pill)] border text-[0.8125rem] hover:border-[var(--content-subtle)] transition-colors"
                >
                  {c.label}
                  <X className="size-3.5 text-[var(--content-subtle)]" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.nearMeWithoutLocation && (
        <p className="text-[0.8125rem] text-[var(--content-muted)]">
          Para ver os mais perto de você, toque em “Usar minha localização” e busque de novo.
        </p>
      )}
      {summary.notes.map((n) => (
        <p key={n} className="text-[0.8125rem] text-[var(--content-muted)]">
          {n}
        </p>
      ))}
      {summary.ignored.length > 0 && (
        <p className="text-[0.8125rem] text-[var(--content-subtle)]" data-testid="busca-ignorado">
          Não usamos na busca: {summary.ignored.join(', ')}.
        </p>
      )}
      {summary.aiUnavailable && (
        <Alert tone="info">
          Não conseguimos processar a busca inteligente agora. Você pode continuar usando os filtros tradicionais.
        </Alert>
      )}
    </section>
  );
}
