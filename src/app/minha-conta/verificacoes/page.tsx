import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, BadgeCheck, MailCheck, Smartphone } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { getVerificationOverview } from '@/lib/verification/queries';
import { maskPhone } from '@/lib/verification/phone';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { PhoneVerificationPanel } from '@/components/verification/phone-verification-panel';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'Verificações', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

function dataLonga(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' }).format(d);
}

/**
 * Verificações da conta (Fase 21).
 *
 * Cada item mostra o estado REAL, lido do banco: e-mail vem do Supabase
 * Auth (link de confirmação), telefone vem do provedor de SMS (código
 * aprovado), identidade ainda não existe como processo — e diz isso em vez
 * de mostrar um selo que ninguém conferiu.
 */
export default async function VerificacoesPage() {
  const user = await requireUser('/minha-conta/verificacoes');
  const v = await getVerificationOverview(user.id);

  const telefoneVerificado = Boolean(v.phone.verifiedAt && v.phone.number);

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-2xl px-4 sm:px-6 py-8 sm:py-10 space-y-8">
        <header className="space-y-2">
          <Link
            href="/minha-conta"
            className="inline-flex items-center gap-1.5 text-[0.875rem] text-[var(--content-muted)] hover:text-[var(--content)]"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Minha conta
          </Link>
          <h1 className="text-[1.75rem] font-semibold">Verificações</h1>
          <p className="text-[var(--content-muted)] leading-relaxed">
            Cada verificação concluída vira um selo no seu{' '}
            <Link href={`/perfil/${user.id}`} className="text-[var(--accent)] underline underline-offset-2">
              perfil público
            </Link>
            . O dado verificado (e-mail, telefone) nunca aparece para outras pessoas — só o selo.
          </p>
        </header>

        {/* E-mail */}
        <section aria-labelledby="v-email" className="rounded-[var(--radius-card)] border p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="v-email" className="font-semibold flex items-center gap-2">
              <MailCheck className="size-4 text-[var(--content-subtle)]" aria-hidden />
              E-mail
            </h2>
            {v.email.verifiedAt ? (
              <Badge tone="positive" dot>
                Verificado
              </Badge>
            ) : (
              <Badge tone="caution" dot>
                Pendente
              </Badge>
            )}
          </div>
          {v.email.verifiedAt ? (
            <p className="text-[0.9375rem] text-[var(--content-muted)]">
              <span className="break-all">{user.email}</span> · confirmado em {dataLonga(v.email.verifiedAt)}.
            </p>
          ) : (
            <p className="text-[0.9375rem] text-[var(--content-muted)] leading-relaxed">
              Seu e-mail ainda não aparece como confirmado. Abra o link de confirmação que enviamos
              para <span className="break-all">{user.email}</span> quando você criou a conta.
            </p>
          )}
        </section>

        {/* Telefone */}
        <section aria-labelledby="v-telefone" className="rounded-[var(--radius-card)] border p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="v-telefone" className="font-semibold flex items-center gap-2">
              <Smartphone className="size-4 text-[var(--content-subtle)]" aria-hidden />
              Telefone
            </h2>
            {telefoneVerificado ? (
              <Badge tone="positive" dot>
                Verificado
              </Badge>
            ) : v.phone.pending ? (
              <Badge tone="caution" dot>
                Código enviado
              </Badge>
            ) : v.phone.available ? (
              <Badge tone="neutral">Não verificado</Badge>
            ) : (
              <Badge tone="neutral">Indisponível</Badge>
            )}
          </div>
          <PhoneVerificationPanel
            available={v.phone.available}
            verifiedMasked={telefoneVerificado ? maskPhone(v.phone.number) : null}
            verifiedAtLabel={v.phone.verifiedAt ? dataLonga(v.phone.verifiedAt) : null}
            pending={
              v.phone.pending
                ? { masked: maskPhone(v.phone.pending.phone), attemptsLeft: v.phone.pending.attemptsLeft }
                : null
            }
            isAdmin={user.role === 'admin'}
          />
        </section>

        {/* Identidade — só estrutura nesta fase */}
        <section aria-labelledby="v-identidade" className="rounded-[var(--radius-card)] border p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="v-identidade" className="font-semibold flex items-center gap-2">
              <BadgeCheck className="size-4 text-[var(--content-subtle)]" aria-hidden />
              Identidade
            </h2>
            <Badge tone="neutral">Ainda não disponível</Badge>
          </div>
          <p className="text-[0.9375rem] text-[var(--content-muted)] leading-relaxed">
            A verificação de identidade (documento oficial conferido por um parceiro
            especializado) ainda não existe na MyPlace. Por isso nenhum perfil mostra o selo
            &ldquo;Identidade verificada&rdquo; — nem o seu, nem o de ninguém.
          </p>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
