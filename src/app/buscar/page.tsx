import type { Metadata } from 'next';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { PhaseNotice } from '@/components/layout/phase-notice';

export const metadata: Metadata = { title: 'Buscar espaços' };

/**
 * A busca recebe parâmetros reais da home (tipo, lat/lng/raio ou texto livre),
 * mas ainda não consulta o banco. Preferimos declarar isso a exibir resultados
 * inventados.
 */
export default function BuscarPage() {
  return (
    <>
      <SiteHeader />
      <main id="conteudo">
        <PhaseNotice
          fase="Fase 3 — não implementado"
          titulo="A busca ainda não está pronta"
          descricao="O formulário já monta os parâmetros corretos e a base já tem índices geoespaciais funcionando. Falta construir a consulta, os filtros e o mapa."
          faltando={[
            'Consulta por raio no banco (a estrutura PostGIS já existe e foi testada)',
            'Filtros de preço, tipo, tamanho e características',
            'Alternância entre lista e mapa',
            'Geocodificação de endereço digitado (depende de chave de API)',
          ]}
        />
      </main>
      <SiteFooter />
    </>
  );
}
