import { SiteHeader } from '@/components/layout/site-header';

/** Esqueleto do perfil enquanto os dados chegam — nunca tela branca. */
export default function Loading() {
  return (
    <>
      <SiteHeader />
      <main id="conteudo" className="mx-auto max-w-3xl px-4 sm:px-6 py-8 sm:py-12 space-y-10" aria-busy="true">
        <span className="sr-only" role="status">
          Carregando perfil…
        </span>
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="skeleton size-24 rounded-full" />
          <div className="space-y-2.5 flex-1">
            <div className="skeleton h-8 w-48 rounded-[var(--radius-field)]" />
            <div className="skeleton h-4 w-56 rounded-[var(--radius-field)]" />
            <div className="skeleton h-4 w-36 rounded-[var(--radius-field)]" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="skeleton h-4 w-full rounded-[var(--radius-field)]" />
          <div className="skeleton h-4 w-4/5 rounded-[var(--radius-field)]" />
        </div>
        <div className="space-y-3">
          <div className="skeleton h-5 w-52 rounded-[var(--radius-field)]" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-6 w-64 rounded-[var(--radius-field)]" />
          ))}
        </div>
      </main>
    </>
  );
}
