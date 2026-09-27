'use client';

import { useActionState, useState } from 'react';
import { resolveDepositAction, type AdminActionState } from '@/lib/admin/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/auth/form-shell';
import { formatBRL } from '@/lib/money';

/**
 * Decide o destino da caução de uma denúncia de dano — separado da decisão
 * de procedência (ResolveReportForm): mexe com Asaas de verdade, pode falhar
 * sozinho, e precisa poder ser tentado de novo sem reabrir a denúncia.
 */
export function ResolveDepositForm({
  bookingId,
  reportId,
  depositAmountCents,
}: {
  bookingId: string;
  reportId: string;
  depositAmountCents: number;
}) {
  const [aberto, setAberto] = useState(false);
  const [estado, resolver] = useActionState<AdminActionState | undefined, FormData>(resolveDepositAction, undefined);

  if (estado?.ok) {
    return <Alert tone="success">{estado.message}</Alert>;
  }

  if (!aberto) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setAberto(true)}>
        Decidir caução ({formatBRL(depositAmountCents)})
      </Button>
    );
  }

  return (
    <form action={resolver} className="space-y-2 rounded-[var(--radius-field)] border p-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="reportId" value={reportId} />
      <p className="text-[0.8125rem] text-[var(--content-muted)]">
        Caução cobrada: {formatBRL(depositAmountCents)}. Quanto fica retido a favor do proprietário?
        Digite 0,00 pra devolver tudo ao locatário.
      </p>
      {estado?.message && !estado.ok && <Alert tone="critical">{estado.message}</Alert>}
      <Input name="forfeitValue" placeholder="0,00" defaultValue="0,00" className="max-w-40" />
      {estado?.fieldErrors?.forfeitValue && (
        <p role="alert" className="text-[0.8125rem] text-[var(--color-critical)]">
          {estado.fieldErrors.forfeitValue[0]}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>
          Voltar
        </Button>
        <SubmitButton size="sm" block={false} variant="critical">
          Confirmar
        </SubmitButton>
      </div>
    </form>
  );
}
