import { Sparkles, TrendingUp, TriangleAlert } from 'lucide-react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { CONSERVATION_LABEL, type ConservationState, type QualityClassification } from '@/lib/quality/scoring';
import type { QualityAssessmentRow } from '@/lib/quality/queries';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';

const CLASSIFICATION_INFO: Record<QualityClassification, { label: string; tone: BadgeProps['tone'] }> = {
  economico: { label: 'Econômico', tone: 'neutral' },
  medio: { label: 'Médio', tone: 'neutral' },
  alto_padrao: { label: 'Alto padrão', tone: 'accent' },
  luxo: { label: 'Luxo', tone: 'positive' },
};

const COMPONENTES = [
  { key: 'photosScore' as const, label: 'Fotos', peso: '45%' },
  { key: 'locationScore' as const, label: 'Localização', peso: '25%' },
  { key: 'structureScore' as const, label: 'Estrutura', peso: '15%' },
  { key: 'extrasScore' as const, label: 'Extras', peso: '15%' },
];

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value);
}

export function AssessmentResult({ assessment }: { assessment: QualityAssessmentRow }) {
  const info = CLASSIFICATION_INFO[assessment.classification];

  return (
    <div className="rounded-[var(--radius-card)] border p-5 sm:p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-[var(--accent)]" aria-hidden />
          <span className="text-[0.8125rem] text-[var(--content-muted)]">
            Classificado em {formatDate(assessment.createdAt)}
          </span>
        </div>
        <Badge tone={info.tone}>{info.label}</Badge>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-[2.5rem] font-semibold leading-none tabular-nums">
          {Number(assessment.finalScore).toFixed(1)}
        </span>
        <span className="text-[var(--content-muted)]">/ 10</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {COMPONENTES.map((c) => (
          <div key={c.key} className="space-y-1">
            <p className="text-[0.75rem] text-[var(--content-subtle)]">
              {c.label} <span className="opacity-70">({c.peso})</span>
            </p>
            <p className="font-medium tabular-nums">{Number(assessment[c.key]).toFixed(1)}</p>
          </div>
        ))}
      </div>

      <p className="text-[0.9375rem] text-[var(--content-muted)] leading-relaxed">{assessment.explanation}</p>

      {assessment.userAiDivergent && (
        <p className="text-[0.8125rem] text-[color-mix(in_oklch,var(--color-caution)_75%,var(--content))]">
          A IA percebeu um estado de conservação diferente do que você informou (você: “
          {CONSERVATION_LABEL[assessment.conservationState as ConservationState]}”, IA: “
          {CONSERVATION_LABEL[assessment.aiConservationState as ConservationState]}”).
        </p>
      )}

      {assessment.aiFindings.sinaisDeDesgaste.length > 0 && (
        <div className="space-y-1">
          <p className="text-[0.8125rem] font-medium">Sinais de desgaste identificados nas fotos</p>
          <ul className="text-[0.8125rem] text-[var(--content-muted)] list-disc pl-4 space-y-0.5">
            {assessment.aiFindings.sinaisDeDesgaste.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      <PriceSuggestionBlock assessment={assessment} />
    </div>
  );
}

function PriceSuggestionBlock({ assessment }: { assessment: QualityAssessmentRow }) {
  if (assessment.suggestedPriceIdealCents == null) {
    return (
      <div className="pt-4 border-t space-y-1">
        <p className="text-[0.8125rem] font-medium flex items-center gap-1.5">
          <TrendingUp className="size-3.5" aria-hidden />
          Sugestão de valor de aluguel
        </p>
        <p className="text-[0.8125rem] text-[var(--content-muted)]">
          Nenhum anúncio comparável (mesmo tipo, mesma cidade) publicado ainda — sem dado real pra sugerir um
          valor.
        </p>
      </div>
    );
  }

  return (
    <div className="pt-4 border-t space-y-2">
      <p className="text-[0.8125rem] font-medium flex items-center gap-1.5">
        <TrendingUp className="size-3.5" aria-hidden />
        Sugestão de valor de aluguel
      </p>
      <p className="text-[1.375rem] font-semibold tabular-nums">{formatBRL(assessment.suggestedPriceIdealCents)}</p>
      <p className="text-[0.8125rem] text-[var(--content-muted)]">
        Faixa sugerida: {formatBRL(assessment.suggestedPriceMinCents!)} a {formatBRL(assessment.suggestedPriceMaxCents!)}
        {' · '}baseado em {assessment.priceComparablesCount} anúncio{assessment.priceComparablesCount === 1 ? '' : 's'}{' '}
        comparável{assessment.priceComparablesCount === 1 ? '' : 'eis'} — é uma sugestão, não obrigatório usar.
      </p>
      {assessment.priceLowConfidence && (
        <p className="text-[0.8125rem] text-[color-mix(in_oklch,var(--color-caution)_75%,var(--content))] flex items-center gap-1.5">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          Poucos anúncios comparáveis nesta cidade — confiabilidade baixa.
        </p>
      )}
      {assessment.priceMarketWarning && (
        <p className="text-[0.8125rem] text-[color-mix(in_oklch,var(--color-caution)_75%,var(--content))] flex items-center gap-1.5">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          {assessment.priceMarketWarning === 'acima_da_media'
            ? 'Valor sugerido bem acima da média dos comparáveis.'
            : 'Valor sugerido bem abaixo da média dos comparáveis.'}
        </p>
      )}
    </div>
  );
}

export function AssessmentHistoryList({ history }: { history: QualityAssessmentRow[] }) {
  if (history.length === 0) return null;
  return (
    <details className="rounded-[var(--radius-card)] border p-4">
      <summary className="cursor-pointer text-[0.875rem] font-medium">
        Histórico ({history.length} {history.length === 1 ? 'classificação anterior' : 'classificações anteriores'})
      </summary>
      <ul className="mt-3 space-y-2">
        {history.map((a) => {
          const info = CLASSIFICATION_INFO[a.classification as QualityClassification];
          return (
            <li key={a.id} className={cn('flex items-center justify-between gap-2 text-[0.8125rem] py-1.5', 'border-t first:border-t-0 first:pt-0')}>
              <span className="text-[var(--content-muted)]">{formatDate(a.createdAt)}</span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums font-medium">{Number(a.finalScore).toFixed(1)}</span>
                <Badge tone={info.tone}>{info.label}</Badge>
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
