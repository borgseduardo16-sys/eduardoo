'use client';

import { useActionState, useState } from 'react';
import { Check, X } from 'lucide-react';
import { resolveReportAction, type AdminActionState } from '@/lib/admin/actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/auth/form-shell';

/**
 * Resolve uma denúncia da fila — procedente ou improcedente, com nota.
 *
 * Mesmo padrão do RespondRequestActions (aceitar/recusar solicitação): a
 * decisão final some com um clique, então o estado de sucesso vive aqui,
 * local, e é checado ANTES do desaparecimento do item na lista (que só
 * acontece no próximo carregamento da fila).
 */
export function ResolveReportForm({ reportId }: { reportId: string }) {
  const [decisao, setDecisao] = useState<'upheld' | 'dismissed' | null>(null);

  const [estado, resolver] = useActionState<AdminActionState | undefined, FormData>(
    resolveReportAction,
    undefined,
  );

  if (estado?.ok) {
    return <Alert tone="success">{estado.message}</Alert>;
  }

  if (decisao) {
    return (
      <form action={resolver} className="space-y-2">
        <input type="hidden" name="reportId" value={reportId} />
        <input type="hidden" name="decision" value={decisao} />
        {estado?.message && !estado.ok && <Alert tone="critical">{estado.message}</Alert>}
        <Textarea
          name="resolutionNote"
          maxLength={1000}
          placeholder={
            decisao === 'upheld'
              ? 'O que confirmou a denúncia? (fica registrado)'
              : 'Por que a denúncia não procede? (opcional)'
          }
          className="min-h-20 text-[0.875rem]"
        />
        {estado?.fieldErrors?.resolutionNote && (
          <p role="alert" className="text-[0.8125rem] text-[var(--color-critical)]">
            {estado.fieldErrors.resolutionNote[0]}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setDecisao(null)}>
            Voltar
          </Button>
          <SubmitButton size="sm" block={false} variant={decisao === 'upheld' ? 'critical' : 'secondary'}>
            {decisao === 'upheld' ? 'Confirmar como procedente' : 'Confirmar como improcedente'}
          </SubmitButton>
        </div>
      </form>
    );
  }

  return (
    <div className="flex gap-2">
      <Button type="button" variant="critical" size="sm" onClick={() => setDecisao('upheld')}>
        <Check className="size-4" aria-hidden />
        Procedente
      </Button>
      <Button type="button" variant="secondary" size="sm" onClick={() => setDecisao('dismissed')}>
        <X className="size-4" aria-hidden />
        Improcedente
      </Button>
    </div>
  );
}
