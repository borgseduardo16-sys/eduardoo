'use client';

import { useActionState, useState } from 'react';
import { updateAccountStatusAction, type AdminActionState } from '@/lib/admin/actions';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/auth/form-shell';

const OPCOES = [
  { value: 'active', label: 'Ativa' },
  { value: 'suspended', label: 'Suspensa' },
  { value: 'banned', label: 'Banida' },
] as const;

export function AccountStatusForm({
  userId,
  currentStatus,
  currentReason,
}: {
  userId: string;
  currentStatus: string;
  currentReason: string | null;
}) {
  const [status, setStatus] = useState(currentStatus);
  const [estado, atualizar] = useActionState<AdminActionState | undefined, FormData>(
    updateAccountStatusAction,
    undefined,
  );

  return (
    <form action={atualizar} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />

      {estado?.ok && <Alert tone="success">{estado.message}</Alert>}
      {estado?.message && !estado.ok && <Alert tone="critical">{estado.message}</Alert>}

      <Field label="Status da conta" htmlFor={`status-${userId}`}>
        <select
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full h-11 px-3 rounded-[var(--radius-field)] bg-[var(--surface)] border border-[var(--border-strong)] text-base md:text-[0.9375rem] focus:outline-none focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/20"
        >
          {OPCOES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      {status !== 'active' && (
        <Field
          label="Motivo"
          htmlFor={`reason-${userId}`}
          error={estado?.fieldErrors?.statusReason?.[0]}
          hint="Aparece para a pessoa em /conta-bloqueada."
        >
          <Textarea name="statusReason" defaultValue={currentReason ?? ''} maxLength={500} className="min-h-20 text-[0.875rem]" />
        </Field>
      )}

      <SubmitButton size="sm" block={false}>
        Salvar status
      </SubmitButton>
    </form>
  );
}
