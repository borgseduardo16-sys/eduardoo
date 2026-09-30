import type { Metadata } from 'next';
import Link from 'next/link';
import { BellOff, Pencil, Search } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { alertPlanFor, listUserSavedSearches } from '@/lib/alerts/queries';
import { alertSearchHref } from '@/lib/alerts/criteria';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { AlertRowActions } from '@/components/alerts/alert-row-actions';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'Meus alertas' };
export const dynamic = 'force-dynamic';

const DATA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
const DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
});

/**
 * Meus alertas (Fase 23): buscas salvas que avisam quando um espaço NOVO
 * publicado atende a todos os critérios. Só números reais: quantos anúncios
 * bateram desde a criação e quando foi o último aviso.
 */
export default async function AlertasPage() {
  const user = await requireUser('/alertas');
  const [plano, alertas] = await Promise.all([alertPlanFor(user.id), listUserSavedSearches(user.id)]);

  const frequencia = plano.cooldownHours <= 1
    ? 'Aviso assim que um espaço novo aparece, no máximo 1 por hora por alerta — o que chegar nesse intervalo vem junto no aviso seguinte.'
    : `No máximo 1 aviso a cada ${plano.cooldownHours} horas por alerta, reunindo tudo o que apareceu nesse intervalo.`;

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-3xl px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <header className="space-y-1">
          <h1 className="text-[1.75rem] sm:text-[2rem] font-semibold">Meus alertas</h1>
          <p className="text-[var(--content-muted)]">
            Você é avisado quando um espaço novo publicado atende a uma busca sua.
          </p>
        </header>

        <section className="rounded-[var(--radius-card)] border p-4 space-y-1.5 text-[0.875rem]" data-testid="plano-alertas">
          <p>
            <span className="font-medium tabular-nums">
              {plano.active} de {plano.limit}
            </span>{' '}
            {plano.limit === 1 ? 'alerta ativo' : 'alertas ativos'}
            {plano.premium ? ' · Premium' : ''}
          </p>
          <p className="text-[var(--content-muted)]">{frequencia}</p>
          {!plano.premium && (
            <p className="text-[var(--content-muted)]">
              No <Link href="/premium" className="text-[var(--accent)] underline underline-offset-4">Premium</Link>, até
              20 alertas ativos e aviso a cada hora.
            </p>
          )}
          <p className="text-[var(--content-subtle)] text-[0.8125rem]">
            Os avisos chegam na central de notificações (e no celular, se o push estiver ligado).{' '}
            <Link href="/notificacoes/preferencias" className="underline underline-offset-4">
              Preferências
            </Link>
          </p>
        </section>

        {alertas.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed p-10 sm:p-14 text-center space-y-3">
            <BellOff className="size-6 mx-auto text-[var(--content-subtle)]" aria-hidden />
            <p className="font-medium">Nenhum alerta ainda</p>
            <p className="text-[0.9375rem] text-[var(--content-muted)] max-w-sm mx-auto leading-relaxed">
              Faça uma busca — por exemplo, “garagem coberta no centro até R$ 300” — e toque em “Criar alerta desta
              busca”.
            </p>
            <Link
              href="/espacos"
              className="inline-flex items-center gap-1.5 text-[0.875rem] text-[var(--accent)] underline underline-offset-4"
            >
              <Search className="size-3.5" aria-hidden />
              Buscar espaços
            </Link>
          </div>
        ) : (
          <ul className="rounded-[var(--radius-card)] border divide-y" data-testid="lista-alertas">
            {alertas.map((a) => (
              <li key={a.id} className="p-4 space-y-2.5" data-alert-id={a.id}>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium break-words min-w-0">{a.label}</p>
                  <Badge tone={a.status === 'active' ? 'positive' : 'neutral'} dot>
                    {a.status === 'active' ? 'Ativo' : 'Pausado'}
                  </Badge>
                </div>
                <p className="text-[0.8125rem] text-[var(--content-muted)]">
                  Criado em {DATA.format(a.createdAt)}
                  {' · '}
                  {a.matchesTotal === 0
                    ? 'nenhum espaço novo desde então'
                    : `${a.matchesTotal} ${a.matchesTotal === 1 ? 'espaço novo' : 'espaços novos'} desde então`}
                  {a.lastNotifiedAt ? ` · último aviso em ${DATA_HORA.format(a.lastNotifiedAt)}` : ''}
                  {a.matchesPending > 0 && a.status === 'active' ? ` · ${a.matchesPending} aguardando o próximo aviso` : ''}
                </p>
                {a.criteria ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    <Link href={alertSearchHref(a.criteria)} className="inline-flex items-center gap-1.5 text-[0.875rem] text-[var(--accent)]">
                      <Search className="size-3.5" aria-hidden />
                      Ver espaços
                    </Link>
                    <Link
                      href={alertSearchHref(a.criteria, { alerta: a.id })}
                      className="inline-flex items-center gap-1.5 text-[0.875rem] text-[var(--content-muted)] hover:text-[var(--content)]"
                    >
                      <Pencil className="size-3.5" aria-hidden />
                      Editar
                    </Link>
                  </div>
                ) : (
                  <p className="text-[0.8125rem] text-[var(--color-caution)]">
                    Este alerta usa critérios que não existem mais. Exclua e crie de novo a partir de uma busca.
                  </p>
                )}
                <AlertRowActions alertId={a.id} status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
