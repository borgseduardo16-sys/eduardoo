'use client';

import { useState, useTransition } from 'react';
import { updateLeadStatusAction } from '@/lib/prospecting/actions';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS = [
  { value: 'novo', label: 'Novo' },
  { value: 'contato_realizado', label: 'Contato realizado' },
  { value: 'em_negociacao', label: 'Em negociação' },
  { value: 'cliente', label: 'Cliente' },
  { value: 'sem_interesse', label: 'Sem interesse' },
] as const;

export function LeadStatusSelect({ leadId, status }: { leadId: string; status: string }) {
  const [value, setValue] = useState(status);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      <select
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          const prev = value;
          setValue(next);
          setErro(null);
          startTransition(async () => {
            const res = await updateLeadStatusAction(leadId, next);
            if (!res.ok) {
              setValue(prev);
              setErro(res.message ?? 'Não foi possível atualizar o status.');
            }
          });
        }}
        className={cn(
          'h-9 px-2.5 rounded-[var(--radius-field)] border border-[var(--border-strong)] text-[0.8125rem] font-medium',
          'bg-[var(--surface)] focus:outline-none focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/20',
          pending && 'opacity-60',
        )}
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {erro && <p className="text-[0.75rem] text-[var(--color-critical)]">{erro}</p>}
    </div>
  );
}
