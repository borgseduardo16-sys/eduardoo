'use client';

import { useActionState, useEffect, useRef, useState, useId } from 'react';
import { Flag, X } from 'lucide-react';
import { createReportAction, type SafetyActionState } from '@/lib/safety/actions';
import { reasonsForTarget, type ReportTarget } from '@/lib/safety/report-config';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/auth/form-shell';
import { cn } from '@/lib/utils';

/**
 * Denúncia de anúncio, usuário ou mensagem.
 *
 * Usa o `<dialog>` nativo em vez de uma biblioteca de modal: ele já entrega
 * foco preso dentro da caixa, fechamento com Esc e fundo inerte — que é
 * justamente o que costuma sair errado em modal feito à mão.
 *
 * A lista de motivos vem de `reasonsForTarget`, a mesma fonte que o servidor
 * usa para validar. Duas listas divergentes deixariam a pessoa escolher um
 * motivo que a ação depois recusa.
 */
export function ReportDialog({
  targetType,
  targetId,
  targetLabel,
  variant = 'quiet',
  className,
}: {
  targetType: ReportTarget;
  targetId: string;
  /** O que aparece no título: "este anúncio", "esta mensagem"… */
  targetLabel: string;
  variant?: 'quiet' | 'ghost' | 'secondary';
  className?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>('');
  const id = useId();

  const [state, action] = useActionState<SafetyActionState | undefined, FormData>(
    createReportAction,
    undefined,
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const reasons = reasonsForTarget(targetType);
  const precisaDetalhe = reason === 'outro';

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="sm"
        onClick={() => setOpen(true)}
        className={className}
      >
        <Flag aria-hidden />
        Denunciar
      </Button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        // Clicar no fundo escuro fecha; clicar dentro da caixa não.
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false);
        }}
        className={cn(
          'w-[min(32rem,calc(100vw-2rem))] p-0 rounded-[var(--radius-card)]',
          'bg-[var(--surface-raised)] text-[var(--content)]',
          'shadow-[var(--shadow-overlay)] border',
          'backdrop:bg-black/40 backdrop:backdrop-blur-[2px]',
          'open:animate-rise',
        )}
      >
        <div className="flex items-start justify-between gap-4 p-5 pb-3">
          <div className="space-y-1">
            <h2 className="text-[1.125rem] font-semibold">Denunciar {targetLabel}</h2>
            <p className="text-[0.8125rem] text-[var(--content-muted)]">
              Sua denúncia é confidencial. A pessoa denunciada não sabe quem denunciou.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fechar"
            className="shrink-0 -mt-1 -mr-1 p-2 rounded-[var(--radius-field)] text-[var(--content-muted)] hover:bg-[var(--surface-sunken)]"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {state?.ok ? (
          <div className="p-5 pt-2 space-y-4">
            <Alert tone="success" title="Denúncia registrada">
              {state.message}
            </Alert>
            <Button type="button" variant="secondary" block onClick={() => setOpen(false)}>
              Fechar
            </Button>
          </div>
        ) : (
          <form action={action} className="p-5 pt-2 space-y-5">
            <input type="hidden" name="targetType" value={targetType} />
            <input type="hidden" name="targetId" value={targetId} />

            {state?.message && !state.ok && <Alert tone="critical">{state.message}</Alert>}

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium mb-2">O que aconteceu?</legend>
              {state?.fieldErrors?.reason?.[0] && (
                <p role="alert" className="text-[0.8125rem] text-[var(--color-critical)]">
                  {state.fieldErrors.reason[0]}
                </p>
              )}

              <div className="max-h-64 overflow-y-auto -mx-1 px-1 space-y-1">
                {reasons.map((r) => (
                  <label
                    key={r.value}
                    className={cn(
                      'flex gap-3 items-start p-3 rounded-[var(--radius-field)] cursor-pointer border transition-colors',
                      reason === r.value
                        ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
                        : 'border-transparent hover:bg-[var(--surface-sunken)]',
                    )}
                  >
                    <input
                      type="radio"
                      name="reason"
                      value={r.value}
                      checked={reason === r.value}
                      onChange={(e) => setReason(e.target.value)}
                      className="mt-1 size-4 accent-[var(--accent)] shrink-0"
                      required
                    />
                    <span className="min-w-0">
                      <span className="block text-[0.9375rem] font-medium">{r.label}</span>
                      <span className="block text-[0.8125rem] text-[var(--content-muted)] leading-snug">
                        {r.hint}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="space-y-1.5">
              <label htmlFor={`${id}-details`} className="text-sm font-medium">
                Detalhes{' '}
                <span className="font-normal text-[var(--content-subtle)]">
                  {precisaDetalhe ? '(obrigatório)' : '(opcional)'}
                </span>
              </label>
              <Textarea
                id={`${id}-details`}
                name="details"
                maxLength={2000}
                placeholder="Conte o que aconteceu. Quanto mais específico, mais rápido conseguimos agir."
                aria-invalid={state?.fieldErrors?.details ? true : undefined}
                required={precisaDetalhe}
              />
              {state?.fieldErrors?.details?.[0] && (
                <p role="alert" className="text-[0.8125rem] text-[var(--color-critical)]">
                  {state.fieldErrors.details[0]}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => setOpen(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <div className="flex-1">
                <SubmitButton>Enviar denúncia</SubmitButton>
              </div>
            </div>

            <p className="text-[0.75rem] text-[var(--content-subtle)] leading-relaxed">
              Em caso de ameaça ou crime, procure também a polícia. A MyPlace coopera com
              autoridades quando formalmente requisitada.
            </p>
          </form>
        )}
      </dialog>
    </>
  );
}
