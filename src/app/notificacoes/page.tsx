import type { Metadata } from 'next';
import Link from 'next/link';
import { BellOff, Settings2 } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import {
  countUnreadNotifications,
  listReadNotifications,
  listUnreadNotifications,
  type NotificationRow,
} from '@/lib/notifications/queries';
import {
  openNotificationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/lib/notifications/actions';
import { notificationIconElement, formatRelativeTime } from '@/lib/notifications/format';
import { categoryLabelOf } from '@/lib/notifications/categories';
import { parsePage } from '@/lib/reviews/queries';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { MarkAllReadButton } from '@/components/notifications/mark-all-read-button';
import { MarkReadButton } from '@/components/notifications/mark-read-button';
import { Pager } from '@/components/ui/pager';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Notificações', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const UNREAD_LIMIT = 50;

function dataHora(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(d);
}

/**
 * Central de notificações (Fase 21): não lidas e lidas separadas, cada item
 * com título, mensagem, tipo, data/hora, status e o destino ao tocar.
 * Contagem e estado vêm do banco — o sino do cabeçalho lê a mesma tabela.
 */
export default async function NotificacoesPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const user = await requireUser('/notificacoes');
  const pagina = parsePage((await searchParams).pagina);

  const [naoLidas, totalNaoLidas, lidas] = await Promise.all([
    pagina === 1 ? listUnreadNotifications(user.id, UNREAD_LIMIT) : Promise.resolve([]),
    countUnreadNotifications(user.id),
    listReadNotifications(user.id, pagina),
  ]);
  const vazia = totalNaoLidas === 0 && lidas.rows.length === 0 && pagina === 1;

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-2xl px-4 sm:px-6 py-8 sm:py-10 space-y-8">
        <header className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-[1.75rem] font-semibold">Notificações</h1>
              <p className="text-[var(--content-muted)]">O que aconteceu nos seus anúncios e reservas.</p>
            </div>
            <Link
              href="/notificacoes/preferencias"
              className="shrink-0 inline-flex items-center gap-1.5 h-10 px-3 rounded-[var(--radius-field)] text-[0.875rem] text-[var(--content-muted)] hover:text-[var(--content)] hover:bg-[var(--surface-sunken)]"
            >
              <Settings2 className="size-4" aria-hidden />
              Preferências
            </Link>
          </div>
        </header>

        {vazia ? (
          <div className="rounded-[var(--radius-card)] border border-dashed p-10 sm:p-12 text-center space-y-3">
            <BellOff className="size-6 mx-auto text-[var(--content-subtle)]" aria-hidden />
            <p className="font-medium">Você não possui notificações.</p>
            <p className="text-[0.9375rem] text-[var(--content-muted)] max-w-sm mx-auto leading-relaxed">
              Solicitações de aluguel, pagamentos, mensagens e avaliações aparecem aqui assim que
              acontecem.
            </p>
          </div>
        ) : (
          <>
            {pagina === 1 && (
              <section aria-labelledby="nao-lidas" className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="nao-lidas" className="font-semibold">
                    Não lidas{' '}
                    <span className="text-[var(--content-subtle)] font-normal tabular-nums">({totalNaoLidas})</span>
                  </h2>
                  {totalNaoLidas > 0 && (
                    <form action={markAllNotificationsReadAction}>
                      <MarkAllReadButton />
                    </form>
                  )}
                </div>
                {naoLidas.length === 0 ? (
                  <p className="text-[0.9375rem] text-[var(--content-muted)]">Tudo em dia — nenhuma notificação nova.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {naoLidas.map((n) => (
                      <Item key={n.id} n={n} />
                    ))}
                  </ul>
                )}
                {totalNaoLidas > naoLidas.length && (
                  <p className="text-[0.8125rem] text-[var(--content-subtle)]">
                    Mostrando as {naoLidas.length} mais recentes de {totalNaoLidas} não lidas.
                  </p>
                )}
              </section>
            )}

            <section aria-labelledby="lidas" className="space-y-3">
              <h2 id="lidas" className="font-semibold">
                Lidas
              </h2>
              {lidas.rows.length === 0 ? (
                <p className="text-[0.9375rem] text-[var(--content-muted)]">Nenhuma notificação lida por aqui.</p>
              ) : (
                <ul className="space-y-1.5">
                  {lidas.rows.map((n) => (
                    <Item key={n.id} n={n} />
                  ))}
                </ul>
              )}
              <Pager
                page={pagina}
                hasMore={lidas.hasMore}
                href={(p) => (p > 1 ? `/notificacoes?pagina=${p}` : '/notificacoes')}
                label="notificações lidas"
              />
            </section>
          </>
        )}
      </main>

      <SiteFooter />
    </>
  );
}

function Item({ n }: { n: NotificationRow }) {
  const naoLida = !n.readAt;
  return (
    <li
      className={cn(
        'flex items-start gap-1 rounded-[var(--radius-card)] border transition-colors',
        naoLida ? 'bg-[var(--accent-subtle)]/40 border-[var(--accent)]/20' : 'border-transparent',
      )}
      data-testid={naoLida ? 'notificacao-nao-lida' : 'notificacao-lida'}
    >
      <form action={openNotificationAction} className="min-w-0 flex-1">
        <input type="hidden" name="notificationId" value={n.id} />
        <button
          type="submit"
          className="w-full flex items-start gap-3 text-left p-4 rounded-[var(--radius-card)] hover:bg-[var(--surface-sunken)] transition-colors"
        >
          <span
            className={cn(
              'mt-0.5 flex items-center justify-center size-8 rounded-full shrink-0',
              naoLida ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'bg-[var(--surface-sunken)] text-[var(--content-subtle)]',
            )}
          >
            {notificationIconElement(n.type, 'size-4')}
          </span>
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="flex items-baseline justify-between gap-2">
              <span className={cn('text-[0.9375rem] break-words', naoLida ? 'font-semibold' : 'font-medium')}>
                {n.title}
              </span>
              <time
                dateTime={n.createdAt.toISOString()}
                title={dataHora(n.createdAt)}
                className="shrink-0 text-[0.75rem] text-[var(--content-subtle)] tabular-nums"
              >
                {formatRelativeTime(n.createdAt)}
              </time>
            </span>
            {n.body && (
              <span className="block text-[0.8125rem] text-[var(--content-muted)] leading-relaxed break-words">{n.body}</span>
            )}
            <span className="block text-[0.75rem] text-[var(--content-subtle)]">
              {categoryLabelOf(n.type)} · {dataHora(n.createdAt)}
              <span className="sr-only">{naoLida ? ' · não lida' : ' · lida'}</span>
            </span>
          </span>
          {naoLida && <span className="mt-1.5 size-2 rounded-full bg-[var(--accent)] shrink-0" aria-hidden />}
        </button>
      </form>
      {naoLida && (
        <form action={markNotificationReadAction} className="pt-2 pr-2">
          <input type="hidden" name="notificationId" value={n.id} />
          <MarkReadButton title={n.title} />
        </form>
      )}
    </li>
  );
}
