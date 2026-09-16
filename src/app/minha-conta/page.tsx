import type { Metadata } from 'next';
import Link from 'next/link';
import { CircleCheck } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = { title: 'Minha conta' };

const PAPEL_LABEL = {
  user: 'Locatário',
  owner: 'Proprietário',
  admin: 'Administrador',
} as const;

/**
 * Painel da conta. Os dados vêm do banco, do usuário autenticado — nada aqui
 * é exemplo. As seções ainda não construídas aparecem marcadas como tal.
 */
export default async function MinhaContaPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; senha?: string }>;
}) {
  const user = await requireUser('/minha-conta');
  const params = await searchParams;

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-4xl px-4 sm:px-6 py-10 space-y-8">
        {params.email === 'confirmado' && (
          <Alert tone="success" title="E-mail confirmado">
            Sua conta está ativa.
          </Alert>
        )}
        {params.senha === 'alterada' && (
          <Alert tone="success" title="Senha alterada">
            Sua nova senha já está valendo.
          </Alert>
        )}

        <header className="space-y-1.5">
          <h1 className="text-[1.75rem] font-semibold">
            Olá, {user.fullName?.split(' ')[0] ?? 'tudo bem'}
          </h1>
          <p className="text-[var(--content-muted)]">
            {user.email} · {PAPEL_LABEL[user.role]}
          </p>
        </header>

        <section className="rounded-[var(--radius-card)] border p-5 sm:p-6 space-y-4">
          <h2 className="font-semibold">Sua conta</h2>
          <dl className="grid gap-4 sm:grid-cols-2 text-[0.9375rem]">
            <div>
              <dt className="text-[var(--content-subtle)] text-[0.8125rem]">Nome</dt>
              <dd>{user.fullName ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-[var(--content-subtle)] text-[0.8125rem]">E-mail</dt>
              <dd className="break-all">{user.email}</dd>
            </div>
            <div>
              <dt className="text-[var(--content-subtle)] text-[0.8125rem]">Situação</dt>
              <dd className="inline-flex items-center gap-1.5">
                <CircleCheck className="size-4 text-[var(--color-positive)]" aria-hidden />
                Ativa
              </dd>
            </div>
            <div>
              <dt className="text-[var(--content-subtle)] text-[0.8125rem]">Termos aceitos em</dt>
              <dd>
                {user.acceptedTermsAt
                  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(
                      user.acceptedTermsAt,
                    )
                  : '—'}
              </dd>
            </div>
          </dl>
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">Ainda em construção</h2>
          <p className="text-[0.9375rem] text-[var(--content-muted)] leading-relaxed">
            Estas seções fazem parte das próximas fases e ainda não existem. Elas aparecem aqui
            para você acompanhar o que falta, não como funcionalidade disponível.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 text-[0.875rem]">
            {[
              ['Espaços alugados', 'Fase 5'],
              ['Pagamentos e próximos vencimentos', 'Fase 7'],
              ['Favoritos', 'Fase 4'],
              ['Mensagens', 'Fase 6'],
            ].map(([label, fase]) => (
              <li
                key={label}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-field)] border px-4 py-3 text-[var(--content-muted)]"
              >
                {label}
                <span className="text-2xs uppercase tracking-wide text-[var(--content-subtle)]">
                  {fase}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <Link
          href="/"
          className="inline-block text-[0.875rem] text-[var(--accent)] underline underline-offset-4"
        >
          Voltar para a página inicial
        </Link>
      </main>

      <SiteFooter />
    </>
  );
}
