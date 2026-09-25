import type { Metadata } from 'next';
import { BellOff } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { listNotifications } from '@/lib/notifications/queries';
import { openNotificationAction, markAllNotificationsReadAction } from '@/lib/notifications/actions';
import { notificationIcon, formatRelativeTime } from '@/lib/notifications/format';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { MarkAllReadButton } from '@/components/notifications/mark-all-read-button';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Notificações' };
export const dynamic = 'force-dynamic';

export default async function NotificacoesPage() {
  const user = await requireUser('/notificacoes');
  const notificacoes = await listNotifications(user.id, 30);
  const temNaoLidas = notificacoes.some((n) => !n.readAt);

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-2xl px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <header className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-[1.75rem] font-semibold">Notificações</h1>
            <p className="text-[var(--content-muted)]">O que aconteceu nos seus anúncios e reservas.</p>
          </div>
          {temNaoLidas && (
            <form action={markAllNotificationsReadAction}>
              <MarkAllReadButton />
            </form>
          )}
        </header>

        {notificacoes.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed p-12 text-center space-y-3">
            <BellOff className="size-6 mx-auto text-[var(--content-subtle)]" aria-hidden />
            <p className="font-medium">Nenhuma notificação ainda</p>
            <p className="text-[0.9375rem] text-[var(--content-muted)] max-w-sm mx-auto leading-relaxed">
              Mensagens, solicitações de reserva, pagamentos e promoções aparecem aqui assim
              que acontecem.
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {notificacoes.map((n) => {
              const Icone = notificationIcon(n.type);
              const naoLida = !n.readAt;
              return (
                <li key={n.id}>
                  <form action={openNotificationAction}>
                    <input type="hidden" name="notificationId" value={n.id} />
                    <button
                      type="submit"
                      className={cn(
                        'w-full flex items-start gap-3 text-left rounded-[var(--radius-card)] border p-4 transition-colors hover:bg-[var(--surface-sunken)]',
                        naoLida ? 'bg-[var(--accent-subtle)]/40 border-[var(--accent)]/20' : 'border-transparent',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex items-center justify-center size-8 rounded-full shrink-0',
                          naoLida ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'bg-[var(--surface-sunken)] text-[var(--content-subtle)]',
                        )}
                      >
                        <Icone className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 space-y-0.5">
                        <span className="flex items-center justify-between gap-2">
                          <span className={cn('text-[0.9375rem] truncate', naoLida ? 'font-semibold' : 'font-medium')}>
                            {n.title}
                          </span>
                          <span className="shrink-0 text-[0.75rem] text-[var(--content-subtle)] tabular-nums">
                            {formatRelativeTime(n.createdAt)}
                          </span>
                        </span>
                        {n.body && (
                          <span className="block text-[0.8125rem] text-[var(--content-muted)] leading-relaxed">
                            {n.body}
                          </span>
                        )}
                      </span>
                      {naoLida && (
                        <span className="mt-1.5 size-2 rounded-full bg-[var(--accent)] shrink-0" aria-hidden />
                      )}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
