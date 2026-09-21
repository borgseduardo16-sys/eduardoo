import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Download, SearchX } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { getSearchForUser, listLeadsForSearch } from '@/lib/prospecting/queries';
import { LeadCard } from '@/components/prospecting/lead-card';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = { title: 'Resultados da busca' };
export const dynamic = 'force-dynamic';

const SCOPE_LABEL: Record<string, string> = {
  city: 'cidade',
  state: 'estado',
  region: 'região',
  country: 'Brasil inteiro',
};

export default async function ResultadosPage({
  params,
}: {
  params: Promise<{ searchId: string }>;
}) {
  const { searchId } = await params;
  const user = await requireUser(`/prospectar/${searchId}`);
  const search = await getSearchForUser(user.id, searchId);
  if (!search) notFound();

  const leads = await listLeadsForSearch(user.id, searchId);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/prospectar" className="text-[0.875rem] text-[var(--content-muted)] hover:text-[var(--content)]">
          ← Nova busca
        </Link>
      </div>

      <header className="space-y-2">
        <h1 className="text-[1.5rem] sm:text-[1.75rem] font-semibold">
          {search.niche} · {search.locationLabel}
        </h1>
        <p className="text-[var(--content-muted)]">
          Busca por {SCOPE_LABEL[search.locationScope] ?? search.locationScope}, avaliações
          {search.minReviews > 0 ? ` a partir de ${search.minReviews}` : ' sem mínimo'}
          {search.minRating ? `, nota a partir de ${Number(search.minRating).toFixed(1)}` : ''}.
        </p>
      </header>

      {search.status === 'failed' && (
        <Alert tone="critical" title="A busca não pôde ser concluída">
          {search.errorMessage ?? 'Falha desconhecida.'}
        </Alert>
      )}

      {search.status === 'completed' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border bg-[var(--surface-sunken)] p-4">
            <p className="font-medium">
              {leads.length === 0
                ? 'Nenhuma empresa atendeu aos critérios.'
                : `Encontramos ${leads.length} ${leads.length === 1 ? 'empresa que atende' : 'empresas que atendem'} aos critérios.`}
              <span className="block text-[0.8125rem] font-normal text-[var(--content-muted)] mt-0.5">
                {search.companiesAnalyzed} empresas analisadas no total.
              </span>
            </p>
            {leads.length > 0 && (
              <div className="flex items-center gap-2">
                <a
                  href={`/api/leads/export?searchId=${search.id}&format=csv`}
                  className="inline-flex items-center gap-1.5 h-9 px-3 text-[0.8125rem] font-medium rounded-[var(--radius-field)] border border-[var(--border-strong)] hover:bg-[var(--surface)]"
                >
                  <Download className="size-3.5" aria-hidden /> CSV
                </a>
                <a
                  href={`/api/leads/export?searchId=${search.id}&format=xlsx`}
                  className="inline-flex items-center gap-1.5 h-9 px-3 text-[0.8125rem] font-medium rounded-[var(--radius-field)] border border-[var(--border-strong)] hover:bg-[var(--surface)]"
                >
                  <Download className="size-3.5" aria-hidden /> Excel
                </a>
              </div>
            )}
          </div>

          {leads.length === 0 ? (
            <div className="rounded-[var(--radius-card)] border border-dashed p-12 sm:p-16 text-center space-y-3">
              <SearchX className="size-6 mx-auto text-[var(--content-subtle)]" aria-hidden />
              <p className="font-medium">Nenhum lead válido desta vez</p>
              <p className="text-[0.9375rem] text-[var(--content-muted)] max-w-sm mx-auto leading-relaxed">
                Todas as empresas analisadas já tinham algum tipo de presença digital própria, ou
                não atenderam aos filtros de avaliação/nota. Tente ampliar a localização ou reduzir
                os mínimos.
              </p>
              <Link href="/prospectar" className="inline-block mt-2 text-[0.875rem] text-[var(--accent)] underline underline-offset-4">
                Ajustar filtros
              </Link>
            </div>
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {leads.map((lead) => (
                <li key={lead.id}>
                  <LeadCard lead={lead} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
