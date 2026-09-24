'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Eye, Pause, Pencil, Play, Trash2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import {
  toggleSpaceStatusAction, deleteSpaceAction, type SpaceActionState,
} from '@/lib/spaces/actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { PromoteSpaceDialog } from '@/components/promotions/promote-space-dialog';
import type { ActivePromotion, BenefitUsage } from '@/lib/promotions/queries';

function IconSubmit({
  icon: Icon, label, variant = 'ghost',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  variant?: 'ghost' | 'critical' | 'secondary';
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} loading={pending}>
      {!pending && <Icon className="size-4" />}
      {label}
    </Button>
  );
}

/**
 * Ações de um anúncio no painel.
 *
 * Excluir pede confirmação em duas etapas. É a única ação daqui que não dá
 * para desfazer — pausar e retomar são reversíveis, e por isso vão direto.
 */
export function SpaceCardActions({
  spaceId, slug, title, status, draftStep, activePromotion, benefitUsage,
}: {
  spaceId: string;
  slug: string;
  /** So obrigatorio para o dialog de Destacar — o titulo aparece no cabecalho dele. */
  title?: string;
  status: string;
  draftStep: number;
  activePromotion?: ActivePromotion | null;
  benefitUsage?: BenefitUsage;
}) {
  const [toggleState, toggleAction] = useActionState<SpaceActionState | undefined, FormData>(
    toggleSpaceStatusAction, undefined,
  );
  const [deleteState, deleteAction] = useActionState<SpaceActionState | undefined, FormData>(
    deleteSpaceAction, undefined,
  );
  const [confirming, setConfirming] = useState(false);

  const isDraft = status === 'draft';
  const isPublished = status === 'published';
  const isPaused = status === 'paused';
  const isRented = status === 'rented';

  const editHref = isDraft
    ? `/anunciar/${spaceId}/${['tipo', 'localizacao', 'caracteristicas', 'fotos', 'descricao', 'preco', 'regras', 'revisao'][Math.min(draftStep, 8) - 1]}`
    : `/anunciar/${spaceId}/revisao`;

  const erro = toggleState?.message && !toggleState.ok
    ? toggleState.message
    : deleteState?.message && !deleteState.ok
      ? deleteState.message
      : null;

  return (
    <div className="space-y-2">
      {erro && <Alert tone="critical">{erro}</Alert>}
      {deleteState?.ok && deleteState.message && (
        <Alert tone="success">{deleteState.message}</Alert>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href={editHref}
          className="inline-flex items-center gap-2 h-9 px-3 text-[0.875rem] font-medium rounded-[var(--radius-field)] hover:bg-[var(--surface-sunken)] transition-colors"
        >
          <Pencil className="size-4" aria-hidden />
          {isDraft ? 'Continuar' : 'Editar'}
        </Link>

        {(isPublished || isPaused || isRented) && (
          <Link
            href={`/espacos/${slug}`}
            className="inline-flex items-center gap-2 h-9 px-3 text-[0.875rem] font-medium rounded-[var(--radius-field)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <Eye className="size-4" aria-hidden />
            Ver
          </Link>
        )}

        {isPublished && benefitUsage && (
          <PromoteSpaceDialog
            spaceId={spaceId}
            spaceTitle={title ?? ''}
            activePromotion={activePromotion ?? null}
            premium={benefitUsage.premium}
            destaqueBenefit={benefitUsage.destaque}
            turboBenefit={benefitUsage.turbo}
          />
        )}

        {(isPublished || isPaused) && (
          <form action={toggleAction}>
            <input type="hidden" name="spaceId" value={spaceId} />
            <IconSubmit
              icon={isPublished ? Pause : Play}
              label={isPublished ? 'Pausar' : 'Reativar'}
            />
          </form>
        )}

        {!isRented && (
          confirming ? (
            <form action={deleteAction} className="flex items-center gap-1.5">
              <input type="hidden" name="spaceId" value={spaceId} />
              <IconSubmit icon={TriangleAlert} label="Confirmar exclusão" variant="critical" />
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
            </form>
          ) : (
            <Button
              type="button" size="sm" variant="quiet"
              onClick={() => setConfirming(true)}
            >
              <Trash2 className="size-4" />
              Excluir
            </Button>
          )
        )}
      </div>
    </div>
  );
}
