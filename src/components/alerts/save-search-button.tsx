'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { BellPlus } from 'lucide-react';
import { saveSearchAlertAction, type AlertActionState } from '@/lib/alerts/actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

/**
 * "Criar alerta desta busca" (Fase 23).
 *
 * Manda só a query string da busca que está na tela; o servidor
 * reinterpreta tudo, valida e escreve o nome do alerta. Com `alertId`, a
 * mesma tela vira o editor: salva a busca atual como os novos critérios
 * daquele alerta.
 */
export function SaveSearchButton({
  search,
  loggedIn,
  alertId,
  alertLabel,
}: {
  search: string;
  loggedIn: boolean;
  alertId?: string;
  alertLabel?: string;
}) {
  const [estado, acao, enviando] = useActionState<AlertActionState | undefined, FormData>(
    saveSearchAlertAction,
    undefined,
  );

  if (!loggedIn) {
    return (
      <p className="text-[0.8125rem] text-[var(--content-muted)]">
        <Link
          href={`/entrar?next=${encodeURIComponent(`/espacos?${search}`)}`}
          className="inline-flex items-center gap-1.5 text-[var(--accent)] underline-offset-4 hover:underline"
        >
          <BellPlus className="size-4" aria-hidden />
          Entre para criar um alerta desta busca
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-2" data-testid="criar-alerta">
      {alertId && alertLabel && !estado?.ok && (
        <p className="text-[0.8125rem] text-[var(--content-muted)]">
          Editando o alerta <strong className="font-medium text-[var(--content)]">{alertLabel}</strong>. Ajuste a
          busca e salve.
        </p>
      )}
      <form action={acao}>
        <input type="hidden" name="search" value={search} />
        {alertId && <input type="hidden" name="alertId" value={alertId} />}
        <Button type="submit" size="sm" variant="secondary" loading={enviando}>
          {!enviando && <BellPlus aria-hidden />}
          {alertId ? 'Salvar esta busca no alerta' : 'Criar alerta desta busca'}
        </Button>
      </form>
      {estado?.message && (
        <Alert tone={estado.ok ? 'success' : estado.limitReached ? 'warning' : 'critical'}>
          {estado.message}{' '}
          {(estado.ok || estado.limitReached) && (
            <Link href="/alertas" className="text-[var(--accent)] underline underline-offset-4">
              Meus alertas
            </Link>
          )}
        </Alert>
      )}
    </div>
  );
}
