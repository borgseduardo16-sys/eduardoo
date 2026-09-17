import Link from 'next/link';
import { Check } from 'lucide-react';
import { STEPS, TOTAL_STEPS, type StepKey } from '@/lib/spaces/schemas';
import { cn } from '@/lib/utils';

/**
 * Moldura do formulário de anúncio.
 *
 * A barra de progresso mostra em que ponto a pessoa está e deixa voltar para
 * qualquer etapa já concluída — informação salva não se perde ao navegar,
 * porque cada etapa grava no rascunho assim que é enviada.
 *
 * Etapas ainda não alcançadas não são clicáveis: pular a localização e cair
 * direto nas fotos produziria um rascunho que nunca poderia ser publicado.
 */
export function WizardShell({
  spaceId,
  currentStep,
  reachedStep,
  title,
  description,
  children,
}: {
  spaceId: string;
  currentStep: StepKey;
  /** Maior etapa que o rascunho já alcançou (`draft_step`). */
  reachedStep: number;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const current = STEPS.find((s) => s.key === currentStep)!;

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-10">
      {/* Progresso */}
      <nav aria-label="Etapas do anúncio" className="mb-8 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[0.8125rem] font-medium text-[var(--content-muted)]">
            Etapa {current.n} de {TOTAL_STEPS}
          </p>
          <p className="text-[0.8125rem] text-[var(--content-subtle)]">
            Salvamos automaticamente
          </p>
        </div>

        <ol className="flex gap-1.5">
          {STEPS.map((step) => {
            const done = step.n < current.n && step.n <= reachedStep;
            const active = step.key === currentStep;
            const reachable = step.n <= reachedStep;

            const barra = (
              <span
                className={cn(
                  'block h-1.5 rounded-full transition-colors',
                  active
                    ? 'bg-[var(--accent)]'
                    : done
                      ? 'bg-[var(--accent)]/45'
                      : 'bg-[var(--surface-sunken)] border border-[var(--border)]',
                )}
              />
            );

            return (
              <li key={step.key} className="flex-1">
                {reachable && !active ? (
                  <Link
                    href={hrefDaEtapa(spaceId, step.key)}
                    className="block group"
                    aria-label={`Etapa ${step.n}: ${step.label}${done ? ' (concluída)' : ''}`}
                  >
                    {barra}
                  </Link>
                ) : (
                  <span aria-current={active ? 'step' : undefined} aria-label={`Etapa ${step.n}: ${step.label}`}>
                    {barra}
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        {/* Rótulos só no desktop: no celular oito nomes não cabem sem virar sopa de letras. */}
        <ol className="hidden sm:flex gap-1.5 text-[0.6875rem]">
          {STEPS.map((step) => (
            <li
              key={step.key}
              className={cn(
                'flex-1 truncate',
                step.key === currentStep
                  ? 'text-[var(--content)] font-medium'
                  : 'text-[var(--content-subtle)]',
              )}
            >
              {step.n < current.n && step.n <= reachedStep && (
                <Check className="inline size-3 mr-0.5 text-[var(--accent)]" aria-hidden />
              )}
              {step.label}
            </li>
          ))}
        </ol>
      </nav>

      <header className="mb-6 space-y-2">
        <h1 className="text-[1.5rem] sm:text-[1.75rem] font-semibold">{title}</h1>
        {description && (
          <p className="text-[var(--content-muted)] leading-relaxed">{description}</p>
        )}
      </header>

      {children}
    </div>
  );
}

/**
 * Endereco de cada etapa.
 *
 * A etapa 1 e a escolha do tipo, que acontece em `/anunciar` — nao existe
 * rota `/anunciar/[id]/tipo`. Sem este desvio, a primeira barra do progresso
 * aponta para uma pagina que nao existe (e o Next ainda tenta pre-carregar,
 * o que gera um 404 silencioso em toda visita).
 */
function hrefDaEtapa(spaceId: string, key: string): string {
  return key === 'tipo' ? '/anunciar' : `/anunciar/${spaceId}/${key}`;
}
