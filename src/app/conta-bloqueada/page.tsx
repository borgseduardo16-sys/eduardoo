import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/dal';
import { Alert } from '@/components/ui/alert';
import { Logo } from '@/components/ui/logo';

export const metadata: Metadata = { title: 'Conta bloqueada' };

export default async function ContaBloqueadaPage() {
  const user = await getCurrentUser();

  return (
    <main id="conteudo" className="min-h-dvh flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-md space-y-8">
        <Link href="/" className="text-[var(--accent)] inline-block">
          <Logo />
        </Link>

        <div className="space-y-4">
          <h1 className="text-[1.75rem] font-semibold">Conta bloqueada</h1>
          <Alert tone="warning">
            {user?.statusReason ??
              'Sua conta está temporariamente bloqueada e não pode ser usada no momento.'}
          </Alert>
          <p className="text-[var(--content-muted)] leading-relaxed">
            Se você acredita que houve um engano, responda ao e-mail que enviamos ou entre em
            contato com o suporte informando o endereço cadastrado.
          </p>
        </div>

        <Link
          href="/"
          className="text-[0.875rem] text-[var(--accent)] underline underline-offset-4"
        >
          Voltar para a página inicial
        </Link>
      </div>
    </main>
  );
}
