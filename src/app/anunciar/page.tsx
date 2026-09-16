import type { Metadata } from 'next';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { PhaseNotice } from '@/components/layout/phase-notice';

export const metadata: Metadata = { title: 'Anunciar meu espaço' };

export default function AnunciarPage() {
  return (
    <>
      <SiteHeader />
      <main id="conteudo">
        <PhaseNotice
          fase="Fase 2 — não implementado"
          titulo="A publicação de anúncios ainda não está pronta"
          descricao="As tabelas de anúncio, fotos e características já existem no banco, com as regras de integridade testadas. Falta construir o formulário de 9 etapas e o upload de imagens."
          faltando={[
            'Formulário em etapas com rascunho salvo',
            'Busca de endereço por CEP e marcação no mapa',
            'Upload real de fotos (depende do bucket de armazenamento)',
            'Revisão e publicação',
          ]}
        />
      </main>
      <SiteFooter />
    </>
  );
}
