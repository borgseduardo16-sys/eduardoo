import Link from 'next/link';
import { Home, Search, Rocket, Building2, CalendarCheck, CircleUser } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Navegação inferior fixa, só no celular.
 *
 * No desktop o cabeçalho já mostra "Anunciar meu espaço" / "Meus espaços" /
 * "Minhas reservas" por extenso; no celular esses links ficam `hidden`
 * (não cabem) e, sem isso, ficavam inalcançáveis sem digitar a URL. Cada
 * item aqui tem legenda visível (não só ícone) — layout de app de verdade,
 * não um menu genérico de framework.
 */
export function MobileBottomNav({ isOwner }: { isOwner: boolean }) {
  const itens = [
    { href: '/', label: 'Início', icon: Home },
    { href: '/espacos', label: 'Buscar', icon: Search },
    isOwner
      ? { href: '/meus-espacos', label: 'Meus espaços', icon: Building2 }
      : { href: '/anunciar', label: 'Anunciar', icon: Rocket },
    { href: '/reservas', label: 'Reservas', icon: CalendarCheck },
    { href: '/minha-conta', label: 'Conta', icon: CircleUser },
  ];

  return (
    <nav
      aria-label="Navegação principal"
      data-mobile-bottom-nav
      className={cn(
        'sm:hidden fixed bottom-0 inset-x-0 z-40',
        'grid grid-cols-5 border-t bg-[var(--surface)]/95 backdrop-blur-md',
        'pb-[env(safe-area-inset-bottom)]',
      )}
    >
      {itens.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="flex flex-col items-center justify-center gap-0.5 h-16 text-[var(--content-muted)] active:bg-[var(--surface-sunken)] transition-colors"
        >
          <item.icon className="size-5" aria-hidden />
          <span className="text-[0.6875rem] font-medium leading-none">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
