import { ProspectHeader } from '@/components/prospecting/prospect-header';

/**
 * Autenticacao nao e checada aqui de proposito: cada pagina chama
 * `requireUser(caminhoAtual)` com o proprio caminho, para que "Entre para
 * continuar" volte exatamente para onde a pessoa tentou ir — nao sempre
 * para `/prospectar`. Mesma convencao do resto do app (ver src/app/favoritos).
 */
export default async function ProspectLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ProspectHeader />
      <main id="conteudo" className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-10">
        {children}
      </main>
    </>
  );
}
