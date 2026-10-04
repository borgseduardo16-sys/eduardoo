'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { BellRing } from 'lucide-react';
import { joinWaitlistAction, leaveWaitlistAction, type WaitlistActionState } from '@/lib/waitlist/actions';
import { Button } from '@/components/ui/button';

/**
 * "Avise-me quando estiver disponível" na página de um anúncio sem vaga (lista de espera, Fase 23).
 *
 * O estado mostrado é sempre o do servidor (a página é recarregada depois de
 * cada ação): nunca "você está na lista" sem a linha existir de verdade.
 */
export function WaitlistPanel({
  spaceId,
  slug,
  loggedIn,
  entry,
}: {
  spaceId: string;
  slug: string;
  loggedIn: boolean;
  /** Entrada atual de quem está vendo: esperando, ou já avisado. */
  entry: { status: 'waiting' | 'notified' | 'left' | 'closed'; joinedAtLabel: string; notifiedAtLabel: string | null } | null;
}) {
  const [entrarEstado, entrar, entrando] = useActionState<WaitlistActionState | undefined, FormData>(
    joinWaitlistAction,
    undefined,
  );
  const [sairEstado, sair, saindo] = useActionState<WaitlistActionState | undefined, FormData>(
    leaveWaitlistAction,
    undefined,
  );
  const mensagem = sairEstado?.message ?? entrarEstado?.message;
  const erro = (sairEstado && !sairEstado.ok) || (entrarEstado && !entrarEstado.ok);

  if (!loggedIn) {
    return (
      <div className="space-y-2">
        <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
          Entre na sua conta para receber um aviso quando uma vaga for liberada.
        </p>
        <Link
          href={`/entrar?next=${encodeURIComponent(`/espacos/${slug}`)}`}
          className="inline-flex items-center gap-2 h-11 px-5 font-medium rounded-[var(--radius-field)] border border-[var(--border-strong)] hover:bg-[var(--surface-sunken)]"
        >
          <BellRing className="size-4" aria-hidden />
          Entrar para ser avisado
        </Link>
      </div>
    );
  }

  const esperando = entry?.status === 'waiting';

  return (
    <div className="space-y-3" data-testid="lista-espera">
      {esperando ? (
        <>
          <p className="flex items-start gap-2 text-[0.9375rem]">
            <BellRing className="size-4 mt-1 shrink-0 text-[var(--accent)]" aria-hidden />
            <span>
              Combinado: você será avisado quando houver vaga (pedido feito em {entry.joinedAtLabel}).
            </span>
          </p>
          <form action={sair}>
            <input type="hidden" name="spaceId" value={spaceId} />
            <Button type="submit" variant="quiet" size="sm" loading={saindo} data-testid="sair-lista-espera">
              Não quero mais o aviso
            </Button>
          </form>
        </>
      ) : (
        <>
          <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
            {entry?.status === 'notified' && entry.notifiedAtLabel
              ? `Você foi avisado em ${entry.notifiedAtLabel} que havia vaga, mas ela foi ocupada de novo. Peça o aviso outra vez para receber o próximo.`
              : 'Você recebe um aviso quando uma vaga for liberada. Nenhuma vaga fica reservada para quem pediu o aviso: quando houver vaga, você envia a solicitação normalmente.'}
          </p>
          <form action={entrar}>
            <input type="hidden" name="spaceId" value={spaceId} />
            <Button type="submit" variant="secondary" loading={entrando} data-testid="entrar-lista-espera">
              {!entrando && <BellRing aria-hidden />}
              Avise-me quando estiver disponível
            </Button>
          </form>
        </>
      )}

      {mensagem && (
        <p role={erro ? 'alert' : 'status'} className={erro ? 'text-[0.8125rem] text-[var(--color-critical)]' : 'text-[0.8125rem] text-[var(--content-muted)]'}>
          {mensagem}
        </p>
      )}
    </div>
  );
}
