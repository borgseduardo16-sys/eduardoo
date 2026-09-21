import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Clock } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { listRecentSearches } from '@/lib/prospecting/queries';
import { isIntegrationConfigured } from '@/lib/env';
import { SearchForm } from '@/components/prospecting/search-form';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = { title: 'Encontre empresas sem site' };
export const dynamic = 'force-dynamic';

export default async function ProspectarPage() {
  const user = await requireUser('/prospectar');
  const buscas = await listRecentSearches(user.id, 6);
  const integracaoPronta = isIntegrationConfigured('places');

  return (
    <div className="space-y-10">
      <header className="max-w-2xl space-y-3">
        <h1 className="text-[1.875rem] sm:text-[2.25rem] font-semibold leading-tight">
          Encontre empresas sem site
        </h1>
        <p className="text-[1.0625rem] text-[var(--content-muted)] leading-relaxed">
          Encontre empresas com presença no Google, mas sem site ou presença digital própria.
        </p>
      </header>

      {!integracaoPronta && (
        <Alert tone="warning" title="Busca ainda não configurada">
          A chave da Google Places API (<code>GOOGLE_PLACES_API_KEY</code>) ainda não foi
          definida. A busca vai falhar com uma mensagem explicando isso até a chave ser
          configurada — veja <code>docs/SETUP.md</code>. Nenhum resultado de exemplo é mostrado
          aqui.
        </Alert>
      )}

      <div className="rounded-[var(--radius-card)] border bg-[var(--surface-raised)] p-5 sm:p-8 shadow-[var(--shadow-subtle)]">
        <SearchForm />
      </div>

      {buscas.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Buscas recentes</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {buscas.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/prospectar/${b.id}`}
                  className="group block h-full rounded-[var(--radius-card)] border p-4 hover:border-[var(--border-strong)] hover:bg-[var(--surface-sunken)] transition-colors"
                >
                  <p className="font-medium truncate">{b.niche}</p>
                  <p className="text-[0.8125rem] text-[var(--content-muted)] truncate">
                    {b.locationLabel}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-[0.8125rem]">
                    <span className="flex items-center gap-1 text-[var(--content-subtle)]">
                      <Clock className="size-3.5" aria-hidden />
                      {new Date(b.createdAt).toLocaleDateString('pt-BR')}
                    </span>
                    <span className="flex items-center gap-1 text-[var(--accent)] font-medium">
                      {b.status === 'completed'
                        ? `${b.leadsFound} leads`
                        : b.status === 'failed'
                          ? 'Falhou'
                          : 'Em andamento'}
                      <ArrowRight className="size-3.5 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
