import type { Metadata } from 'next';
import {
  Building2,
  CircleCheck,
  Globe,
  UtensilsCrossed,
  ShoppingBag,
  CalendarClock,
  Bookmark,
  PhoneCall,
  Trophy,
} from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { getDashboardStats } from '@/lib/prospecting/queries';

export const metadata: Metadata = { title: 'Painel' };
export const dynamic = 'force-dynamic';

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-subtle)] space-y-3">
      <div className="size-9 rounded-[var(--radius-field)] bg-[var(--accent-subtle)] text-[var(--accent)] grid place-items-center">
        <Icon className="size-[1.125rem]" />
      </div>
      <p className="text-[1.75rem] font-semibold tabular-nums leading-none">{value.toLocaleString('pt-BR')}</p>
      <p className="text-[0.8125rem] text-[var(--content-muted)]">{label}</p>
    </div>
  );
}

export default async function PainelPage() {
  const user = await requireUser('/prospectar/painel');
  const stats = await getDashboardStats(user.id);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-[1.75rem] font-semibold">Painel</h1>
        <p className="text-[var(--content-muted)]">
          Como suas buscas de prospecção estão funcionando, de ponta a ponta.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-[0.8125rem] font-semibold uppercase tracking-wide text-[var(--content-subtle)]">
          Busca e análise
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard icon={Building2} label="Empresas analisadas" value={stats.companiesAnalyzed} />
          <StatCard icon={CircleCheck} label="Leads encontrados" value={stats.leadsFound} />
          <StatCard icon={Globe} label="Descartadas por possuir site" value={stats.discardedSite} />
          <StatCard icon={UtensilsCrossed} label="Descartadas por cardápio digital" value={stats.discardedMenu} />
          <StatCard icon={ShoppingBag} label="Descartadas por catálogo" value={stats.discardedCatalog} />
          <StatCard icon={CalendarClock} label="Descartadas por agendamento" value={stats.discardedScheduling} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[0.8125rem] font-semibold uppercase tracking-wide text-[var(--content-subtle)]">
          Relacionamento
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard icon={Bookmark} label="Leads salvos" value={stats.savedLeads} />
          <StatCard icon={PhoneCall} label="Empresas contatadas" value={stats.contactedLeads} />
          <StatCard icon={Trophy} label="Clientes conquistados" value={stats.clientsWon} />
        </div>
      </section>
    </div>
  );
}
