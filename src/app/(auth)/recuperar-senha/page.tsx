import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { RequestPasswordResetForm } from '@/components/auth/password-forms';

export const metadata: Metadata = { title: 'Recuperar senha' };

export default function RecuperarSenhaPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-[1.75rem] font-semibold">Recuperar senha</h1>
        <p className="text-[var(--content-muted)]">
          Informe o e-mail da sua conta e enviamos um link para criar uma nova senha.
        </p>
      </header>

      <RequestPasswordResetForm />

      <Link
        href="/entrar"
        className="inline-flex items-center gap-1.5 text-[0.875rem] text-[var(--content-muted)] hover:text-[var(--content)]"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Voltar para o login
      </Link>
    </div>
  );
}
