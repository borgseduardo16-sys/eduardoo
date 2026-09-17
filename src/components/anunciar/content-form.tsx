'use client';

import { useActionState, useState } from 'react';
import { saveStepAction, type SpaceActionState } from '@/lib/spaces/actions';
import { TITLE_MAX, DESCRIPTION_MAX } from '@/lib/spaces/schemas';
import { SPACE_TYPE_CONFIG, type SpaceTypeKey } from '@/lib/spaces/types';
import { Input, Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { StepActions } from './step-actions';
import { useAdvanceOnSave } from './use-advance';
import { cn } from '@/lib/utils';

/** Contador de caracteres que só chama atenção quando está perto do limite. */
function Counter({ value, max }: { value: number; max: number }) {
  const restante = max - value;
  return (
    <span
      className={cn(
        'text-[0.75rem] tabular-nums',
        restante < 0
          ? 'text-[var(--color-critical)]'
          : restante <= max * 0.1
            ? 'text-[var(--color-caution)]'
            : 'text-[var(--content-subtle)]',
      )}
    >
      {value}/{max}
    </span>
  );
}

export function ContentForm({
  spaceId, spaceType, initial,
}: {
  spaceId: string;
  spaceType: SpaceTypeKey;
  initial: { title: string | null; description: string | null };
}) {
  const [state, action] = useActionState<SpaceActionState | undefined, FormData>(
    saveStepAction, undefined,
  );
  const [title, setTitle] = useState(initial.title ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  useAdvanceOnSave(state?.ok, `/anunciar/${spaceId}/preco`);

  const err = (k: string) => state?.fieldErrors?.[k]?.[0];

  return (
    <form action={action} noValidate>
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="step" value="descricao" />

      {state?.message && !state.ok && (
        <Alert tone="critical" className="mb-5">{state.message}</Alert>
      )}

      <div className="space-y-6">
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="title" className="text-sm font-medium">Título do anúncio</label>
            <Counter value={title.length} max={TITLE_MAX} />
          </div>
          <Input
            id="title" name="title" value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={TITLE_MAX}
            placeholder={SPACE_TYPE_CONFIG[spaceType].titleExample}
            aria-invalid={err('title') ? true : undefined}
            required
          />
          {err('title') ? (
            <p role="alert" className="text-[0.8125rem] text-[var(--color-critical)]">{err('title')}</p>
          ) : (
            <p className="text-[0.8125rem] text-[var(--content-muted)]">
              Diga o que é e onde fica. É a primeira coisa que aparece na busca.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="description" className="text-sm font-medium">
              Conte mais sobre seu espaço
            </label>
            <Counter value={description.length} max={DESCRIPTION_MAX} />
          </div>
          <Textarea
            id="description" name="description" value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={DESCRIPTION_MAX}
            rows={8}
            className="min-h-44"
            placeholder="Explique para que o espaço serve, como funciona o acesso e o que é importante saber antes de alugar."
            aria-invalid={err('description') ? true : undefined}
            required
          />
          {err('description') && (
            <p role="alert" className="text-[0.8125rem] text-[var(--color-critical)]">
              {err('description')}
            </p>
          )}
        </div>

        <div className="rounded-[var(--radius-field)] border p-4 space-y-2 bg-[var(--surface-sunken)]">
          <h2 className="text-[0.875rem] font-medium">O que costuma funcionar</h2>
          <ul className="text-[0.8125rem] text-[var(--content-muted)] space-y-1 leading-relaxed">
            <li>Como é o acesso: chave, portão, horário, se precisa avisar antes</li>
            <li>O que cabe de verdade ali — em vez de só a metragem</li>
            <li>O que tem por perto: ponto de ônibus, comércio, referência conhecida</li>
            <li>Qualquer limitação: degrau na entrada, teto baixo em parte do espaço</li>
          </ul>
          <p className="text-[0.75rem] text-[var(--content-subtle)] pt-1">
            Escreva com suas palavras. Não preenchemos nada por você — informação que você não
            confirmou vira reclamação na visita.
          </p>
        </div>
      </div>

      <StepActions backHref={`/anunciar/${spaceId}/fotos`} />
    </form>
  );
}
