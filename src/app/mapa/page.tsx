import type { Metadata } from 'next';
import { SiteHeader } from '@/components/layout/site-header';
import { ExploreMap } from '@/components/map/explore-map';
import type { ExploreFilters } from '@/components/map/explore-filters';
import { DEFAULT_CENTER } from '@/lib/maps/config';
import { DEFAULT_RADIUS_M, RADIUS_OPTIONS_M } from '@/lib/maps/explore-params';
import { centroidOfPlace } from '@/lib/maps/explore';
import { parseCategoriesParam } from '@/lib/spaces/categories';
import { resolveLocation } from '@/lib/spaces/resolve-location';

export const metadata: Metadata = {
  title: 'Mapa de espaços',
  description: 'Veja no mapa os espaços para alugar por mês perto de você: garagens, depósitos, lojas, escritórios, galpões e mais.',
};

/** O mapa pergunta ao servidor a cada movimento; a página em si só monta o ponto de partida. */
export const dynamic = 'force-dynamic';

type Params = Record<string, string | undefined>;

const REGIAO_PADRAO = 'Colatina, ES';

function numeroOuNulo(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Filtros que vêm do endereço da página (link compartilhado, recarregar). Entrada ruim = padrão, nunca erro. */
function filtrosDaUrl(sp: Params): ExploreFilters {
  let radius: number | null = DEFAULT_RADIUS_M;
  if (sp.raio === 'todos') radius = null;
  else {
    const r = numeroOuNulo(sp.raio);
    if (r != null && (RADIUS_OPTIONS_M as readonly number[]).includes(r)) radius = r;
  }
  const preco = numeroOuNulo(sp.preco);
  return {
    radius,
    priceMaxCents: preco != null && Number.isInteger(preco) && preco >= 1 && preco <= 100_000_000 ? preco : null,
    categories: parseCategoriesParam(sp.tipos),
    availableNow: sp.disp === '1',
  };
}

export default async function MapaPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const filtros = filtrosDaUrl(sp);

  let fallback: { lat: number; lng: number; label: string; kind: 'busca' | 'padrao' } = {
    ...DEFAULT_CENTER, label: REGIAO_PADRAO, kind: 'padrao',
  };
  let aviso: string | null = null;
  let escolheuLugar = false;

  const lat = numeroOuNulo(sp.lat);
  const lng = numeroOuNulo(sp.lng);
  const onde = sp.onde?.trim().slice(0, 80);

  if (lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
    fallback = { lat, lng, label: sp.local?.trim().slice(0, 80) || 'o lugar escolhido', kind: 'busca' };
    escolheuLugar = true;
  } else if (onde) {
    escolheuLugar = true;
    const r = await resolveLocation({ onde });
    if (r.cepNotFound) {
      aviso = `O CEP ${onde} não foi encontrado. Mostrando a região padrão.`;
    } else {
      const ponto = r.point ?? ((r.cityFilter || r.districtFilter) ? await centroidOfPlace({ city: r.cityFilter, district: r.districtFilter }) : null);
      if (ponto) fallback = { ...ponto, label: r.label ?? onde, kind: 'busca' };
      else aviso = `Não encontramos "${onde}". Mostrando a região padrão.`;
    }
  }

  return (
    <>
      <SiteHeader />
      <main id="conteudo" className="myplace-mapa-pagina">
        <h1 className="sr-only">Mapa de espaços</h1>
        <ExploreMap
          fallback={fallback}
          initialFilters={filtros}
          autoLocate={!escolheuLugar}
          notice={aviso}
        />
      </main>
    </>
  );
}
