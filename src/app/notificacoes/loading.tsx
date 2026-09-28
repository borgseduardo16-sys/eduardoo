import { SiteHeader } from '@/components/layout/site-header';

/** Esqueleto da central enquanto as notificações chegam — nunca tela branca. */
export default function Loading() {
  return (
    <>
      <SiteHeader />
      <main id="conteudo" className="mx-auto max-w-2xl px-4 sm:px-6 py-8 sm:py-10 space-y-6" aria-busy="true">
        <span className="sr-only" role="status">
          Carregando notificações…
        </span>
        <div className="space-y-2">
          <div className="skeleton h-8 w-48 rounded-[var(--radius-field)]" />
          <div className="skeleton h-4 w-72 rounded-[var(--radius-field)]" />
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 p-4">
            <div className="skeleton size-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-3/5 rounded-[var(--radius-field)]" />
              <div className="skeleton h-3 w-4/5 rounded-[var(--radius-field)]" />
            </div>
          </div>
        ))}
      </main>
    </>
  );
}
