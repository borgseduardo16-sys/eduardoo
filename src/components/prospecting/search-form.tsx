'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Search } from 'lucide-react';
import { runSearchAction, type SearchActionState } from '@/lib/prospecting/actions';
import {
  BRAZILIAN_STATES,
  PREDEFINED_NICHES,
  QUANTITY_PRESETS,
  RATING_PRESETS,
  REVIEW_COUNT_PRESETS,
} from '@/lib/prospecting/locations';
import { SEARCH_STAGE_LABELS, type SearchProgressStage } from '@/lib/prospecting/types';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

const REGIONS = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'] as const;

const selectClass = cn(
  'w-full h-11 px-3.5 rounded-[var(--radius-field)]',
  'bg-[var(--surface)] text-[var(--content)]',
  'border border-[var(--border-strong)]',
  'transition-colors duration-150 hover:border-[var(--content-subtle)]',
  'focus:outline-none focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/20',
  'text-base md:text-[0.9375rem]',
);

const STAGES: SearchProgressStage[] = [
  'analisando',
  'verificando_presenca',
  'eliminando_sites',
  'aplicando_filtros',
  'preparando',
];

function ProgressOverlay() {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, STAGES.length - 1));
    }, 2600);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 grid place-items-center bg-[var(--surface)]/90 backdrop-blur-sm px-4"
    >
      <div className="w-full max-w-sm space-y-6 text-center animate-rise">
        <div className="mx-auto size-12 rounded-full border-[3px] border-[var(--border)] border-t-[var(--accent)] animate-spin" />
        <div className="space-y-2">
          <p className="text-lg font-semibold">{SEARCH_STAGE_LABELS[STAGES[stageIndex]]}</p>
          <p className="text-[0.875rem] text-[var(--content-muted)]">
            Isso pode levar até um minuto — estamos consultando o Google e analisando cada empresa
            encontrada.
          </p>
        </div>
        <ol className="space-y-1.5 text-left">
          {STAGES.map((stage, i) => (
            <li
              key={stage}
              className={cn(
                'flex items-center gap-2 text-[0.8125rem] transition-opacity',
                i <= stageIndex ? 'opacity-100 text-[var(--content)]' : 'opacity-40 text-[var(--content-muted)]',
              )}
            >
              <span
                className={cn(
                  'size-1.5 rounded-full shrink-0',
                  i <= stageIndex ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]',
                )}
                aria-hidden
              />
              {SEARCH_STAGE_LABELS[stage]}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <>
      <Button type="submit" size="lg" block loading={pending} disabled={pending}>
        {!pending && <Search className="size-4.5" aria-hidden />}
        {pending ? 'Buscando...' : 'Encontrar empresas'}
      </Button>
      {pending && <ProgressOverlay />}
    </>
  );
}

const initialState: SearchActionState = { ok: true };

export function SearchForm() {
  const [state, formAction] = useActionState(runSearchAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  const [nicheMode, setNicheMode] = useState<'preset' | 'custom' | 'any'>('preset');
  const [scope, setScope] = useState<'city' | 'state' | 'region' | 'country'>('city');
  const [reviewsMode, setReviewsMode] = useState<'preset' | 'custom'>('preset');
  const [ratingMode, setRatingMode] = useState<'preset' | 'custom'>('preset');
  const [quantityMode, setQuantityMode] = useState<'preset' | 'custom'>('preset');

  return (
    <form ref={formRef} action={formAction} noValidate className="space-y-6">
      {state?.message && !state.ok && <Alert tone="critical" title="Não foi possível buscar">{state.message}</Alert>}

      <div className="grid gap-5 sm:grid-cols-2">
        {/* Nicho */}
        <Field label="Nicho" htmlFor="niche-select" hint="Escolha da lista, digite o seu ou busque qualquer nicho.">
          <div className="space-y-2">
            <select
              id="niche-select"
              className={selectClass}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__custom__') setNicheMode('custom');
                else if (v === '__any__') setNicheMode('any');
                else setNicheMode('preset');
              }}
              defaultValue=""
            >
              <option value="" disabled>
                Selecione um nicho
              </option>
              <option value="__any__">Qualquer nicho</option>
              {PREDEFINED_NICHES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              <option value="__custom__">Outro (digitar)</option>
            </select>

            {nicheMode === 'preset' && (
              <select name="niche" className={selectClass} required defaultValue="">
                <option value="" disabled>
                  Selecione um nicho acima
                </option>
                {PREDEFINED_NICHES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            )}
            {nicheMode === 'any' && <input type="hidden" name="niche" value="empresas" />}
            {nicheMode === 'custom' && (
              <Input name="niche" placeholder="Ex.: Estúdios de tatuagem" required maxLength={120} />
            )}
          </div>
        </Field>

        {/* Localizacao */}
        <Field label="Localização" htmlFor="location-scope" hint="Cidade, estado, região ou o Brasil inteiro.">
          <div className="space-y-2">
            <select
              id="location-scope"
              name="locationScope"
              className={selectClass}
              value={scope}
              onChange={(e) => setScope(e.target.value as typeof scope)}
            >
              <option value="city">Cidade</option>
              <option value="state">Estado</option>
              <option value="region">Região</option>
              <option value="country">Brasil inteiro</option>
            </select>

            {scope === 'city' && (
              <Input name="locationLabel" placeholder="Ex.: Colatina - ES" required maxLength={120} />
            )}
            {scope === 'state' && (
              <select name="locationLabel" className={selectClass} required defaultValue="">
                <option value="" disabled>
                  Selecione o estado
                </option>
                {BRAZILIAN_STATES.map((s) => (
                  <option key={s.uf} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            {scope === 'region' && (
              <select name="locationLabel" className={selectClass} required defaultValue="">
                <option value="" disabled>
                  Selecione a região
                </option>
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            )}
            {scope === 'country' && <input type="hidden" name="locationLabel" value="Brasil inteiro" />}
          </div>
        </Field>

        {/* Avaliacoes minimas */}
        <Field label="Avaliações mínimas" htmlFor="min-reviews">
          <div className="space-y-2">
            <select
              id="min-reviews"
              className={selectClass}
              defaultValue="10"
              name={reviewsMode === 'preset' ? 'minReviews' : undefined}
              onChange={(e) => setReviewsMode(e.target.value === 'custom' ? 'custom' : 'preset')}
            >
              {REVIEW_COUNT_PRESETS.map((n) => (
                <option key={n} value={String(n)}>
                  {n}+ avaliações
                </option>
              ))}
              <option value="custom">Personalizado</option>
            </select>
            {reviewsMode === 'custom' && (
              <Input
                type="number"
                name="minReviews"
                min={0}
                placeholder="Quantidade mínima de avaliações"
                required
              />
            )}
          </div>
        </Field>

        {/* Nota minima */}
        <Field label="Nota mínima" htmlFor="min-rating">
          <div className="space-y-2">
            <select
              id="min-rating"
              className={selectClass}
              defaultValue=""
              name={ratingMode === 'preset' ? 'minRating' : undefined}
              onChange={(e) => setRatingMode(e.target.value === 'custom' ? 'custom' : 'preset')}
            >
              <option value="">Qualquer nota</option>
              {RATING_PRESETS.map((r) => (
                <option key={r} value={r}>
                  {r.toFixed(1)}+
                </option>
              ))}
              <option value="custom">Personalizado</option>
            </select>
            {ratingMode === 'custom' && (
              <Input
                type="number"
                name="minRating"
                min={0}
                max={5}
                step={0.1}
                placeholder="Ex.: 4.2"
              />
            )}
          </div>
        </Field>
      </div>

      {/* Quantidade */}
      <Field label="Quantidade de empresas" htmlFor="quantity" hint="Quantos leads válidos você quer que o sistema tente encontrar.">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {QUANTITY_PRESETS.map((q) => (
            <label
              key={q}
              className={cn(
                'flex items-center justify-center h-11 rounded-[var(--radius-field)] border cursor-pointer text-[0.9375rem] font-medium transition-colors',
                quantityMode === 'preset'
                  ? 'has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[var(--accent-subtle)] has-[:checked]:text-[var(--accent)]'
                  : 'opacity-50',
                'border-[var(--border-strong)] hover:bg-[var(--surface-sunken)]',
              )}
            >
              <input
                type="radio"
                name={quantityMode === 'preset' ? 'requestedQuantity' : undefined}
                value={q}
                defaultChecked={q === 50}
                className="sr-only"
                onChange={() => setQuantityMode('preset')}
              />
              {q}
            </label>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <label className="flex items-center gap-2 text-[0.875rem] text-[var(--content-muted)]">
            <input
              type="radio"
              name="quantity-mode-switch"
              checked={quantityMode === 'custom'}
              onChange={() => setQuantityMode('custom')}
            />
            Personalizado
          </label>
          {quantityMode === 'custom' && (
            <Input
              type="number"
              name="requestedQuantity"
              min={1}
              max={5000}
              placeholder="Quantidade"
              required
              className="max-w-[10rem]"
            />
          )}
        </div>
      </Field>

      <SubmitButton />
    </form>
  );
}
