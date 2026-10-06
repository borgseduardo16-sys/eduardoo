'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { quadrosDoVideo, urlDoVideo } from './midia';

const reduz = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Vídeo real em loop, de fundo (tela cheia ou em bloco). Toca só quando visível;
 * com "reduzir movimento" fica parado no pôster (primeiro quadro, já no HTML via CSS).
 */
export function LoopVideo({ id, className = '', posicao = '50% 50%' }: { id: string; className?: string; posicao?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    let carregado = false;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          if (!carregado) {
            const url = urlDoVideo(id);
            if (!url) return;
            v.src = url;
            carregado = true;
          }
          if (!reduz()) v.play().catch(() => {});
        } else {
          v.pause();
        }
      },
      { rootMargin: '25% 0px' },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [id]);

  return (
    <div data-midia-poster={id} aria-hidden className={`overflow-hidden bg-cover ${className}`} style={{ backgroundPosition: posicao }}>
      <video
        ref={ref}
        muted
        loop
        playsInline
        preload="none"
        className="h-full w-full object-cover opacity-0 transition-opacity duration-700 [&.k-ok]:opacity-100"
        style={{ objectPosition: posicao }}
        onPlaying={(e) => e.currentTarget.classList.add('k-ok')}
      />
    </div>
  );
}

/**
 * Vídeo real "esfregado" pela rolagem (quadro a quadro, como nos sites da Apple):
 * seção alta com um canvas grudado na tela; rolar para baixo avança o vídeo, para
 * cima volta. `altura` em vh; `steps` liga data-step para legendas (CSS).
 * `posicao` = ponto focal do enquadramento (como object-position) — no celular a
 * imagem é cortada nas laterais, então centralize o produto.
 */
export function ScrubVideo({
  id,
  altura = 400,
  steps,
  posicao = [0.5, 0.5],
  className = '',
  children,
}: {
  id: string;
  altura?: number;
  steps?: number;
  posicao?: [number, number];
  className?: string;
  children?: ReactNode;
}) {
  const secao = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const sec = secao.current;
    const cv = canvas.current;
    if (!sec || !cv) return;
    const g = cv.getContext('2d', { alpha: false });
    if (!g) return;
    let quadros: HTMLImageElement[] = [];
    let atual = -1;
    let suave = 0;
    let raf = 0;
    let visivel = false;

    const medir = () => {
      const dpr = Math.min(window.devicePixelRatio, 1.5);
      cv.width = Math.round(cv.clientWidth * dpr);
      cv.height = Math.round(cv.clientHeight * dpr);
      atual = -1;
    };

    const desenhar = (i: number) => {
      const img = quadros[i];
      if (!img || !img.complete || !img.naturalWidth) return false;
      const W = cv.width;
      const H = cv.height;
      const s = Math.max(W / img.naturalWidth, H / img.naturalHeight); // "cover"
      const w = img.naturalWidth * s;
      const h = img.naturalHeight * s;
      g.drawImage(img, (W - w) * posicao[0], (H - h) * posicao[1], w, h);
      return true;
    };

    const progresso = () => {
      const r = sec.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      return span <= 0 ? 0 : Math.min(1, Math.max(0, -r.top / span));
    };

    const quadro = () => {
      raf = 0;
      if (!quadros.length) return;
      const alvo = progresso() * (quadros.length - 1);
      suave = reduz() ? alvo : suave + (alvo - suave) * 0.22;
      const i = Math.round(suave);
      if (i !== atual && desenhar(i)) atual = i;
      if (visivel && Math.abs(alvo - suave) > 0.01) raf = requestAnimationFrame(quadro);
    };
    const pedir = () => {
      if (!raf) raf = requestAnimationFrame(quadro);
    };

    const io = new IntersectionObserver(
      ([e]) => {
        visivel = e.isIntersecting;
        if (visivel && !quadros.length) {
          quadros = quadrosDoVideo(id);
          // redesenha assim que os primeiros quadros decodificarem
          quadros.slice(0, 2).forEach((q) => q.decode().then(() => { atual = -1; pedir(); }).catch(() => {}));
        }
        if (visivel) pedir();
      },
      { rootMargin: '50% 0px' },
    );
    io.observe(sec);
    const ro = new ResizeObserver(() => {
      medir();
      pedir();
    });
    ro.observe(cv);
    window.addEventListener('scroll', pedir, { passive: true });

    return () => {
      io.disconnect();
      ro.disconnect();
      window.removeEventListener('scroll', pedir);
      cancelAnimationFrame(raf);
    };
  }, [id, posicao]);

  return (
    <section
      ref={secao}
      id={id}
      data-progress="stick"
      data-steps={steps}
      style={{ height: `${altura}vh` }}
      className={`relative z-10 ${className}`}
    >
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <div data-midia-poster={id} aria-hidden className="absolute inset-0 bg-cover" style={{ backgroundPosition: `${posicao[0] * 100}% ${posicao[1] * 100}%` }} />
        <canvas ref={canvas} aria-hidden className="absolute inset-0 h-full w-full" />
        <div className="relative h-full">{children}</div>
      </div>
    </section>
  );
}
