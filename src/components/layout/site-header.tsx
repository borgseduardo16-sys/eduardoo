import Link from 'next/link';
import { Heart, MessageCircle } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/dal';
import { signOutAction } from '@/lib/auth/actions';
import { countUnreadConversations } from '@/lib/messaging/queries';
import { Logo } from '@/components/ui/logo';
import { Button } from '@/components/ui/button';

export async function SiteHeader() {
  const user = await getCurrentUser();
  const naoLidas = user ? await countUnreadConversations(user.id) : 0;

  return (
    <header className="sticky top-0 z-40 border-b bg-[var(--surface)]/85 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="text-[var(--accent)] shrink-0">
          <Logo />
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          {user ? (
            <>
              <Link
                href="/anunciar"
                className="hidden sm:inline-flex items-center h-10 px-3 text-[0.875rem] font-medium rounded-[var(--radius-field)] hover:bg-[var(--surface-sunken)]"
              >
                Anunciar meu espaço
              </Link>
              <Link
                href="/meus-espacos"
                className="hidden sm:inline-flex items-center h-10 px-3 text-[0.875rem] font-medium rounded-[var(--radius-field)] hover:bg-[var(--surface-sunken)]"
              >
                Meus espaços
              </Link>
              <Link
                href="/reservas"
                className="hidden sm:inline-flex items-center h-10 px-3 text-[0.875rem] font-medium rounded-[var(--radius-field)] hover:bg-[var(--surface-sunken)]"
              >
                Minhas reservas
              </Link>
              <Link
                href="/mensagens"
                aria-label={naoLidas > 0 ? `Mensagens, ${naoLidas} não lidas` : 'Mensagens'}
                className="relative inline-flex items-center justify-center size-10 rounded-[var(--radius-field)] hover:bg-[var(--surface-sunken)] text-[var(--content-muted)]"
              >
                <MessageCircle className="size-[1.125rem]" aria-hidden />
                {naoLidas > 0 && (
                  <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-[var(--color-critical)]" aria-hidden />
                )}
              </Link>
              <Link
                href="/favoritos"
                aria-label="Favoritos"
                className="inline-flex items-center justify-center size-10 rounded-[var(--radius-field)] hover:bg-[var(--surface-sunken)] text-[var(--content-muted)]"
              >
                <Heart className="size-[1.125rem]" aria-hidden />
              </Link>
              <Link
                href="/minha-conta"
                className="text-[0.875rem] font-medium px-3 py-2 rounded-[var(--radius-field)] hover:bg-[var(--surface-sunken)]"
              >
                {user.fullName?.split(' ')[0] ?? 'Minha conta'}
              </Link>
              <form action={signOutAction}>
                <Button type="submit" variant="quiet" size="sm">
                  Sair
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/entrar"
                className="text-[0.875rem] font-medium px-3 py-2 rounded-[var(--radius-field)] hover:bg-[var(--surface-sunken)]"
              >
                Entrar
              </Link>
              <Link
                href="/anunciar"
                className="inline-flex items-center justify-center h-10 px-4 text-[0.875rem] font-medium whitespace-nowrap rounded-[var(--radius-field)] bg-[var(--accent)] text-[var(--accent-content)] hover:bg-[var(--accent-hover)] transition-colors"
              >
                <span className="sm:hidden">Anunciar</span>
                <span className="hidden sm:inline">Anunciar meu espaço</span>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
