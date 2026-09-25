'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Sparkles } from 'lucide-react';
import { requestQualityAssessmentAction, type QualityActionState } from '@/lib/quality/actions';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

const ESTADOS = [
  { value: 'ruim', label: 'Ruim' },
  { value: 'regular', label: 'Regular' },
  { value: 'bom', label: 'Bom' },
  { value: 'muito_bom', label: 'Muito bom' },
  { value: 'excelente', label: 'Excelente' },
] as const;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      {!pending && <Sparkles className="size-4" aria-hidden />}
      {pending ? 'Analisando fotos com IA…' : 'Classificar espaço'}
    </Button>
  );
}

export function AssessmentForm({ spaceId, hasResult }: { spaceId: string; hasResult: boolean }) {
  const [state, action] = useActionState<QualityActionState | undefined, FormData>(
    requestQualityAssessmentAction,
    undefined,
  );

  return (
    <form action={action} className="rounded-[var(--radius-card)] border border-dashed p-5 sm:p-6 space-y-4">
      <div className="space-y-1">
        <h2 className="font-medium">{hasResult ? 'Classificar novamente' : 'Classificar este espaço'}</h2>
        <p className="text-[0.8125rem] text-[var(--content-muted)]">
          A IA analisa as fotos de verdade (acabamento, sinais de desgaste) e soma isso ao que você informar
          abaixo. Só você vê o resultado — não aparece pra quem busca espaços.
        </p>
      </div>

      <input type="hidden" name="spaceId" value={spaceId} />

      {state?.message && !state.ok && <Alert tone="critical">{state.message}</Alert>}

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Estado de conservação" htmlFor="conservationState">
          <select
            name="conservationState"
            required
            defaultValue="bom"
            className="w-full h-11 px-3.5 rounded-[var(--radius-field)] bg-[var(--surface)] border border-[var(--border-strong)] text-base md:text-[0.9375rem] focus:outline-none focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/20"
          >
            {ESTADOS.map((e) => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Idade do espaço (anos)" htmlFor="ageYears" hint="Aproximada está ótimo.">
          <Input type="number" name="ageYears" min={0} max={200} step={1} defaultValue={10} required />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-[0.875rem]">
        <input type="checkbox" name="renovatedRecently" className="size-4 rounded border-[var(--border-strong)]" />
        Passou por reforma recente
      </label>

      <SubmitButton />
    </form>
  );
}
