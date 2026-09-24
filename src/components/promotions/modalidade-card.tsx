'use client';

import { formatBRL } from '@/lib/money';

export type PromotionType = 'destaque' | 'turbo';

export type BenefitInfo = { used: number; limit: number; remaining: number };

/**
 * Card de uma modalidade (Destaque ou Turbo): "usar grátis" (se sobrar
 * benefício Premium) e "comprar" lado a lado — mesmo componente na etapa
 * "Turbine seu anúncio" (pós-publicação) e no dialog "Destacar" (Meus
 * espaços), pra não ter duas UIs pro mesmo par de botões.
 */
export function ModalidadeCard({
  spaceId, titulo, icone: Icone, descricao, beneficio, precoAPartir, ativarAction, onComprar,
}: {
  spaceId: string;
  titulo: string;
  icone: React.ComponentType<{ className?: string }>;
  descricao: string;
  /** null = nao e Premium, nunca mostra a opcao gratis. */
  beneficio: BenefitInfo | null;
  precoAPartir: number;
  ativarAction: (formData: FormData) => void;
  onComprar: () => void;
}) {
  const tipo: PromotionType = titulo === 'Turbo' ? 'turbo' : 'destaque';
  const gratisDisponivel = beneficio !== null && beneficio.remaining > 0;

  return (
    <div className="rounded-[var(--radius-field)] border border-[var(--border-strong)] p-3 space-y-2.5">
      <div className="flex items-start gap-2.5">
        <Icone className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" />
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-medium">{titulo}</p>
          <p className="text-[0.8125rem] text-[var(--content-muted)] leading-snug">{descricao}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {gratisDisponivel && (
          <form action={ativarAction} className="flex-1">
            <input type="hidden" name="spaceId" value={spaceId} />
            <input type="hidden" name="type" value={tipo} />
            <button
              type="submit"
              className="w-full h-9 rounded-[var(--radius-field)] border border-[var(--border-strong)] text-[0.8125rem] font-medium hover:bg-[var(--surface-sunken)] transition-colors"
            >
              Usar grátis ({beneficio.remaining} de {beneficio.limit})
            </button>
          </form>
        )}
        <button
          type="button"
          onClick={onComprar}
          className="flex-1 h-9 rounded-[var(--radius-field)] border border-[var(--border-strong)] text-[0.8125rem] font-medium hover:bg-[var(--surface-sunken)] transition-colors"
        >
          Comprar a partir de {formatBRL(precoAPartir)}
        </button>
      </div>

      {beneficio !== null && !gratisDisponivel && (
        <p className="text-[0.75rem] text-[var(--content-subtle)]">
          Benefício grátis do mês já usado — comprar continua disponível.
        </p>
      )}
    </div>
  );
}
