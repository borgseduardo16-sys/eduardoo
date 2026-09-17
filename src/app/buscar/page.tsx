import { redirect } from 'next/navigation';

/**
 * A busca antiga virou o marketplace em /espacos.
 *
 * Mantemos a rota redirecionando porque links de /buscar podem ter sido
 * compartilhados, e um 404 seria pior do que levar a pessoa à listagem.
 * Os parâmetros que já funcionam (tipo, cidade) seguem junto; o filtro por
 * distância ainda não existe e é ignorado — ver docs/STATUS.md.
 */
export default async function BuscarPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; onde?: string }>;
}) {
  const { tipo, onde } = await searchParams;

  const params = new URLSearchParams();
  if (tipo) params.set('tipo', tipo);
  if (onde) params.set('cidade', onde);

  redirect(params.size > 0 ? `/espacos?${params}` : '/espacos');
}
