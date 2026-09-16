import type { Metadata } from 'next';
import Link from 'next/link';
import { SignInForm } from '@/components/auth/sign-in-form';
import { isSafeRedirect } from '@/lib/auth/redirect';

export const metadata: Metadata = { title: 'Entrar' };

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = next && isSafeRedirect(next) ? next : undefined;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-[1.75rem] font-semibold">Entrar</h1>
        <p className="text-[var(--content-muted)]">
          Acesse sua conta para gerenciar espaços, reservas e mensagens.
        </p>
      </header>

      <SignInForm next={safeNext} />

      <p className="text-[0.875rem] text-[var(--content-muted)]">
        Ainda não tem conta?{' '}
        <Link
          href="/criar-conta"
          className="text-[var(--accent)] font-medium underline underline-offset-4"
        >
          Criar conta
        </Link>
      </p>
    </div>
  );
}
