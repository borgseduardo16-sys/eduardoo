import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Lock, EyeOff } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { getConversationForUser, listMessages } from '@/lib/messaging/queries';
import { markConversationReadAction } from '@/lib/messaging/actions';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { SendMessageForm } from '@/components/messaging/send-message-form';
import { ReportDialog } from '@/components/safety/report-dialog';
import { ProtectionNotice } from '@/components/safety/protection-notice';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Conversa' };
export const dynamic = 'force-dynamic';

function formatarHora(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(data));
}

export default async function ConversaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/mensagens/${id}`);

  const conversa = await getConversationForUser(id, user.id);
  if (!conversa) notFound();

  await markConversationReadAction(id);
  const mensagens = await listMessages(id);

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-2xl px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <div className="space-y-3">
          <Link href="/mensagens" className="inline-flex items-center gap-1.5 text-[0.8125rem] text-[var(--content-muted)] hover:text-[var(--content)]">
            <ArrowLeft className="size-3.5" aria-hidden />
            Mensagens
          </Link>
          <header className="space-y-0.5">
            <h1 className="text-[1.375rem] font-semibold">
              <Link href={`/espacos/${conversa.spaceSlug}`} className="hover:underline">
                {conversa.spaceTitle}
              </Link>
            </h1>
            {conversa.closedAt && (
              <p className="flex items-center gap-1.5 text-[0.8125rem] text-[var(--content-subtle)]">
                <Lock className="size-3.5" aria-hidden />
                Esta conversa está encerrada.
              </p>
            )}
          </header>
        </div>

        <ul className="space-y-3">
          {mensagens.map((m) => {
            const minha = m.senderId === user.id;
            const escondida = Boolean(m.hiddenAt);
            return (
              <li key={m.id} className={cn('flex flex-col gap-1', minha ? 'items-end' : 'items-start')}>
                <div
                  className={cn(
                    'group relative max-w-[85%] rounded-[var(--radius-field)] px-3.5 py-2.5',
                    minha
                      ? 'bg-[var(--accent)] text-[var(--accent-content)]'
                      : 'bg-[var(--surface-sunken)] text-[var(--content)]',
                    m.isSystem && 'italic text-[0.875rem]',
                  )}
                >
                  {escondida ? (
                    <p className="flex items-center gap-1.5 text-[0.8125rem] opacity-80">
                      <EyeOff className="size-3.5" aria-hidden />
                      Mensagem removida pela moderação.
                    </p>
                  ) : (
                    <p className="text-[0.9375rem] whitespace-pre-wrap break-words">{m.body}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 px-1">
                  <span className="text-[0.75rem] text-[var(--content-subtle)]">
                    {minha ? 'Você' : m.senderName} · {formatarHora(m.createdAt)}
                  </span>
                  {!minha && !escondida && !m.isSystem && (
                    <ReportDialog targetType="message" targetId={m.id} targetLabel="esta mensagem" variant="ghost" className="!h-auto !p-0 !text-[0.75rem] text-[var(--content-subtle)] underline underline-offset-2" />
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {!conversa.closedAt && <SendMessageForm conversationId={conversa.id} />}

        <ProtectionNotice variant="compact" />
      </main>

      <SiteFooter />
    </>
  );
}
