import type { ReactNode, CSSProperties } from 'react';

/** Palavra gigante vazada (só contorno), com parallax horizontal ligado ao --p do pai [data-progress]. */
export function GiantWord({
  children,
  className = '',
  from = -8,
  to = 8,
  style,
}: {
  children: ReactNode;
  className?: string;
  /** deslocamento horizontal em vw, no início e no fim da passagem */
  from?: number;
  to?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={`k-outline pointer-events-none block select-none whitespace-nowrap font-[family-name:var(--font-display)] font-bold uppercase leading-[0.85] tracking-[-0.04em] ${className}`}
      style={{ transform: `translate3d(calc(${from}vw + (${to} - (${from})) * var(--p, 0) * 1vw), 0, 0)`, ...style }}
    >
      {children}
    </span>
  );
}

/** Faixa que corre sem parar (CSS puro). `texto` repete; pausa com reduce-motion (regra global). */
export function Marquee({ texto, className = '', reverse = false }: { texto: string; className?: string; reverse?: boolean }) {
  const item = (
    <span className="flex shrink-0 items-center gap-[4vw] pr-[4vw]">
      {Array.from({ length: 4 }).map((_, i) => (
        <span key={i} className="flex items-center gap-[4vw]">
          <span>{texto}</span>
          <span aria-hidden className="size-[1.2vw] min-h-2 min-w-2 rounded-full bg-current opacity-60" />
        </span>
      ))}
    </span>
  );
  return (
    <div aria-hidden className={`k-marquee overflow-hidden whitespace-nowrap ${className}`}>
      <div className={`flex w-max ${reverse ? 'k-marquee-rev' : 'k-marquee-fwd'}`}>
        {item}
        {item}
      </div>
    </div>
  );
}

/**
 * Seção alta com conteúdo grudado na tela (sticky): a rolagem "toca" a cena 3D
 * e o --p / data-step. `altura` em vh (ex.: 400 = 4 telas de rolagem).
 */
export function StickySection({
  id,
  altura = 400,
  steps,
  className = '',
  children,
}: {
  id: string;
  altura?: number;
  steps?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} data-progress="stick" data-steps={steps} style={{ height: `${altura}vh` }} className={`relative z-10 ${className}`}>
      <div className="sticky top-0 h-[100svh] overflow-hidden">{children}</div>
    </section>
  );
}

/** Indicador "role" com linha animada. */
export function ScrollHint({ href, label = 'Role' }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      aria-label="Rolar para a próxima seção"
      className="flex flex-col items-center gap-2 text-[0.6875rem] uppercase tracking-[0.2em] opacity-70 transition-opacity hover:opacity-100"
    >
      {label}
      <span className="relative h-10 w-px overflow-hidden bg-current/20">
        <span className="k-scroll-hint absolute inset-x-0 top-0 h-3 bg-current" />
      </span>
    </a>
  );
}
