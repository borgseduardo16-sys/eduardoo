import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, CircleCheck, ShieldCheck, Sparkle } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { isPremium } from '@/lib/promotions/queries';
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
  const premium = await isPremium(user.id);

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
          <h2 className="font-semibold">Atalhos</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <Link
              href="/minha-conta/seguranca"
              className="flex items-center justify-between gap-4 rounded-[var(--radius-card)] border p-4 hover:bg-[var(--surface-sunken)] transition-colors"
            >
              <span className="flex gap-3 items-start min-w-0">
                <ShieldCheck className="size-4 mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-medium text-[0.9375rem]">Centro de segurança</span>
                  <span className="block text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
                    Gerencie bloqueios e veja como denunciar um problema.
                  </span>
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-[var(--content-subtle)]" aria-hidden />
            </Link>

            <Link
              href="/premium"
              className="flex items-center justify-between gap-4 rounded-[var(--radius-card)] border p-4 hover:bg-[var(--surface-sunken)] transition-colors"
            >
              <span className="flex gap-3 items-start min-w-0">
                <Sparkle className="size-4 mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden fill="currentColor" />
                <span className="min-w-0">
                  <span className="block font-medium text-[0.9375rem]">
                    {premium ? 'Você é Membro Premium' : 'Conheça o Premium'}
                  </span>
                  <span className="block text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
                    {premium
                      ? 'Veja seus Destaques e Turbo disponíveis este mês.'
                      : 'Destaques e Turbo gratuitos todo mês para seus anúncios.'}
                  </span>
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-[var(--content-subtle)]" aria-hidden />
            </Link>
          </div>
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
