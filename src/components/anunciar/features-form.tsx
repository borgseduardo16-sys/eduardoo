'use client';

import { useActionState, useState } from 'react';
import { saveStepAction, type SpaceActionState } from '@/lib/spaces/actions';
import { SPACE_TYPE_CONFIG, type SpaceTypeKey } from '@/lib/spaces/types';
import { Icon } from '@/components/safety/icon';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { StepActions } from './step-actions';
import { useAdvanceOnSave } from './use-advance';
import { cn } from '@/lib/utils';

type Feature = { key: string; label: string; icon: string | null; category: string };

const CATEGORY_LABEL: Record<string, string> = {
  estrutura: 'Estrutura',
  seguranca: 'Segurança',
  acesso: 'Acesso',
  veiculo: 'Veículos',
};

/**
 * Etapa 3: medidas e características.
 *
 * O catálogo recebido já vem filtrado pelo tipo de espaço — quem anuncia uma
 * vaga de moto não vê "entrada para caminhão". O que é obrigatório também
 * depende do tipo: galpão precisa de altura, vaga não.
 */
export function FeaturesForm({
  spaceId, spaceType, catalog, initial,
}: {
  spaceId: string;
  spaceType: SpaceTypeKey;
  catalog: Feature[];
  initial: { sizeM2: string | null; ceilingHeightM: string | null; featureKeys: string[] };
}) {
  const [state, action] = useActionState<SpaceActionState | undefined, FormData>(
    saveStepAction, undefined,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set(initial.featureKeys));
  useAdvanceOnSave(state?.ok, `/anunciar/${spaceId}/fotos`);

  const config = SPACE_TYPE_CONFIG[spaceType];
  const askSize = (config.measurements as readonly string[]).includes('size_m2');
  const askHeight = (config.measurements as readonly string[]).includes('ceiling_height_m');
  const reqSize = (config.requiredMeasurements as readonly string[]).includes('size_m2');
  const reqHeight = (config.requiredMeasurements as readonly string[]).includes('ceiling_height_m');

  const grupos = Object.entries(
    catalog.reduce<Record<string, Feature[]>>((acc, f) => {
      (acc[f.category] ??= []).push(f);
      return acc;
    }, {}),
  );

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const err = (k: string) => state?.fieldErrors?.[k]?.[0];

  return (
    <form action={action} noValidate>
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="step" value="caracteristicas" />
      {[...selected].map((k) => <input key={k} type="hidden" name="features" value={k} />)}

      {state?.message && !state.ok && (
        <Alert tone="critical" className="mb-5">{state.message}</Alert>
      )}

      <div className="space-y-7">
        {(askSize || askHeight) && (
          <div className="grid grid-cols-2 gap-3">
            {askSize && (
              <Field
                label="Metragem"
                htmlFor="sizeM2"
                optional={!reqSize}
                error={err('sizeM2')}
                hint="Em metros quadrados"
              >
                <Input
                  name="sizeM2" defaultValue={initial.sizeM2 ?? ''}
                  type="number" inputMode="decimal" step="0.01" min="0.01"
                  placeholder="18" required={reqSize}
                />
              </Field>
            )}
            {askHeight && (
              <Field
                label="Pé-direito"
                htmlFor="ceilingHeightM"
                optional={!reqHeight}
                error={err('ceilingHeightM')}
                hint="Altura em metros"
              >
                <Input
                  name="ceilingHeightM" defaultValue={initial.ceilingHeightM ?? ''}
                  type="number" inputMode="decimal" step="0.01" min="0.01"
                  placeholder="3,5" required={reqHeight}
                />
              </Field>
            )}
          </div>
        )}

        {grupos.map(([categoria, itens]) => (
          <fieldset key={categoria} className="space-y-2.5">
            <legend className="text-[0.8125rem] font-semibold uppercase tracking-wide text-[var(--content-subtle)] mb-2">
              {CATEGORY_LABEL[categoria] ?? categoria}
            </legend>
            <div className="flex flex-wrap gap-2">
              {itens.map((f) => {
                const active = selected.has(f.key);
                return (
                  <label
                    key={f.key}
                    className={cn(
                      'inline-flex items-center gap-2 px-3.5 py-2.5 rounded-[var(--radius-pill)]',
                      'border cursor-pointer text-[0.875rem] transition-colors',
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                        : 'text-[var(--content-muted)] hover:border-[var(--content-subtle)]',
                    )}
                  >
                    <input
                      type="checkbox" checked={active}
                      onChange={() => toggle(f.key)} className="sr-only"
                    />
                    {f.icon && <Icon name={f.icon} className="size-4" />}
                    {f.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}

        <p className="text-[0.8125rem] text-[var(--content-muted)]">
          Marque só o que o espaço realmente tem. Característica anunciada e não encontrada na
          visita é o motivo de denúncia mais comum.
        </p>
      </div>

      <StepActions backHref={`/anunciar/${spaceId}/localizacao`} />
    </form>
  );
}
