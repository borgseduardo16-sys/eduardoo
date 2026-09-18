'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/safety/icon';
import { cn } from '@/lib/utils';
import type { SearchSort } from '@/lib/spaces/queries';

export type FeatureOption = { key: string; label: string; icon: string | null; category: string };

const DISTANCIAS = [
  { valor: '', label: 'Qualquer distância' },
  { valor: '1000', label: 'Até 1 km' },
  { valor: '3000', label: 'Até 3 km' },
  { valor: '5000', label: 'Até 5 km' },
  { valor: '10000', label: 'Até 10 km' },
] as const;

const ORDENS: { valor: SearchSort; label: string }[] = [
  { valor: 'distance', label: 'Mais próximos' },
  { valor: 'price_asc', label: 'Menor preço' },
  { valor: 'price_desc', label: 'Maior preço' },
  { valor: 'recent', label: 'Mais recentes' },
];

export type FiltersValue = {
  precoMin: string;
  precoMax: string;
  raio: string;
  caracteristicas: string[];
  disponivel: boolean;
  ordenar: SearchSort;
};

/**
 * Filtros e ordenação da busca.
 *
 * Cada filtro é um parâmetro na URL — não estado escondido em memória. Isso
 * é o que faz um resultado dar para compartilhar por link, voltar funcionar
 * de verdade no navegador, e recarregar a página não perder o que a pessoa
 * escolheu.
 *
 * "Mais filtros" fica atrás de um botão (preço, características,
 * disponibilidade), e ordenação fica sempre visível — são os dois papéis
 * diferentes: um muda QUAIS espaços aparecem, o outro só a ORDEM.
 */
export function FiltersBar({
  value,
  temPontoDeReferencia,
  features,
  totalResultados,
}: {
  value: FiltersValue;
  /** "Mais próximos" e o filtro de distância só fazem sentido com um ponto real. */
  temPontoDeReferencia: boolean;
  features: FeatureOption[];
  totalResultados: number;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  const [rascunho, setRascunho] = useState(value);

  const ativos = useMemo(() => {
    let n = 0;
    if (value.precoMin || value.precoMax) n++;
    if (value.raio) n++;
    if (value.caracteristicas.length > 0) n++;
    if (value.disponivel) n++;
    return n;
  }, [value]);

  function abrir() {
    setRascunho(value);
    setOpen(true);
    dialogRef.current?.showModal();
  }
  function fechar() {
    setOpen(false);
    dialogRef.current?.close();
  }

  function aplicarNaUrl(next: Partial<FiltersValue>) {
    const params = new URLSearchParams(window.location.search);
    const final = { ...value, ...next };

    const set = (key: string, v: string) => (v ? params.set(key, v) : params.delete(key));
    set('precoMin', final.precoMin);
    set('precoMax', final.precoMax);
    set('raio', final.raio);
    set('caracteristicas', final.caracteristicas.join(','));
    set('disponivel', final.disponivel ? '1' : '');
    set('ordenar', final.ordenar === 'recent' ? '' : final.ordenar);
    params.delete('pagina'); // todo filtro novo volta pra primeira pagina

    router.push(`/espacos?${params.toString()}`);
  }

  function aplicarRascunho() {
    aplicarNaUrl(rascunho);
    fechar();
  }

  function limparRascunho() {
    setRascunho({ precoMin: '', precoMax: '', raio: '', caracteristicas: [], disponivel: false, ordenar: value.ordenar });
  }

  function alternarCaracteristica(key: string) {
    setRascunho((r) => ({
      ...r,
      caracteristicas: r.caracteristicas.includes(key)
        ? r.caracteristicas.filter((k) => k !== key)
        : [...r.caracteristicas, key],
    }));
  }

  const porCategoria = useMemo(() => {
    const grupos = new Map<string, FeatureOption[]>();
    for (const f of features) {
      const lista = grupos.get(f.category) ?? [];
      lista.push(f);
      grupos.set(f.category, lista);
    }
    return grupos;
  }, [features]);

  const rotuloCategoria: Record<string, string> = {
    estrutura: 'Estrutura', seguranca: 'Segurança', acesso: 'Acesso', veiculo: 'Veículo',
  };

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={abrir} data-testid="abrir-filtros">
          <SlidersHorizontal className="size-4" aria-hidden />
          Filtros
          {ativos > 0 && (
            <span className="ml-0.5 inline-flex items-center justify-center size-4 rounded-full bg-[var(--accent)] text-[var(--accent-content)] text-[0.625rem] font-semibold">
              {ativos}
            </span>
          )}
        </Button>

        <p className="text-[0.8125rem] text-[var(--content-muted)] hidden sm:block">
          {totalResultados} {totalResultados === 1 ? 'espaço encontrado' : 'espaços encontrados'}
        </p>
      </div>

      <label className="flex items-center gap-2 text-[0.8125rem]">
        <span className="text-[var(--content-muted)] hidden sm:inline">Ordenar por</span>
        <select
          value={value.ordenar}
          onChange={(e) => aplicarNaUrl({ ordenar: e.target.value as SearchSort })}
          data-testid="ordenar-select"
          className="h-9 pl-3 pr-8 rounded-[var(--radius-field)] bg-[var(--surface)] border border-[var(--border-strong)] text-[0.8125rem] focus:outline-none focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/20"
        >
          {ORDENS.filter((o) => o.valor !== 'distance' || temPontoDeReferencia).map((o) => (
            <option key={o.valor} value={o.valor}>{o.label}</option>
          ))}
        </select>
      </label>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(e) => { if (e.target === dialogRef.current) fechar(); }}
        className={cn(
          'w-[min(28rem,calc(100vw-2rem))] max-h-[85vh] p-0 rounded-[var(--radius-card)]',
          'bg-[var(--surface-raised)] text-[var(--content)]',
          'shadow-[var(--shadow-overlay)] border',
          'backdrop:bg-black/40 backdrop:backdrop-blur-[2px]',
          open && 'open:animate-rise',
        )}
      >
        <div className="flex items-center justify-between gap-4 p-5 pb-3 border-b sticky top-0 bg-[var(--surface-raised)]">
          <h2 className="text-[1.0625rem] font-semibold">Filtros</h2>
          <button type="button" onClick={fechar} aria-label="Fechar"
            className="p-2 -mr-2 rounded-[var(--radius-field)] text-[var(--content-muted)] hover:bg-[var(--surface-sunken)]">
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="p-5 space-y-6 overflow-y-auto">
          {temPontoDeReferencia && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium mb-2">Distância</legend>
              <div className="flex flex-wrap gap-2">
                {DISTANCIAS.map((d) => (
                  <button
                    key={d.valor}
                    type="button"
                    onClick={() => setRascunho((r) => ({ ...r, raio: d.valor }))}
                    className={cn(
                      'px-3 py-1.5 rounded-[var(--radius-pill)] text-[0.8125rem] border transition-colors',
                      rascunho.raio === d.valor
                        ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)] font-medium'
                        : 'text-[var(--content-muted)] hover:border-[var(--content-subtle)]',
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium mb-2">Preço mensal</legend>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label htmlFor="f-preco-min" className="sr-only">Preço mínimo</label>
                <div className="flex items-center gap-1.5 h-11 px-3 rounded-[var(--radius-field)] border border-[var(--border-strong)] bg-[var(--surface)]">
                  <span className="text-[0.8125rem] text-[var(--content-subtle)]">R$</span>
                  <input
                    id="f-preco-min" type="number" inputMode="numeric" min={0} placeholder="Mínimo"
                    value={rascunho.precoMin}
                    onChange={(e) => setRascunho((r) => ({ ...r, precoMin: e.target.value }))}
                    className="w-full bg-transparent border-0 p-0 text-base md:text-[0.9375rem] focus:outline-none"
                  />
                </div>
              </div>
              <span className="text-[var(--content-subtle)]">—</span>
              <div className="flex-1">
                <label htmlFor="f-preco-max" className="sr-only">Preço máximo</label>
                <div className="flex items-center gap-1.5 h-11 px-3 rounded-[var(--radius-field)] border border-[var(--border-strong)] bg-[var(--surface)]">
                  <span className="text-[0.8125rem] text-[var(--content-subtle)]">R$</span>
                  <input
                    id="f-preco-max" type="number" inputMode="numeric" min={0} placeholder="Máximo"
                    value={rascunho.precoMax}
                    onChange={(e) => setRascunho((r) => ({ ...r, precoMax: e.target.value }))}
                    className="w-full bg-transparent border-0 p-0 text-base md:text-[0.9375rem] focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend className="flex items-center gap-2 text-sm font-medium mb-2">
              <input
                type="checkbox"
                checked={rascunho.disponivel}
                onChange={(e) => setRascunho((r) => ({ ...r, disponivel: e.target.checked }))}
                className="size-4 rounded accent-[var(--accent)]"
              />
              Disponível a partir de hoje
            </legend>
          </fieldset>

          {features.length > 0 && (
            <fieldset className="space-y-4">
              <legend className="text-sm font-medium">Características</legend>
              {[...porCategoria.entries()].map(([categoria, itens]) => (
                <div key={categoria} className="space-y-2">
                  <p className="text-[0.75rem] text-[var(--content-subtle)] uppercase tracking-wide">
                    {rotuloCategoria[categoria] ?? categoria}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {itens.map((f) => (
                      <label
                        key={f.key}
                        className={cn(
                          'flex items-center gap-2 px-2.5 py-2 rounded-[var(--radius-field)] border text-[0.8125rem] cursor-pointer',
                          rascunho.caracteristicas.includes(f.key)
                            ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
                            : 'border-[var(--border)] hover:border-[var(--content-subtle)]',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={rascunho.caracteristicas.includes(f.key)}
                          onChange={() => alternarCaracteristica(f.key)}
                          className="size-4 rounded accent-[var(--accent)]"
                        />
                        {f.icon && <Icon name={f.icon} className="size-3.5 shrink-0 text-[var(--content-muted)]" />}
                        <span className="truncate">{f.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </fieldset>
          )}
        </div>

        <div className="flex items-center gap-3 p-5 pt-3 border-t sticky bottom-0 bg-[var(--surface-raised)]">
          <Button type="button" variant="ghost" onClick={limparRascunho} className="shrink-0">
            Limpar
          </Button>
          <Button type="button" block onClick={aplicarRascunho} data-testid="aplicar-filtros">
            Ver resultados
          </Button>
        </div>
      </dialog>
    </div>
  );
}
