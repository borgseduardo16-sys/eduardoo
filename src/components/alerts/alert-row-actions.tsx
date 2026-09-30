'use client';

import { useActionState, useState } from 'react';
import { Pause, Play, Trash2 } from 'lucide-react';
import {
  deleteSearchAlertAction,
  setSearchAlertStatusAction,
  type AlertActionState,
} from '@/lib/alerts/actions';
import { Button } from '@/components/ui/button';

/**
 * Pausar/ativar e excluir um alerta (Fase 23). O servidor confere de novo
 * que o alerta é de quem está pedindo — o id no formulário não autoriza nada.
 * Excluir pede confirmação; pausar não, porque dá para desfazer.
 */
export function AlertRowActions({ alertId, status }: { alertId: string; status: 'active' | 'paused' }) {
  const [estadoStatus, acaoStatus, mudando] = useActionState<AlertActionState | undefined, FormData>(
    setSearchAlertStatusAction,
    undefined,
  );
  const [estadoExcluir, acaoExcluir, excluindo] = useActionState<AlertActionState | undefined, FormData>(
    deleteSearchAlertAction,
    undefined,
  );
  const [confirmando, setConfirmando] = useState(false);
  const erro = estadoStatus && !estadoStatus.ok ? estadoStatus.message : estadoExcluir && !estadoExcluir.ok ? estadoExcluir.message : null;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <form action={acaoStatus}>
          <input type="hidden" name="alertId" value={alertId} />
          <input type="hidden" name="status" value={status === 'active' ? 'paused' : 'active'} />
          <Button type="submit" size="sm" variant="ghost" loading={mudando}>
            {!mudando && (status === 'active' ? <Pause aria-hidden /> : <Play aria-hidden />)}
            {status === 'active' ? 'Pausar' : 'Ativar'}
          </Button>
        </form>
        {confirmando ? (
          <form action={acaoExcluir} className="flex items-center gap-1.5">
            <input type="hidden" name="alertId" value={alertId} />
            <Button type="submit" size="sm" variant="critical" loading={excluindo}>
              Confirmar exclusão
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>
          </form>
        ) : (
          <Button type="button" size="sm" variant="quiet" onClick={() => setConfirmando(true)}>
            <Trash2 aria-hidden />
            Excluir
          </Button>
        )}
      </div>
      {erro && (
        <p role="alert" className="text-[0.8125rem] text-[var(--color-critical)]">
          {erro}
        </p>
      )}
    </div>
  );
}
