import { SiteHeader } from '@/components/layout/site-header';

/**
 * Moldura das etapas do anúncio.
 *
 * Sem rodapé: o formulário já tem a navegação fixa embaixo, e um rodapé
 * completo competiria com ela pelo toque do polegar.
 */
export default function AnunciarEtapaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="conteudo">{children}</main>
    </>
  );
}
