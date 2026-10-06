/*
 * Rolagem do kit: Lenis (suave) + GSAP ScrollTrigger, e o "binder" de progresso.
 *
 * Em qualquer elemento, marque:
 *   data-progress          → define --p (0..1) enquanto o elemento cruza a tela
 *   data-progress="stick"  → --p (0..1) durante uma seção sticky alta (altura > 100vh)
 *   data-steps="5"         → além de --p, mantém data-step="0..4" (para CSS: [data-step="2"] .x {…})
 * O CSS anima com var(--p) — nenhuma re-renderização do React.
 */
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export function initScroll(): () => void {
  // Celular (html.lite): rolagem 100% nativa e sem animações ligadas à rolagem — leve e à prova de falhas.
  if (document.documentElement.classList.contains('lite')) return () => {};
  gsap.registerPlugin(ScrollTrigger);
  const reduz = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let lenis: Lenis | null = null;
  let tick: ((t: number) => void) | null = null;
  if (!reduz) {
    lenis = new Lenis({
      lerp: 0.085,
      syncTouch: false,
      anchors: true,
      prevent: (n) => Boolean(n.closest('dialog, [data-lenis-prevent]')),
    });
    lenis.on('scroll', ScrollTrigger.update);
    tick = (t: number) => lenis!.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
  }

  const gatilhos: ScrollTrigger[] = [];
  document.querySelectorAll<HTMLElement>('[data-progress]').forEach((el) => {
    const stick = el.dataset.progress === 'stick';
    const passos = Number(el.dataset.steps ?? 0);
    gatilhos.push(
      ScrollTrigger.create({
        trigger: el,
        start: stick ? 'top top' : 'top bottom',
        end: stick ? 'bottom bottom' : 'bottom top',
        onUpdate: (s) => {
          el.style.setProperty('--p', s.progress.toFixed(4));
          if (passos) el.dataset.step = String(Math.min(passos - 1, Math.floor(s.progress * passos)));
        },
        onRefresh: (s) => {
          el.style.setProperty('--p', s.progress.toFixed(4));
          if (passos) el.dataset.step = String(Math.min(passos - 1, Math.floor(s.progress * passos)));
        },
      }),
    );
  });

  return () => {
    gatilhos.forEach((g) => g.kill());
    if (tick) gsap.ticker.remove(tick);
    lenis?.destroy();
  };
}
