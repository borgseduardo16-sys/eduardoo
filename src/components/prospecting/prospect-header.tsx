import Link from 'next/link';
import { LayoutDashboard, Search, Users } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/dal';
import { signOutAction } from '@/lib/auth/actions';
import { Logo } from '@/components/ui/logo';
import { Button } from '@/components/ui/button';

/**
 * Cabecalho proprio da area de prospeccao.
 *
 * Nao reaproveita o <SiteHeader> do marketplace de proposito: sao publicos
 * diferentes (quem usa MyPlace para alugar espaco nao e quem usa isto para
 * prospectar cliente de site) — misturar os dois num nav so confundiria os
 * dois. So o `Logo`, os tokens de design e a sessao (Supabase Auth) sao
 * reaproveitados.
 */
export async function ProspectHeader() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-40 border-b bg-[var(--surface)]/85 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/prospectar" className="flex items-center gap-2 shrink-0 text-[var(--accent)]">
          <Logo showWordmark={false} />
          <span className="text-[1.0625rem] font-semibold tracking-[-0.03em] text-[var(--content)]">
            Leads
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/prospectar"
            className="inline-flex items-center gap-1.5 h-10 px-3 text-[0.875rem] font-medium rounded-[var(--radius-field)] hover:bg-[var(--surface-sunken)]"
          >
            <Search className="size-4" aria-hidden />
            <span className="hidden sm:inline">Buscar empresas</span>
          </Link>
          <Link
            href="/leads"
            className="inline-flex items-center gap-1.5 h-10 px-3 text-[0.875rem] font-medium rounded-[var(--radius-field)] hover:bg-[var(--surface-sunken)]"
          >
            <Users className="size-4" aria-hidden />
            <span className="hidden sm:inline">Meus Leads</span>
          </Link>
          <Link
            href="/prospectar/painel"
            className="inline-flex items-center gap-1.5 h-10 px-3 text-[0.875rem] font-medium rounded-[var(--radius-field)] hover:bg-[var(--surface-sunken)]"
          >
            <LayoutDashboard className="size-4" aria-hidden />
            <span className="hidden sm:inline">Painel</span>
          </Link>

          {user && (
            <form action={signOutAction} className="ml-1">
              <Button type="submit" variant="quiet" size="sm">
                Sair
              </Button>
            </form>
          )}
        </nav>
      </div>
    </header>
  );
}
