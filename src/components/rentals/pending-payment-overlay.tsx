'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CircleAlert, X } from 'lucide-react';
import { paymentWindowState } from '@/lib/rentals/pricing';
import { brTime } from '@/lib/rentals/time';
import { buttonVariants } from '@/components/ui/button';
import { EndBookingButton } from '@/components/bookings/end-booking-button';
import { Countdown } from './live';
import { cn } from '@/lib/utils';

export type PaymentIssueView = {
  bookingId: string;
  spaceTitle: string;
  unitLabel: string | null;
  startedAt: string;
  deadlineAt: string;
};

const chaveDe = (i: PaymentIssueView) => `${i.bookingId}@${i.startedAt}`;

// Pendências já dispensadas nesta sessão (sessionStorage; memória se o
// navegador bloquear o armazenamento). Lida como fonte externa.
const ARMAZENAMENTO = 'myplace:pendencias-dispensadas';
const ouvintes = new Set<() => void>();
let memoria = '';

function lerDispensadas(): string {
  try {
    return window.sessionStorage.getItem(ARMAZENAMENTO) ?? memoria;
  } catch {
    return memoria;
  }
}

function dispensar(i: PaymentIssueView) {
  const atuais = lerDispensadas();
  if (atuais.split('|').includes(chaveDe(i))) return;
  memoria = atuais ? `${atuais}|${chaveDe(i)}` : chaveDe(i);
  try {
    window.sessionStorage.setItem(ARMAZENAMENTO, memoria);
  } catch {
    // Sem armazenamento: vale só enquanto a página estiver aberta.
  }
  ouvintes.forEach((ouvir) => ouvir());
}

function assinar(ouvir: () => void) {
  ouvintes.add(ouvir);
  return () => {
    ouvintes.delete(ouvir);
  };
}

/**
 * Pagamento pendente ao abrir o app (Parte 12): antes de qualquer outra
 * coisa, a tela de pagamento pendente — com um X para fechar. Fechou, não
 * volta nesta sessão (a mesma pendência); abriu o app de novo, aparece de
 * novo enquanto não for resolvida. Os indicadores (ponto no menu, "!" no
 * aluguel) continuam até o pagamento ser resolvido de verdade.
 *
 * Não aparece nas telas do próprio aluguel com problema: lá a informação
 * já está na página (e abrir uma delas conta como "já viu").
 */
export function PendingPaymentOverlay({ issues, serverNow }: { issues: PaymentIssueView[]; serverNow: string }) {
  const pathname = usePathname() ?? '';
  const dialogRef = useRef<HTMLDialogElement>(null);
  // As pendências de quando a tela abriu: se a pessoa cancelar aqui dentro,
  // a confirmação continua visível até ela fechar.
  const [inicial] = useState(issues);
  // null no servidor: só o navegador sabe o que já foi dispensado.
  const dispensadas = useSyncExternalStore(assinar, lerDispensadas, () => null);

  const naPropriaTela = (i: PaymentIssueView) => pathname.startsWith(`/reservas/${i.bookingId}`);
  const atual =
    dispensadas === null
      ? null
      : (inicial.find((i) => !dispensadas.split('|').includes(chaveDe(i)) && !naPropriaTela(i)) ?? null);
  const outras = inicial.length - 1;

  // Abriu a tela do próprio aluguel com problema: já viu, não precisa do aviso.
  useEffect(() => {
    for (const i of inicial) if (pathname.startsWith(`/reservas/${i.bookingId}`)) dispensar(i);
  }, [inicial, pathname]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (atual && !dialog.open) dialog.showModal();
    if (!atual && dialog.open) dialog.close();
  }, [atual]);

  const fechar = () => {
    if (atual) dispensar(atual);
  };

  const janela = atual
    ? paymentWindowState(new Date(atual.startedAt), new Date(atual.deadlineAt), new Date(serverNow))
    : null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="pendente-overlay-titulo"
      // Esc, X ou clique no fundo: fecha e não volta nesta sessão.
      onClose={fechar}
      onClick={(e) => {
        if (e.target === dialogRef.current) fechar();
      }}
      className={cn(
        'w-[min(28rem,calc(100vw-2rem))] p-0 rounded-[var(--radius-card)]',
        'bg-[var(--surface-raised)] text-[var(--content)]',
        'shadow-[var(--shadow-overlay)] border',
        'backdrop:bg-black/40 backdrop:backdrop-blur-[2px]',
        'open:animate-rise',
      )}
      data-testid="aviso-pagamento-pendente"
    >
      {atual && janela && (
        <>
          <div className="flex items-start justify-between gap-4 p-5 pb-2">
            <h2 id="pendente-overlay-titulo" className="flex items-center gap-2 text-[1.125rem] font-semibold">
              <CircleAlert className="size-5 text-[var(--color-critical)]" aria-hidden />
              Pagamento pendente
            </h2>
            <button
              type="button"
              onClick={fechar}
              aria-label="Fechar"
              className="shrink-0 -mt-1 -mr-1 p-2 rounded-[var(--radius-field)] text-[var(--content-muted)] hover:bg-[var(--surface-sunken)]"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <div className="px-5 pb-5 space-y-4">
            <p className="text-[0.9375rem] leading-relaxed">
              Não conseguimos concluir a cobrança automática do seu aluguel. Regularize o pagamento para continuar
              utilizando este espaço.
            </p>
            <p className="text-[0.875rem] text-[var(--content-muted)] break-words">
              {[atual.spaceTitle, atual.unitLabel].filter(Boolean).join(' · ')}
            </p>
            <p className="text-[0.9375rem]">
              {janela.phase === 'first' ? 'Tempo restante: ' : 'Último prazo: '}
              <Countdown
                target={janela.phaseEndsAt.toISOString()}
                serverNow={serverNow}
                className="font-semibold"
                endedText="prazo encerrado"
              />
              <span className="text-[var(--content-muted)]"> — até {brTime(janela.phaseEndsAt)}</span>
            </p>

            <div className="space-y-1">
              <Link
                href={`/reservas/${atual.bookingId}/pendente`}
                onClick={fechar}
                className={buttonVariants({ size: 'lg', block: true })}
              >
                Pagar agora
              </Link>
              <EndBookingButton bookingId={atual.bookingId} status="past_due" kind="continuous" label="Cancelar aluguel" />
            </div>

            {outras > 0 && (
              <p className="text-[0.8125rem] text-[var(--content-muted)]">
                Você tem mais {outras} {outras === 1 ? 'aluguel' : 'aluguéis'} com pagamento pendente.{' '}
                <Link href="/reservas" onClick={fechar} className="text-[var(--accent)] underline underline-offset-4">
                  Ver Meus aluguéis
                </Link>
              </p>
            )}
          </div>
        </>
      )}
    </dialog>
  );
}
