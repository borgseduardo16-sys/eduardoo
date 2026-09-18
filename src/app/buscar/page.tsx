import { redirect } from 'next/navigation';

/**
 * A busca antiga virou a busca de verdade em /espacos (Parte 3).
 *
 * Mantemos a rota redirecionando porque links de /buscar podem ter sido
 * compartilhados, e um 404 seria pior do que levar a pessoa à listagem.
 * `onde` passa direto — /espacos agora sabe resolver cidade, bairro, CEP e
 * endereço sozinho, então não há mais por que traduzir para `cidade` aqui.
 */
export default async function BuscarPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; onde?: string; lat?: string; lng?: string; raio?: string }>;
}) {
  const { tipo, onde, lat, lng, raio } = await searchParams;

  const params = new URLSearchParams();
  if (tipo) params.set('tipo', tipo);
  if (onde) params.set('onde', onde);
  if (lat) params.set('lat', lat);
  if (lng) params.set('lng', lng);
  if (raio) params.set('raio', raio);

  redirect(params.size > 0 ? `/espacos?${params}` : '/espacos');
}
