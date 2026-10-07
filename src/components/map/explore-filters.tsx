'use client';

import { useId, useState } from 'react';
import { LocateFixed, Search, X } from 'lucide-react';
import { MAP_CATEGORIES, type MapCategoryKey } from '@/lib/spaces/categories';
import { PRICE_PRESETS_CENTS, RADIUS_OPTIONS_M } from '@/lib/maps/explore-params';
import { InvalidAmountError, formatBRLShort, parseBRLToCents } from '@/lib/money';
import { CategoryIcon } from './category-icon';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ExploreFilters = {
  /** Metros em volta de quem busca; `null` = qualquer distância. */
  radius: number | null;
  priceMaxCents: number | null;
  categories: MapCategoryKey[];
  availableNow: boolean;
};

export const NO_FILTERS: ExploreFilters = { radius: null, priceMaxCents: null, categories: [], availableNow: false };

/** Quantos filtros além do raio padrão estão ligados — para o contador do botão "Filtros". */
export function activeFilterCount(f: ExploreFilters, defaultRadius: number | null): number {
  return (
    (f.radius !== defaultRadius ? 1 : 0) +
    (f.priceMaxCents != null ? 1 : 0) +
    (f.categories.length > 0 ? 1 : 0) +
    (f.availableNow ? 1 : 0)
  );
}

function Chip({
  ativo, onClick, children, className,
}: { ativo: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'inline-flex items-center gap-1.5 h-9 px-3 rounded-[var(--radius-pill)] border text-[0.8125rem] transition-colors whitespace-nowrap',
        ativo
          ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)] font-medium'
          : 'text-[var(--content-muted)] hover:border-[var(--content-subtle)] bg-[var(--surface)]',
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Painel de filtros do mapa: onde, distância, preço máximo, categoria e
 * disponibilidade. Tudo é controlado pelo pai — o painel só mostra e avisa o
 * que mudou; quem busca de novo é o mapa.
 *
 * "Onde" é um formulário GET para a própria página: bairro, cidade ou CEP são
 * resolvidos no servidor (o mesmo caminho da busca de espaços) e o mapa abre
 * centralizado ali.
 */
export function ExploreFiltersPanel({
  filters, onChange, onClear, referenceLabel, usingGps, onLocate, locating, geoMessage,
  total, outsideShown, reachShown = 0, onClose, listHref,
}: {
  filters: ExploreFilters;
  onChange: (next: ExploreFilters) => void;
  onClear: () => void;
  /** De onde a distância é medida: "sua localização" ou o lugar buscado. */
  referenceLabel: string;
  usingGps: boolean;
  onLocate: () => void;
  locating: boolean;
  geoMessage: string | null;
  total: number | null;
  outsideShown: number;
  /** Anúncios mostrados fora do raio pelo alcance ampliado (sem rótulo na tela). */
  reachShown?: number;
  onClose?: () => void;
  /** "Ver em lista": a mesma busca, na página de resultados. */
  listHref: string;
}) {
  const id = useId();
  const [outroPreco, setOutroPreco] = useState('');
  const [erroPreco, setErroPreco] = useState<string | null>(null);

  const precoEhPreset = filters.priceMaxCents != null && (PRICE_PRESETS_CENTS as readonly number[]).includes(filters.priceMaxCents);
  const precoPersonalizado = filters.priceMaxCents != null && !precoEhPreset;

  function aplicarOutroPreco() {
    const texto = outroPreco.trim();
    if (!texto) {
      setErroPreco(null);
      onChange({ ...filters, priceMaxCents: null });
      return;
    }
    try {
      const cents = parseBRLToCents(texto);
      if (cents < 100) {
        setErroPreco('Informe um valor de pelo menos R$ 1.');
        return;
      }
      setErroPreco(null);
      onChange({ ...filters, priceMaxCents: cents });
    } catch (e) {
      if (!(e instanceof InvalidAmountError)) throw e;
      setErroPreco('Valor inválido. Exemplo: 250 ou 250,00.');
    }
  }

  function alternarCategoria(k: MapCategoryKey) {
    const set = new Set(filters.categories);
    if (set.has(k)) set.delete(k);
    else set.add(k);
    onChange({ ...filters, categories: MAP_CATEGORIES.map((c) => c.key).filter((x) => set.has(x)) });
  }

  return (
    <div className="space-y-5" data-testid="filtros-mapa">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Filtros</h2>
          <p className="text-[0.8125rem] text-[var(--content-muted)]" role="status" aria-live="polite" data-testid="contagem-mapa">
            {total == null
              ? 'Carregando…'
              : total === 0 && outsideShown === 0 && reachShown === 0
                ? 'Nenhum espaço com esses filtros nesta área'
                : `${total} ${total === 1 ? 'espaço' : 'espaços'}${filters.radius ? ` a até ${filters.radius / 1000} km` : ' nesta área'}` +
                  (outsideShown > 0 ? ` · ${outsideShown} ${outsideShown === 1 ? 'destaque ou bem avaliado' : 'destaques ou bem avaliados'} mais longe` : '') +
                  (reachShown > 0 ? ` · ${reachShown} ${reachShown === 1 ? 'anúncio' : 'anúncios'} um pouco mais longe` : '')}
          </p>
        </div>
        {onClose && (
          <button
            type="button" onClick={onClose} aria-label="Fechar filtros"
            className="shrink-0 -mt-1 -mr-1 p-2 rounded-[var(--radius-field)] text-[var(--content-muted)] hover:bg-[var(--surface-sunken)] lg:hidden"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {/* Onde */}
      <form action="/mapa" method="get" className="space-y-2">
        <label htmlFor={`${id}-onde`} className="text-sm font-medium">Onde</label>
        <div className="flex gap-2">
          <input
            id={`${id}-onde`} name="onde" type="text" inputMode="search" autoComplete="off" maxLength={80}
            placeholder="Bairro, cidade ou CEP"
            className="min-w-0 flex-1 h-10 px-3 rounded-[var(--radius-field)] border bg-[var(--surface)] text-[0.9375rem]"
          />
          <Button type="submit" size="icon" variant="secondary" aria-label="Buscar este lugar"><Search /></Button>
        </div>
        <Button type="button" variant="quiet" size="sm" onClick={onLocate} loading={locating} className="-ml-2">
          {!locating && <LocateFixed />}
          {usingGps ? 'Atualizar minha localização' : 'Usar minha localização'}
        </Button>
        {geoMessage && <p role="alert" className="text-[0.8125rem] text-[var(--color-caution)]">{geoMessage}</p>}
      </form>

      {/* Distância */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Distância</legend>
        <p className="text-[0.75rem] text-[var(--content-subtle)]">A partir de {referenceLabel}.</p>
        <div className="flex flex-wrap gap-1.5">
          {RADIUS_OPTIONS_M.map((m) => (
            <Chip key={m} ativo={filters.radius === m} onClick={() => onChange({ ...filters, radius: m })}>
              {m / 1000} km
            </Chip>
          ))}
          <Chip ativo={filters.radius == null} onClick={() => onChange({ ...filters, radius: null })}>Qualquer</Chip>
        </div>
        {filters.radius != null && (
          <p className="text-[0.75rem] text-[var(--content-subtle)] leading-snug">
            Dentro do raio aparece tudo. Fora dele, só Destaques e espaços bem avaliados.
          </p>
        )}
      </fieldset>

      {/* Preço */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Valor mensal máximo</legend>
        <div className="flex flex-wrap gap-1.5">
          {PRICE_PRESETS_CENTS.map((c) => (
            <Chip
              key={c} ativo={filters.priceMaxCents === c}
              onClick={() => { setOutroPreco(''); setErroPreco(null); onChange({ ...filters, priceMaxCents: c }); }}
            >
              Até {formatBRLShort(c)}
            </Chip>
          ))}
          <Chip
            ativo={filters.priceMaxCents == null}
            onClick={() => { setOutroPreco(''); setErroPreco(null); onChange({ ...filters, priceMaxCents: null }); }}
          >
            Sem limite
          </Chip>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--content-muted)] text-[0.875rem]" aria-hidden>R$</span>
            <input
              type="text" inputMode="decimal" autoComplete="off" aria-label="Outro valor máximo, em reais"
              placeholder={precoPersonalizado ? String(filters.priceMaxCents! / 100) : 'Outro valor'}
              value={outroPreco} onChange={(e) => setOutroPreco(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); aplicarOutroPreco(); } }}
              className="w-full h-10 pl-9 pr-3 rounded-[var(--radius-field)] border bg-[var(--surface)] text-[0.9375rem] tabular-nums"
            />
          </div>
          <Button type="button" variant="secondary" size="sm" className="h-10" onClick={aplicarOutroPreco}>Aplicar</Button>
        </div>
        {erroPreco && <p role="alert" className="text-[0.8125rem] text-[var(--color-critical)]">{erroPreco}</p>}
        {precoPersonalizado && !erroPreco && (
          <p className="text-[0.75rem] text-[var(--content-subtle)]">Mostrando até {formatBRLShort(filters.priceMaxCents!)} por mês.</p>
        )}
      </fieldset>

      {/* Categoria */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Categoria</legend>
        <div className="flex flex-wrap gap-1.5">
          {MAP_CATEGORIES.map((c) => (
            <Chip key={c.key} ativo={filters.categories.includes(c.key)} onClick={() => alternarCategoria(c.key)}>
              <CategoryIcon category={c.key} className="size-3.5" />
              {c.label}
            </Chip>
          ))}
        </div>
      </fieldset>

      {/* Disponibilidade */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox" checked={filters.availableNow}
          onChange={(e) => onChange({ ...filters, availableNow: e.target.checked })}
          className="mt-1 size-4 accent-[var(--accent)]"
        />
        <span>
          <span className="block text-sm font-medium">Só o que dá para alugar hoje</span>
          <span className="block text-[0.75rem] text-[var(--content-subtle)] leading-snug">
            Com vaga livre e já aberto para novas locações.
          </span>
        </span>
      </label>

      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <button type="button" onClick={onClear} className="text-[0.875rem] text-[var(--content-muted)] underline underline-offset-4 hover:text-[var(--content)]">
          Limpar filtros
        </button>
        <a href={listHref} className="text-[0.875rem] text-[var(--accent)] underline underline-offset-4">Ver em lista</a>
      </div>
      {onClose && (
        <Button type="button" block onClick={onClose} className="lg:hidden">
          {total == null ? 'Ver espaços' : `Ver ${total} ${total === 1 ? 'espaço' : 'espaços'}`}
        </Button>
      )}
    </div>
  );
}
