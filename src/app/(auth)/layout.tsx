import Link from 'next/link';
import { Logo } from '@/components/ui/logo';

/**
 * Moldura das telas de autenticacao.
 *
 * Em telas pequenas e uma coluna so, com o formulario alto na tela para ficar
 * ao alcance do polegar. A partir de lg entra o painel lateral com a proposta
 * do produto — que some no celular em vez de virar um bloco decorativo
 * empurrando o formulario para baixo da dobra.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1fr_minmax(0,34rem)]">
      <aside className="hidden lg:flex flex-col justify-between p-12 bg-[var(--surface-sunken)] border-r">
        <Link href="/" className="text-[var(--accent)] w-fit">
          <Logo />
        </Link>

        <div className="max-w-md space-y-5">
          <h2 className="text-[2rem] leading-[1.15] font-semibold">
            Todo espaço parado é dinheiro parado.
          </h2>
          <p className="text-[var(--content-muted)] leading-relaxed">
            Uma garagem vazia, um cômodo sem uso, um galpão ocioso. Do outro lado tem
            alguém procurando exatamente isso, perto de onde mora.
          </p>
        </div>

        <p className="text-[0.8125rem] text-[var(--content-subtle)]">
          MyPlace intermedeia o contato e o pagamento entre quem tem espaço e quem precisa.
        </p>
      </aside>

      <main id="conteudo" className="flex flex-col justify-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-sm mx-auto">
          <Link href="/" className="lg:hidden text-[var(--accent)] mb-10 inline-block">
            <Logo />
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
