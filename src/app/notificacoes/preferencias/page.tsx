import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { getNotificationPreferences } from '@/lib/notifications/queries';
import { isIntegrationConfigured } from '@/lib/env';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { PreferencesForm } from '@/components/notifications/preferences-form';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = { title: 'Preferências de notificações', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * Preferências de notificações (Fase 21).
 *
 * Não existe aqui "Promoções da plataforma": a MyPlace não manda
 * marketing por notificação hoje, e um interruptor para algo que não
 * existe seria enfeite.
 */
export default async function PreferenciasNotificacaoPage() {
  const user = await requireUser('/notificacoes/preferencias');
  const prefs = await getNotificationPreferences(user.id);
  const pushConfigurado = isIntegrationConfigured('push');

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-2xl px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <header className="space-y-2">
          <Link
            href="/notificacoes"
            className="inline-flex items-center gap-1.5 text-[0.875rem] text-[var(--content-muted)] hover:text-[var(--content)]"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Notificações
          </Link>
          <h1 className="text-[1.75rem] font-semibold">Preferências de notificações</h1>
          <p className="text-[var(--content-muted)] leading-relaxed">
            Escolha o que aparece na central (o sino) e o que chega no seu celular.
          </p>
        </header>

        {!pushConfigurado ? (
          <Alert tone="info" title="Aviso no celular ainda indisponível">
            As notificações no celular ainda não estão ativas na MyPlace. Suas escolhas de
            &ldquo;No celular&rdquo; ficam guardadas e passam a valer quando estiverem.
          </Alert>
        ) : (
          <p className="text-[0.8125rem] text-[var(--content-subtle)] leading-relaxed">
            &ldquo;No celular&rdquo; só chega nos aparelhos em que você ativou as notificações em{' '}
            <Link href="/minha-conta" className="underline underline-offset-2">
              Minha conta
            </Link>
            .
          </p>
        )}

        <PreferencesForm initial={prefs} />
      </main>

      <SiteFooter />
    </>
  );
}
