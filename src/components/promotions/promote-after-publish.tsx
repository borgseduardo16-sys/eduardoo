'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Star, Zap } from 'lucide-react';
import { activatePromotionAction, type PromotionActionState } from '@/lib/promotions/actions';
import { priceOptionsFor } from '@/lib/promotions/purchase-pricing';
import { ModalidadeCard, type BenefitInfo, type PromotionType } from './modalidade-card';
import { PromotionPurchaseForm } from './promotion-purchase-form';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';

/**
 * Corpo da etapa opcional "Turbine seu anúncio", exibida uma única vez logo
 * depois da primeira publicação (ver redirecionamento condicional em
 * `publishSpaceAction`, src/lib/spaces/actions.ts).
 *
 * Reusa a mesma dupla de componentes do dialog "Destacar" em Meus espaços
 * (`ModalidadeCard` + `PromotionPurchaseForm`) — o benefício grátis do
 * Premium e a compra avulsa funcionam exatamente igual aqui, só a moldura
 * (página cheia em vez de dialog) muda.
 */
export function PromoteAfterPublish({
  spaceId,
  publishedHref,
  activePromotion,
  premium,
  destaqueBenefit,
  turboBenefit,
  cpfSugerido,
}: {
  spaceId: string;
  publishedHref: string;
  /**
   * Promoção já vigente no momento em que a página carregou (ex.: uma compra
   * confirmada enquanto a pessoa ainda estava aqui, ou reentrando na URL
   * depois). null = nenhuma — mostra o formulário de escolha normalmente.
   */
  activePromotion: { type: PromotionType } | null;
  premium: boolean;
  destaqueBenefit: BenefitInfo;
  turboBenefit: BenefitInfo;
  cpfSugerido?: string | null;
}) {
  const [comprando, setComprando] = useState<PromotionType | null>(null);

  const [ativarState, ativarAction] = useActionState<PromotionActionState | undefined, FormData>(
    activatePromotionAction, undefined,
  );

  /*
   * A propria ativacao gratis DESTA pagina vem primeiro: ela tambem torna
   * `activePromotion` vigente (a acao atualiza a arvore de Server Components
   * ao resolver), entao checar `activePromotion` antes faria a confirmacao
   * "Promoção ativada" nunca aparecer — pularia direto pro aviso de baixo.
   */
  if (ativarState?.ok) {
    return (
      <div className="space-y-5">
        <Alert tone="success" title="Promoção ativada">{ativarState.message}</Alert>
        <Link href={publishedHref} className={buttonVariants({ size: 'lg', block: true })}>
          Continuar
        </Link>
      </div>
    );
  }

  if (activePromotion) {
    return (
      <div className="space-y-5">
        <Alert tone="info" title="Este anúncio já está promovido">
          {activePromotion.type === 'turbo' ? 'Turbo' : 'Destaque'} já está ativo — não é possível
          escolher outra modalidade agora.
        </Alert>
        <Link href={publishedHref} className={buttonVariants({ size: 'lg', block: true })}>
          Continuar
        </Link>
      </div>
    );
  }

  if (comprando) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          {comprando === 'turbo' ? (
            <Zap className="size-4 text-[var(--accent)]" aria-hidden fill="currentColor" />
          ) : (
            <Star className="size-4 text-[var(--accent)]" aria-hidden />
          )}
          <p className="font-medium text-[0.9375rem]">
            Comprar {comprando === 'turbo' ? 'Turbo' : 'Destaque'}
          </p>
        </div>
        <PromotionPurchaseForm
          spaceId={spaceId}
          type={comprando}
          cpfSugerido={cpfSugerido}
          onCancel={() => setComprando(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {ativarState?.message && !ativarState.ok && <Alert tone="critical">{ativarState.message}</Alert>}

      <div className="space-y-3">
        <ModalidadeCard
          spaceId={spaceId}
          titulo="Destaque" icone={Star}
          descricao="Mais visibilidade dentro do marketplace."
          beneficio={premium ? destaqueBenefit : null}
          precoAPartir={priceOptionsFor('destaque')[0]!.priceCents}
          ativarAction={ativarAction}
          onComprar={() => setComprando('destaque')}
        />
        <ModalidadeCard
          spaceId={spaceId}
          titulo="Turbo" icone={Zap}
          descricao="Prioridade máxima de exposição."
          beneficio={premium ? turboBenefit : null}
          precoAPartir={priceOptionsFor('turbo')[0]!.priceCents}
          ativarAction={ativarAction}
          onComprar={() => setComprando('turbo')}
        />
      </div>

      <Link
        href={publishedHref}
        className="block text-center text-[0.875rem] text-[var(--content-muted)] hover:text-[var(--content)] py-2"
      >
        Não quero promover
      </Link>
    </div>
  );
}
