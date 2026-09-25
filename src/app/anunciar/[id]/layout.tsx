import { SiteHeader } from '@/components/layout/site-header';

/**
 * Moldura das etapas do anúncio.
 *
 * Sem rodapé: o formulário já tem a navegação fixa embaixo, e um rodapé
 * completo competiria com ela pelo toque do polegar. Mesmo motivo desliga a
 * navegação inferior global (`showMobileNav`): duas barras fixas empilhadas
 * no fim da tela sobrariam espaço de tela sobre o teclado virtual.
 */
export default function AnunciarEtapaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader showMobileNav={false} />
      <main id="conteudo">{children}</main>
    </>
  );
}
