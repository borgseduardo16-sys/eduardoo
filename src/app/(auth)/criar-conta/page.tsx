import type { Metadata } from 'next';
import Link from 'next/link';
import { SignUpForm } from '@/components/auth/sign-up-form';

export const metadata: Metadata = { title: 'Criar conta' };

export default function CriarContaPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-[1.75rem] font-semibold">Criar conta</h1>
        <p className="text-[var(--content-muted)]">
          Uma conta só, para alugar um espaço ou anunciar o seu.
        </p>
      </header>

      <SignUpForm />

      <p className="text-[0.875rem] text-[var(--content-muted)]">
        Já tem conta?{' '}
        <Link
          href="/entrar"
          className="text-[var(--accent)] font-medium underline underline-offset-4"
        >
          Entrar
        </Link>
      </p>
    </div>
  );
}
