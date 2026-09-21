import type { Metadata } from 'next';
import Link from 'next/link';
import { Download, Users } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { listSavedLeads } from '@/lib/prospecting/queries';
import { Badge } from '@/components/ui/badge';
import { LeadStatusSelect } from '@/components/prospecting/lead-status-select';

export const metadata: Metadata = { title: 'Meus Leads' };
export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, 'neutral' | 'accent' | 'positive' | 'caution' | 'critical'> = {
  novo: 'accent',
  contato_realizado: 'caution',
  em_negociacao: 'caution',
  cliente: 'positive',
  sem_interesse: 'neutral',
};

const STATUS_LABEL: Record<string, string> = {
  novo: 'Novo',
  contato_realizado: 'Contato realizado',
  em_negociacao: 'Em negociação',
  cliente: 'Cliente',
  sem_interesse: 'Sem interesse',
};

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const user = await requireUser('/leads');
  const leads = await listSavedLeads(user.id, status ? { statuses: [status] } : {});

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-[1.75rem] font-semibold">Meus Leads</h1>
          <p className="text-[var(--content-muted)]">
            {leads.length} {leads.length === 1 ? 'lead salvo' : 'leads salvos'}.
          </p>
        </div>
        {leads.length > 0 && (
          <div className="flex items-center gap-2">
            <a
              href={`/api/leads/export?scope=saved&format=csv${status ? `&status=${status}` : ''}`}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-[0.8125rem] font-medium rounded-[var(--radius-field)] border border-[var(--border-strong)] hover:bg-[var(--surface-sunken)]"
            >
              <Download className="size-3.5" aria-hidden /> CSV
            </a>
            <a
              href={`/api/leads/export?scope=saved&format=xlsx${status ? `&status=${status}` : ''}`}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-[0.8125rem] font-medium rounded-[var(--radius-field)] border border-[var(--border-strong)] hover:bg-[var(--surface-sunken)]"
            >
              <Download className="size-3.5" aria-hidden /> Excel
            </a>
          </div>
        )}
      </header>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/leads"
          className={`h-8 px-3 inline-flex items-center rounded-[var(--radius-pill)] text-[0.8125rem] font-medium border ${!status ? 'bg-[var(--accent)] text-[var(--accent-content)] border-[var(--accent)]' : 'border-[var(--border-strong)] hover:bg-[var(--surface-sunken)]'}`}
        >
          Todos
        </Link>
        {Object.entries(STATUS_LABEL).map(([value, label]) => (
          <Link
            key={value}
            href={`/leads?status=${value}`}
            className={`h-8 px-3 inline-flex items-center rounded-[var(--radius-pill)] text-[0.8125rem] font-medium border ${status === value ? 'bg-[var(--accent)] text-[var(--accent-content)] border-[var(--accent)]' : 'border-[var(--border-strong)] hover:bg-[var(--surface-sunken)]'}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {leads.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed p-12 sm:p-16 text-center space-y-3">
          <Users className="size-6 mx-auto text-[var(--content-subtle)]" aria-hidden />
          <p className="font-medium">Nenhum lead salvo ainda</p>
          <p className="text-[0.9375rem] text-[var(--content-muted)] max-w-sm mx-auto leading-relaxed">
            Salve empresas encontradas na busca para organizar aqui o contato com cada uma.
          </p>
          <Link href="/prospectar" className="inline-block mt-2 text-[0.875rem] text-[var(--accent)] underline underline-offset-4">
            Buscar empresas
          </Link>
        </div>
      ) : (
        <div className="rounded-[var(--radius-card)] border overflow-hidden">
          <table className="w-full text-[0.875rem]">
            <thead className="bg-[var(--surface-sunken)] text-left text-[0.75rem] uppercase tracking-wide text-[var(--content-subtle)]">
              <tr>
                <th className="px-4 py-3 font-medium">Empresa</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Cidade</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Nota</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-[var(--surface-sunken)]">
                  <td className="px-4 py-3">
                    <Link href={`/leads/${lead.id}`} className="font-medium hover:text-[var(--accent)]">
                      {lead.name}
                    </Link>
                    <p className="text-[0.75rem] text-[var(--content-muted)]">{lead.category ?? 'Não encontrado'}</p>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-[var(--content-muted)]">
                    {[lead.city, lead.state].filter(Boolean).join(' - ') || 'Não encontrado'}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-[var(--content-muted)]">
                    {lead.rating ? Number(lead.rating).toFixed(1) : 'Não encontrado'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge tone={STATUS_TONE[lead.savedStatus ?? 'novo']}>
                        {STATUS_LABEL[lead.savedStatus ?? 'novo']}
                      </Badge>
                      <LeadStatusSelect leadId={lead.id} status={lead.savedStatus ?? 'novo'} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
