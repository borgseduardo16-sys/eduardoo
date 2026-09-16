'use client';

import { CircleAlert, MapPin } from 'lucide-react';
import { useLocalSet } from '@/lib/use-local-set';
import {
  checklistFor,
  checklistCount,
  type SpaceTypeKey,
} from '@/lib/safety/visit-checklist';
import { cn } from '@/lib/utils';

/**
 * Checklist para levar na visita ao espaço.
 *
 * Marcação guardada no navegador, por espaço: a pessoa marca os itens
 * *durante* a visita, com o celular na mão, e provavelmente offline. Guardar no
 * servidor exigiria conexão justo no pior momento — e isso aqui não é dado que
 * precise sobreviver a troca de aparelho.
 *
 * A persistência fica em `useLocalSet`, que lida com aba anônima, dados de site
 * bloqueados e sincronização entre abas.
 */
export function VisitChecklist({
  spaceType,
  spaceId,
  className,
}: {
  spaceType: SpaceTypeKey;
  /** Sem id (ex.: página pública), as marcações vão para uma chave de exemplo. */
  spaceId?: string;
  className?: string;
}) {
  const groups = checklistFor(spaceType);
  const total = checklistCount(spaceType);
  const { value: checked, toggle } = useLocalSet(`myplace:visita:${spaceId ?? 'exemplo'}`);

  const done = checked.size;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <section className={cn('space-y-6', className)}>
      <header className="space-y-3">
        <div className="flex items-start gap-3">
          <MapPin className="size-5 shrink-0 mt-0.5 text-[var(--accent)]" aria-hidden />
          <div className="space-y-1">
            <h2 className="font-semibold">Visite antes de fechar</h2>
            <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
              É a única verificação que nenhum sistema substitui. Foto se copia da internet,
              endereço se inventa, conversa se finge — estar no lugar, não.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-[0.8125rem] text-[var(--content-muted)]">
            <span>
              {done} de {total} conferidos
            </span>
            <span>{pct}%</span>
          </div>
          <div
            className="h-1.5 rounded-full bg-[var(--surface-sunken)] overflow-hidden"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progresso do checklist de visita"
          >
            <div
              className="h-full bg-[var(--accent)] transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </header>

      {groups.map((group) => (
        <div key={group.key} className="space-y-2">
          <h3 className="text-[0.8125rem] font-semibold uppercase tracking-wide text-[var(--content-subtle)]">
            {group.title}
          </h3>

          <ul className="space-y-1">
            {group.items.map((item) => {
              const isChecked = checked.has(item.key);
              return (
                <li key={item.key}>
                  <label
                    className={cn(
                      'flex gap-3 items-start p-3 rounded-[var(--radius-field)] cursor-pointer border transition-colors',
                      isChecked
                        ? 'border-transparent bg-[var(--surface-sunken)]'
                        : item.critical
                          ? 'border-[color-mix(in_oklch,var(--color-caution)_35%,transparent)] bg-[color-mix(in_oklch,var(--color-caution)_8%,transparent)]'
                          : 'border-transparent hover:bg-[var(--surface-sunken)]',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(item.key)}
                      className="mt-0.5 size-4 shrink-0 rounded accent-[var(--accent)]"
                    />
                    <span className="min-w-0 space-y-0.5">
                      <span
                        className={cn(
                          'flex items-start gap-1.5 text-[0.9375rem] font-medium',
                          isChecked && 'line-through text-[var(--content-subtle)]',
                        )}
                      >
                        {item.critical && !isChecked && (
                          <CircleAlert
                            className="size-4 shrink-0 mt-0.5"
                            style={{ color: 'var(--color-caution)' }}
                            aria-label="Item importante"
                          />
                        )}
                        {item.label}
                      </span>
                      {item.hint && (
                        <span
                          className={cn(
                            'block text-[0.8125rem] leading-relaxed',
                            isChecked
                              ? 'text-[var(--content-subtle)]'
                              : 'text-[var(--content-muted)]',
                          )}
                        >
                          {item.hint}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
