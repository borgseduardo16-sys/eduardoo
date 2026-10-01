'use client';

import { useActionState } from 'react';
import { Check } from 'lucide-react';
import {
  applyListingSuggestionAction,
  dismissListingSuggestionAction,
  requestListingSuggestionAction,
  type ListingAiActionState,
} from '@/lib/listing-ai/actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

/** Pedir sugestões (Fase 23). A resposta pode levar alguns segundos — o botão diz isso. */
export function RequestSuggestionForm({
  spaceId,
  disabledReason,
  hasPrevious,
  lastFailed,
}: {
  spaceId: string;
  /** Por que não dá para pedir agora (limite, intervalo, não configurado). */
  disabledReason: string | null;
  hasPrevious: boolean;
  /** O último pedido gravado falhou (mostrado só quando não há resposta mais nova nesta tela). */
  lastFailed: boolean;
}) {
  const [estado, acao, enviando] = useActionState<ListingAiActionState | undefined, FormData>(
    requestListingSuggestionAction,
    undefined,
  );
  return (
    <div className="space-y-2" data-testid="pedir-sugestoes">
      <form action={acao}>
        <input type="hidden" name="spaceId" value={spaceId} />
        <Button type="submit" loading={enviando} disabled={Boolean(disabledReason)}>
          {enviando ? 'Lendo o anúncio…' : hasPrevious ? 'Pedir novas sugestões' : 'Pedir sugestões'}
        </Button>
      </form>
      {/* Um aviso por vez: a resposta do pedido que acabou de acontecer vale mais que o registro do anterior. */}
      {estado?.message ? (
        <Alert tone={estado.ok ? 'success' : 'warning'}>{estado.message}</Alert>
      ) : lastFailed ? (
        <Alert tone="warning">Não conseguimos gerar sugestões no último pedido. Nada mudou no anúncio.</Alert>
      ) : null}
      {disabledReason && !estado && <p className="text-[0.8125rem] text-[var(--content-muted)]">{disabledReason}</p>}
    </div>
  );
}

export function ApplySuggestionButton({
  suggestionId,
  field,
  applied,
}: {
  suggestionId: string;
  field: 'title' | 'description';
  applied: boolean;
}) {
  const [estado, acao, enviando] = useActionState<ListingAiActionState | undefined, FormData>(
    applyListingSuggestionAction,
    undefined,
  );
  if (applied || estado?.ok) {
    return (
      <p className="inline-flex items-center gap-1.5 text-[0.875rem] text-[var(--color-positive)]" data-testid={`aplicado-${field}`}>
        <Check className="size-4" aria-hidden />
        {estado?.message ?? 'Já está no anúncio'}
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      <form action={acao}>
        <input type="hidden" name="suggestionId" value={suggestionId} />
        <input type="hidden" name="field" value={field} />
        <Button type="submit" size="sm" variant="secondary" loading={enviando} data-testid={`usar-${field}`}>
          {field === 'title' ? 'Usar este título' : 'Usar esta descrição'}
        </Button>
      </form>
      {estado && !estado.ok && <p role="alert" className="text-[0.8125rem] text-[var(--color-critical)]">{estado.message}</p>}
    </div>
  );
}

export function DismissSuggestionButton({ suggestionId }: { suggestionId: string }) {
  const [estado, acao, enviando] = useActionState<ListingAiActionState | undefined, FormData>(
    dismissListingSuggestionAction,
    undefined,
  );
  return (
    <form action={acao} className="space-y-1.5">
      <input type="hidden" name="suggestionId" value={suggestionId} />
      <Button type="submit" size="sm" variant="quiet" loading={enviando}>
        Descartar sugestões
      </Button>
      {estado?.message && !estado.ok && <p role="alert" className="text-[0.8125rem] text-[var(--color-critical)]">{estado.message}</p>}
    </form>
  );
}
