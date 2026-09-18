import type { Metadata } from 'next';
import Link from 'next/link';
import { MessagesSquare, Lock } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { listConversations } from '@/lib/messaging/queries';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'Mensagens' };
export const dynamic = 'force-dynamic';

function tempoRelativo(data: Date | null): string {
  if (!data) return '';
  const diffMs = Date.now() - new Date(data).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d`;
}

export default async function MensagensPage() {
  const user = await requireUser('/mensagens');
  const conversas = await listConversations(user.id);

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-2xl px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <header className="space-y-1">
          <h1 className="text-[1.75rem] font-semibold">Mensagens</h1>
          <p className="text-[var(--content-muted)]">
            {conversas.length === 0
              ? 'Nenhuma conversa ainda.'
              : `${conversas.length} ${conversas.length === 1 ? 'conversa' : 'conversas'}.`}
          </p>
        </header>

        {conversas.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed p-12 text-center space-y-3">
            <MessagesSquare className="size-6 mx-auto text-[var(--content-subtle)]" aria-hidden />
            <p className="font-medium">Nada por aqui ainda</p>
            <p className="text-[0.9375rem] text-[var(--content-muted)] max-w-sm mx-auto leading-relaxed">
              Quando você falar com um proprietário (ou alguém falar com você sobre um dos seus
              espaços), a conversa aparece aqui.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {conversas.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/mensagens/${c.id}`}
                  className="flex items-center gap-3 rounded-[var(--radius-card)] border p-4 hover:border-[var(--content-subtle)] transition-colors"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{c.outraParteNome ?? 'Usuário'}</p>
                      {c.closedAt && <Lock className="size-3.5 text-[var(--content-subtle)] shrink-0" aria-hidden />}
                    </div>
                    <p className="text-[0.8125rem] text-[var(--content-muted)] truncate">
                      {c.spaceTitle}
                    </p>
                    {c.ultimaMensagem && (
                      <p className="text-[0.8125rem] text-[var(--content-subtle)] truncate">
                        {c.ultimaMensagem}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <span className="text-[0.75rem] text-[var(--content-subtle)]">
                      {tempoRelativo(c.lastMessageAt)}
                    </span>
                    {c.naoLidas > 0 && <Badge tone="accent">{c.naoLidas}</Badge>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
