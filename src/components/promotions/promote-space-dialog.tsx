'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Rocket, Star, Zap, X } from 'lucide-react';
import {
  activatePromotionAction, cancelPromotionAction, type PromotionActionState,
} from '@/lib/promotions/actions';
import { formatPromotionDateLong } from '@/lib/promotions/format';
import { PromotionBadge } from './promotion-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/auth/form-shell';
import { cn } from '@/lib/utils';

type PromotionType = 'destaque' | 'turbo';

type BenefitInfo = { used: number; limit: number; remaining: number };

type ActivePromotion = { id: string; type: PromotionType; expiresAt: Date };

export function PromoteSpaceDialog({
  spaceId,
  spaceTitle,
  activePromotion,
  premium,
  destaqueBenefit,
  turboBenefit,
}: {
  spaceId: string;
  spaceTitle: string;
  activePromotion: ActivePromotion | null;
  premium: boolean;
  destaqueBenefit: BenefitInfo;
  turboBenefit: BenefitInfo;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  // Muda a cada abertura — usado como `key` do corpo do dialog, para forcar
  // ele a remontar (e o useActionState de dentro voltar ao estado inicial)
  // em vez de arrastar o resultado de uma ativacao/cancelamento anterior
  // para a proxima vez que a pessoa abrir o mesmo dialog.
  const [sessao, setSessao] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <Button
        type="button" variant="quiet" size="sm"
        onClick={() => { setSessao((s) => s + 1); setOpen(true); }}
        data-testid="botao-destacar"
      >
        <Rocket className="size-4" aria-hidden />
        {activePromotion ? 'Promoção' : 'Destacar'}
      </Button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false);
        }}
        className={cn(
          'w-[min(28rem,calc(100vw-2rem))] p-0 rounded-[var(--radius-card)]',
          'bg-[var(--surface-raised)] text-[var(--content)]',
          'shadow-[var(--shadow-overlay)] border',
          'backdrop:bg-black/40 backdrop:backdrop-blur-[2px]',
          'open:animate-rise',
        )}
      >
        <div className="flex items-start justify-between gap-4 p-5 pb-3">
          <div className="space-y-1 min-w-0">
            <h2 className="text-[1.125rem] font-semibold truncate">
              {activePromotion ? 'Promoção do anúncio' : 'Escolha como promover'}
            </h2>
            <p className="text-[0.8125rem] text-[var(--content-muted)] truncate">{spaceTitle}</p>
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

        <PromoteDialogBody
          key={sessao}
          spaceId={spaceId}
          activePromotion={activePromotion}
          premium={premium}
          destaqueBenefit={destaqueBenefit}
          turboBenefit={turboBenefit}
          onDone={() => setOpen(false)}
        />
      </dialog>
    </>
  );
}

/**
 * Corpo do dialog — separado do componente de fora só para poder remontar
 * (via `key={sessao}`) a cada abertura.
 *
 * A ordem das checagens importa: `ativarState`/`cancelarState` vêm de
 * `useActionState`, local a esta submissão; `activePromotion` vem de props,
 * recalculado no servidor e entregue de volta pela MESMA `revalidatePath`
 * que a action chama — os dois chegam juntos, na mesma renderização. Checar
 * `activePromotion` antes faria a confirmação de sucesso nunca aparecer
 * (pularia direto pro painel "já ativo"/formulário). Por isso o sucesso vem
 * primeiro aqui; o remontar por `sessao` evita que ele fique "grudado" numa
 * proxima abertura, depois que a pessoa ja fechou o dialog.
 */
function PromoteDialogBody({
  spaceId, activePromotion, premium, destaqueBenefit, turboBenefit, onDone,
}: {
  spaceId: string;
  activePromotion: ActivePromotion | null;
  premium: boolean;
  destaqueBenefit: BenefitInfo;
  turboBenefit: BenefitInfo;
  onDone: () => void;
}) {
  const [tipo, setTipo] = useState<PromotionType | ''>('');

  const [ativarState, ativarAction] = useActionState<PromotionActionState | undefined, FormData>(
    activatePromotionAction, undefined,
  );
  const [cancelarState, cancelarAction] = useActionState<PromotionActionState | undefined, FormData>(
    cancelPromotionAction, undefined,
  );

  // Depois de ativar ou cancelar com sucesso, a lista de "Meus espaços" é
  // revalidada pela própria action — fechar aqui evita o dialog ficar aberto
  // mostrando um estado que a tela por trás já não tem mais.
  useEffect(() => {
    if (ativarState?.ok || cancelarState?.ok) {
      const t = setTimeout(onDone, 1200);
      return () => clearTimeout(t);
    }
  }, [ativarState, cancelarState, onDone]);

  if (ativarState?.ok) {
    return (
      <div className="p-5 pt-2 space-y-4">
        <Alert tone="success" title="Promoção ativada">{ativarState.message}</Alert>
      </div>
    );
  }

  if (cancelarState?.ok) {
    return (
      <div className="p-5 pt-2 space-y-4">
        <Alert tone="success">{cancelarState.message}</Alert>
      </div>
    );
  }

  if (activePromotion) {
    return (
      <div className="p-5 pt-2 space-y-4">
        <div className="flex items-center gap-2 p-3 rounded-[var(--radius-field)] bg-[var(--surface-sunken)]">
          <PromotionBadge type={activePromotion.type} />
          <p className="text-[0.8125rem] text-[var(--content-muted)]">
            Ativo até {formatPromotionDateLong(activePromotion.expiresAt)}
          </p>
        </div>
        {cancelarState?.message && !cancelarState.ok && (
          <Alert tone="critical">{cancelarState.message}</Alert>
        )}
        <form action={cancelarAction}>
          <input type="hidden" name="promotionId" value={activePromotion.id} />
          <Button type="submit" variant="secondary" block>
            Cancelar promoção
          </Button>
        </form>
        <p className="text-[0.75rem] text-[var(--content-subtle)] leading-relaxed">
          Cancelar não devolve o benefício deste mês.
        </p>
      </div>
    );
  }

  if (!premium) {
    return (
      <div className="p-5 pt-2 space-y-4">
        <p className="text-[0.9375rem] text-[var(--content-muted)] leading-relaxed">
          Destaque e Turbo são benefícios de quem é Membro Premium. Assine para aumentar a
          exposição dos seus anúncios.
        </p>
        <Link href="/premium" className={buttonVariants({ block: true })}>
          Conhecer o Premium
        </Link>
      </div>
    );
  }

  return (
    <form action={ativarAction} className="p-5 pt-2 space-y-4">
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="type" value={tipo} />

      {ativarState?.message && !ativarState.ok && <Alert tone="critical">{ativarState.message}</Alert>}

      <div className="space-y-2">
        <OpcaoPromocao
          selecionado={tipo === 'destaque'}
          onSelect={() => setTipo('destaque')}
          beneficio={destaqueBenefit}
          icone={Star}
          titulo="Destaque"
          descricao="Mais visibilidade dentro do marketplace."
        />
        <OpcaoPromocao
          selecionado={tipo === 'turbo'}
          onSelect={() => setTipo('turbo')}
          beneficio={turboBenefit}
          icone={Zap}
          titulo="Turbo"
          descricao="Prioridade máxima de exposição."
        />
      </div>

      <SubmitButton disabled={!tipo}>
        {tipo ? `Ativar ${tipo === 'turbo' ? 'Turbo' : 'Destaque'}` : 'Escolha uma opção'}
      </SubmitButton>
    </form>
  );
}

function OpcaoPromocao({
  selecionado, onSelect, beneficio, icone: Icone, titulo, descricao,
}: {
  selecionado: boolean;
  onSelect: () => void;
  beneficio: BenefitInfo;
  icone: React.ComponentType<{ className?: string }>;
  titulo: string;
  descricao: string;
}) {
  const disponivel = beneficio.remaining > 0;

  return (
    <label
      className={cn(
        'flex gap-3 items-start p-3 rounded-[var(--radius-field)] border transition-colors',
        disponivel ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
        selecionado
          ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
          : 'border-[var(--border-strong)] hover:bg-[var(--surface-sunken)]',
      )}
    >
      <input
        type="radio"
        name="tipo-visual"
        checked={selecionado}
        onChange={onSelect}
        disabled={!disponivel}
        className="mt-1 size-4 accent-[var(--accent)] shrink-0"
      />
      <Icone className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="block text-[0.9375rem] font-medium">{titulo}</span>
          <span className="shrink-0 text-[0.75rem] tabular-nums text-[var(--content-muted)]">
            {beneficio.remaining} de {beneficio.limit} disponíve{beneficio.limit === 1 ? 'l' : 'is'}
          </span>
        </span>
        <span className="block text-[0.8125rem] text-[var(--content-muted)] leading-snug">{descricao}</span>
        {!disponivel && (
          <span className="block text-[0.75rem] text-[var(--color-caution)] mt-1">
            Você já usou {titulo.toLowerCase() === 'turbo' ? 'o' : 'os'} {beneficio.limit} este mês.
          </span>
        )}
      </span>
    </label>
  );
}
