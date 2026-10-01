'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { ArrowRight, Search } from 'lucide-react';
import { createDraftAction, type SpaceActionState } from '@/lib/spaces/actions';
import { searchSpaceTypes, spaceTypeOptions } from '@/lib/spaces/types';
import { Icon } from '@/components/safety/icon';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="sticky bottom-0 -mx-4 sm:mx-0 mt-8 px-4 sm:px-0 py-4 bg-[var(--surface)]/95 backdrop-blur-sm border-t sm:border-t-0">
      <Button type="submit" size="lg" block loading={pending} disabled={disabled}>
        Continuar
        {!pending && <ArrowRight className="size-4" aria-hidden />}
      </Button>
    </div>
  );
}

/**
 * Primeira etapa: que tipo de espaço é.
 *
 * A escolha define o resto do formulário — quais características aparecem,
 * quais medidas são pedidas, que exemplos são mostrados. Por isso vem antes
 * de tudo: perguntar "altura do pé-direito" para uma vaga de moto seria
 * ruído, e não perguntar para um galpão seria omissão.
 */
export function TypePicker() {
  const [selected, setSelected] = useState<string>('');
  const [state, action] = useActionState<SpaceActionState | undefined, FormData>(
    createDraftAction,
    undefined,
  );

  const [busca, setBusca] = useState('');
  const encontrados = new Set(searchSpaceTypes(busca));
  // O tipo já escolhido nunca some da grade por causa da busca.
  const options = spaceTypeOptions().filter((o) => encontrados.has(o.value) || o.value === selected);

  return (
    <form action={action}>
      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[var(--content-muted)] pointer-events-none" aria-hidden />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar categoria (ex.: estacionamento, salão, oficina)"
          aria-label="Buscar categoria"
          className={cn(
            'w-full h-11 pl-10 pr-3.5 rounded-[var(--radius-field)] bg-[var(--surface)]',
            'border border-[var(--border-strong)] placeholder:text-[var(--content-subtle)]',
            'focus:outline-none focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/20',
            'text-base md:text-[0.9375rem]',
          )}
        />
      </div>
      {state?.message && !state.ok && (
        <Alert tone="critical" className="mb-5">
          {state.message}
        </Alert>
      )}

      <fieldset>
        <legend className="sr-only">Tipo de espaço</legend>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {options.map((opt) => {
            const active = selected === opt.value;
            return (
              <label
                key={opt.value}
                className={cn(
                  'relative flex flex-col gap-2 p-4 rounded-[var(--radius-card)] border cursor-pointer',
                  'transition-colors duration-150 min-h-[7rem]',
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-subtle)] ring-1 ring-[var(--accent)]'
                    : 'hover:border-[var(--content-subtle)] hover:bg-[var(--surface-sunken)]',
                )}
              >
                <input
                  type="radio"
                  name="type"
                  value={opt.value}
                  checked={active}
                  onChange={(e) => setSelected(e.target.value)}
                  className="sr-only"
                  required
                />
                <Icon
                  name={opt.icon}
                  className={cn(
                    'size-5',
                    active ? 'text-[var(--accent)]' : 'text-[var(--content-muted)]',
                  )}
                />
                <span className="space-y-0.5">
                  <span className="block text-[0.9375rem] font-medium leading-tight">
                    {opt.label}
                  </span>
                  <span className="block text-[0.75rem] text-[var(--content-muted)] leading-snug">
                    {opt.hint}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {state?.fieldErrors?.type?.[0] && (
        <p role="alert" className="mt-3 text-[0.8125rem] text-[var(--color-critical)]">
          {state.fieldErrors.type[0]}
        </p>
      )}

      <Submit disabled={!selected} />
    </form>
  );
}
