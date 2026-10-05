import { lazy, Suspense, type ComponentType } from 'react';

declare global {
  interface Window {
    /** Definido pelo HTML final: carrega a cena 3D embutida (Blob) só quando ela é montada. */
    __carregarCena?: () => Promise<{ default: ComponentType<Record<string, unknown>> }>;
  }
}

/**
 * Substitui `next/dynamic` no HTML único. Ignora o loader recebido (o import
 * estático foi trocado por um stub no build) e carrega a cena do <script
 * type="text/plain"> embutido — assim o Three.js só é interpretado quando o
 * hero decide ligar o 3D (tela ≥ 768 px, sem "reduzir movimento").
 */
export default function dynamic<P extends object>(...ignorados: unknown[]): ComponentType<P> {
  void ignorados;
  const Carregada = lazy(() => window.__carregarCena!());
  function Dinamico(props: P) {
    return (
      <Suspense fallback={null}>
        <Carregada {...(props as Record<string, unknown>)} />
      </Suspense>
    );
  }
  return Dinamico;
}
