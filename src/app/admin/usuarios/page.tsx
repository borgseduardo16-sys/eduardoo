import type { Metadata } from 'next';
import { Search, Users } from 'lucide-react';
import { requireAdmin } from '@/lib/auth/dal';
import { searchAccounts, getModerationQueueCount } from '@/lib/admin/queries';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { AdminSubnav } from '@/components/layout/admin-subnav';
import { AccountStatusForm } from '@/components/admin/account-status-form';
import { PremiumMembershipForm } from '@/components/admin/premium-membership-form';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { BadgeProps } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'Usuários — admin' };
export const dynamic = 'force-dynamic';

const STATUS_INFO: Record<string, { label: string; tone: NonNullable<BadgeProps['tone']> }> = {
  active: { label: 'Ativa', tone: 'positive' },
  suspended: { label: 'Suspensa', tone: 'caution' },
  banned: { label: 'Banida', tone: 'critical' },
  deleted: { label: 'Excluída', tone: 'neutral' },
};

export default async function AdminUsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();
  const { q = '' } = await searchParams;
  const [contas, filaCount] = await Promise.all([searchAccounts(q), getModerationQueueCount()]);

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-3xl px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <AdminSubnav active="usuarios" queueCount={filaCount} />

        <header className="space-y-1">
          <h1 className="text-[1.75rem] font-semibold">Usuários</h1>
          <p className="text-[var(--content-muted)]">Busque por nome para ver ou alterar o status de uma conta.</p>
        </header>

        <form className="flex gap-2">
          <Input name="q" defaultValue={q} placeholder="Nome do usuário" className="flex-1" />
          <Button type="submit" size="md">
            <Search className="size-4" aria-hidden />
            Buscar
          </Button>
        </form>

        {q && contas.length === 0 && (
          <div className="rounded-[var(--radius-card)] border border-dashed p-12 text-center space-y-3">
            <Users className="size-6 mx-auto text-[var(--content-subtle)]" aria-hidden />
            <p className="font-medium">Nenhum resultado</p>
            <p className="text-[0.9375rem] text-[var(--content-muted)]">Nenhuma conta com esse nome.</p>
          </div>
        )}

        {contas.length > 0 && (
          <ul className="space-y-3">
            {contas.map((c) => (
              <li key={c.id} className="rounded-[var(--radius-card)] border p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium truncate">{c.fullName ?? '(sem nome)'}</p>
                    <p className="text-[0.8125rem] text-[var(--content-muted)]">
                      {c.role === 'admin' ? 'Administrador' : c.role === 'owner' ? 'Proprietário' : 'Usuário'} ·{' '}
                      {c.completedBookingsCount} locações concluídas
                      {c.upheldReportCount > 0 && ` · ${c.upheldReportCount} denúncia(s) procedente(s)`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge tone={(STATUS_INFO[c.status] ?? STATUS_INFO.active).tone}>
                      {(STATUS_INFO[c.status] ?? STATUS_INFO.active).label}
                    </Badge>
                    {c.isPremium && <Badge tone="accent">✦ Premium</Badge>}
                  </div>
                </div>

                {c.statusReason && c.status !== 'active' && (
                  <p className="text-[0.8125rem] text-[var(--content-subtle)]">Motivo atual: {c.statusReason}</p>
                )}

                <AccountStatusForm userId={c.id} currentStatus={c.status} currentReason={c.statusReason} />
                <PremiumMembershipForm userId={c.id} isPremium={c.isPremium} />
              </li>
            ))}
          </ul>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
