'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { ArrowLeft, Rocket } from 'lucide-react';
import { publishSpaceAction, type SpaceActionState } from '@/lib/spaces/actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

function PublishButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" block loading={pending}>
      {!pending && <Rocket className="size-4" aria-hidden />}
      {label}
    </Button>
  );
}

/**
 * Publicar ou voltar para editar.
 *
 * O rascunho já está salvo — não existe "salvar como rascunho" como ação
 * separada porque cada etapa grava ao ser enviada. Sair da página a qualquer
 * momento preserva tudo; o botão só confirma a ida ao ar.
 */
export function PublishActions({ spaceId, alreadyPublished }: { spaceId: string; alreadyPublished: boolean }) {
  const [state, action] = useActionState<SpaceActionState | undefined, FormData>(
    publishSpaceAction, undefined,
  );

  return (
    <div className="space-y-4">
      {state?.message && !state.ok && <Alert tone="critical">{state.message}</Alert>}

      <form action={action}>
        <input type="hidden" name="spaceId" value={spaceId} />
        <PublishButton label={alreadyPublished ? 'Salvar alterações' : 'Publicar espaço'} />
      </form>

      <div className="flex items-center justify-between gap-3 text-[0.875rem]">
        <Link
          href={`/anunciar/${spaceId}/regras`}
          className="inline-flex items-center gap-1.5 text-[var(--content-muted)] hover:text-[var(--content)]"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Voltar e editar
        </Link>
        <Link href="/meus-espacos" className="text-[var(--content-muted)] hover:text-[var(--content)]">
          Continuar depois
        </Link>
      </div>

      <p className="text-[0.75rem] text-[var(--content-subtle)] text-center leading-relaxed">
        Seu rascunho já está salvo. Você pode fechar esta página e voltar quando quiser.
      </p>
    </div>
  );
}
