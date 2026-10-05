/** Selo discreto: deixa claro que a composição é um exemplo, não dado real. */
export function IllustrativeTag({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-[var(--v-muted)] ${className}`}
    >
      <span className="size-1 rounded-full bg-[var(--v-muted)]" aria-hidden />
      Exemplo ilustrativo
    </span>
  );
}
