import Link from 'next/link';
import { Home, Search, Rocket, Building2, CalendarCheck, CircleUser } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Navegação inferior fixa, só no celular.
 *
 * No desktop o cabeçalho já mostra "Anunciar meu espaço" / "Meus espaços" /
 * "Meus aluguéis" por extenso; no celular esses links ficam `hidden`
 * (não cabem) e, sem isso, ficavam inalcançáveis sem digitar a URL. Cada
 * item aqui tem legenda visível (não só ícone) — layout de app de verdade,
 * não um menu genérico de framework.
 */
export function MobileBottomNav({ isOwner, rentalsAlert = false }: { isOwner: boolean; rentalsAlert?: boolean }) {
  const itens = [
    { href: '/', label: 'Início', icon: Home, alerta: false },
    { href: '/espacos', label: 'Buscar', icon: Search, alerta: false },
    isOwner
      ? { href: '/meus-espacos', label: 'Meus espaços', icon: Building2, alerta: false }
      : { href: '/anunciar', label: 'Anunciar', icon: Rocket, alerta: false },
    // Parte 12: ponto enquanto houver aluguel com pagamento pendente (o "!" fica no aluguel).
    { href: '/reservas', label: 'Meus aluguéis', icon: CalendarCheck, alerta: rentalsAlert },
    { href: '/minha-conta', label: 'Conta', icon: CircleUser, alerta: false },
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
          aria-label={item.alerta ? `${item.label}, pagamento pendente` : undefined}
          className="flex flex-col items-center justify-center gap-0.5 h-16 text-[var(--content-muted)] active:bg-[var(--surface-sunken)] transition-colors"
        >
          <span className="relative">
            <item.icon className="size-5" aria-hidden />
            {item.alerta && (
              <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-[var(--color-critical)] ring-2 ring-[var(--surface)]" aria-hidden />
            )}
          </span>
          <span className="text-[0.6875rem] font-medium leading-none">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
