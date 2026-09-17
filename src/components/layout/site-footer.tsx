import Link from 'next/link';
import { Logo } from '@/components/ui/logo';

export function SiteFooter() {
  return (
    <footer className="border-t mt-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 space-y-10">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-3">
            <span className="text-[var(--accent)] inline-block">
              <Logo />
            </span>
            <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed max-w-xs">
              Conectamos quem tem espaço sobrando a quem precisa de espaço, perto de casa.
            </p>
          </div>

          <nav className="space-y-3" aria-label="Para quem procura">
            <h2 className="text-[0.8125rem] font-semibold">Para quem procura</h2>
            <ul className="space-y-2 text-[0.875rem] text-[var(--content-muted)]">
              <li><Link href="/espacos?tipo=garagem" className="hover:text-[var(--content)]">Garagens</Link></li>
              <li><Link href="/espacos?tipo=deposito" className="hover:text-[var(--content)]">Depósitos</Link></li>
              <li><Link href="/espacos?tipo=galpao" className="hover:text-[var(--content)]">Galpões</Link></li>
              <li><Link href="/espacos" className="hover:text-[var(--content)]">Ver todos</Link></li>
            </ul>
          </nav>

          <nav className="space-y-3" aria-label="Para quem anuncia">
            <h2 className="text-[0.8125rem] font-semibold">Para quem anuncia</h2>
            <ul className="space-y-2 text-[0.875rem] text-[var(--content-muted)]">
              <li><Link href="/anunciar" className="hover:text-[var(--content)]">Anunciar um espaço</Link></li>
              <li><Link href="/como-funciona" className="hover:text-[var(--content)]">Como funciona</Link></li>
              <li><Link href="/taxas" className="hover:text-[var(--content)]">Taxas</Link></li>
            </ul>
          </nav>

          <nav className="space-y-3" aria-label="Institucional">
            <h2 className="text-[0.8125rem] font-semibold">Institucional</h2>
            <ul className="space-y-2 text-[0.875rem] text-[var(--content-muted)]">
              <li><Link href="/protecao" className="hover:text-[var(--content)]">Como protegemos você</Link></li>
              <li><Link href="/termos" className="hover:text-[var(--content)]">Termos de Uso</Link></li>
              <li><Link href="/privacidade" className="hover:text-[var(--content)]">Privacidade</Link></li>
              <li><Link href="/suporte" className="hover:text-[var(--content)]">Suporte</Link></li>
            </ul>
          </nav>
        </div>

        <div className="pt-8 border-t flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-[0.8125rem] text-[var(--content-subtle)]">
            © {new Date().getFullYear()} MyPlace. Nome provisório de desenvolvimento.
          </p>
          <p className="text-[0.8125rem] text-[var(--content-subtle)]">
            MyPlace é uma plataforma intermediadora: não é proprietária dos espaços anunciados.
          </p>
        </div>
      </div>
    </footer>
  );
}
