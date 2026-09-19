import type { Metadata } from 'next';
import { ShieldAlert } from 'lucide-react';
import { requireAdmin } from '@/lib/auth/dal';
import { listModerationQueue } from '@/lib/admin/queries';
import { REPORT_REASONS, type ReportReason } from '@/lib/safety/report-config';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { AdminSubnav } from '@/components/layout/admin-subnav';
import { ResolveReportForm } from '@/components/admin/resolve-report-form';
import { Badge } from '@/components/ui/badge';
import type { BadgeProps } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'Denúncias — admin' };
export const dynamic = 'force-dynamic';

const SEVERITY_INFO: Record<string, { label: string; tone: NonNullable<BadgeProps['tone']> }> = {
  critical: { label: 'Crítica', tone: 'critical' },
  high: { label: 'Alta', tone: 'critical' },
  normal: { label: 'Normal', tone: 'caution' },
  low: { label: 'Baixa', tone: 'neutral' },
};

const TARGET_LABEL: Record<string, string> = {
  space: 'Anúncio',
  user: 'Usuário',
  message: 'Mensagem',
};

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(value);
}

export default async function AdminDenunciasPage() {
  await requireAdmin();
  const fila = await listModerationQueue();

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <AdminSubnav active="denuncias" queueCount={fila.length} />

        <header className="space-y-1">
          <h1 className="text-[1.75rem] font-semibold">Fila de moderação</h1>
          <p className="text-[var(--content-muted)]">
            {fila.length === 0
              ? 'Nenhuma denúncia aguardando análise.'
              : `${fila.length} ${fila.length === 1 ? 'denúncia aguardando' : 'denúncias aguardando'} análise — mais graves primeiro.`}
          </p>
        </header>

        {fila.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed p-12 text-center space-y-3">
            <ShieldAlert className="size-6 mx-auto text-[var(--content-subtle)]" aria-hidden />
            <p className="font-medium">Fila vazia</p>
            <p className="text-[0.9375rem] text-[var(--content-muted)] max-w-sm mx-auto leading-relaxed">
              Denúncias abertas ou em análise aparecem aqui, ordenadas por gravidade.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {fila.map((d) => {
              const reasonInfo = REPORT_REASONS[d.reason as ReportReason] as { label: string } | undefined;
              const severity = SEVERITY_INFO[d.severity] ?? SEVERITY_INFO.normal;

              const alvoNome =
                d.targetType === 'space'
                  ? d.spaceTitle
                  : d.targetType === 'user'
                    ? d.targetUserName
                    : (d.messageSenderName ?? 'Mensagem');

              return (
                <li key={d.id} className="rounded-[var(--radius-card)] border p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge tone="neutral">{TARGET_LABEL[d.targetType] ?? d.targetType}</Badge>
                        <Badge tone={severity.tone}>{severity.label}</Badge>
                        {d.status === 'reviewing' && <Badge tone="accent">Em análise</Badge>}
                      </div>
                      <p className="font-medium truncate">{alvoNome ?? '(removido)'}</p>
                      <p className="text-[0.8125rem] text-[var(--content-muted)]">
                        {reasonInfo?.label ?? d.reason} · denunciado {formatDateTime(d.createdAt)}
                        {d.reporterName && ` · por ${d.reporterName}`}
                      </p>
                    </div>
                    {d.targetType === 'user' && Boolean(d.targetUserUpheldCount) && (
                      <p className="shrink-0 text-[0.75rem] text-[var(--color-critical)] font-medium text-right">
                        {d.targetUserUpheldCount} procedente(s) antes
                      </p>
                    )}
                  </div>

                  {d.details && (
                    <p className="text-[0.875rem] text-[var(--content-muted)] bg-[var(--surface-sunken)] rounded-[var(--radius-field)] p-3">
                      “{d.details}”
                    </p>
                  )}

                  {d.targetType === 'message' && d.messageBody && (
                    <p className="text-[0.8125rem] text-[var(--content)] bg-[var(--surface-sunken)] rounded-[var(--radius-field)] p-3">
                      <span className="text-[var(--content-subtle)]">Conteúdo denunciado: </span>
                      {d.messageBody}
                    </p>
                  )}

                  {d.targetType === 'space' && d.spaceSlug && (
                    <p className="text-[0.8125rem] text-[var(--content-subtle)]">
                      <a href={`/espacos/${d.spaceSlug}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                        Ver anúncio
                      </a>
                    </p>
                  )}

                  <ResolveReportForm reportId={d.id} />
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
