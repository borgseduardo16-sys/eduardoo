import { GiantWord, Marquee, ScrollHint } from '../_kit/ui';
import { LoopVideo, ScrubVideo } from '../_kit/video';
import { Reveal } from '@/components/motion/reveal';
import { SplitHeading } from '@/components/motion/split-heading';
import { Magnetic } from '@/components/motion/magnetic';

/*
 * Meridian (filme): site imersivo feito SÓ com vídeo real — nada de 3D gerado por código.
 * Os vídeos ficam em sites/meridian-filme/videos/ (ver meta.json) e são embutidos pelo `pnpm site`.
 */

const ETAPAS = [
  ['Fechado', 'Uma peça inteira, em silêncio. Por enquanto.'],
  ['A caixa se abre', 'Aço e safira dão lugar ao que realmente importa.'],
  ['O mecanismo', 'Cada componente no seu lugar, à vista.'],
  ['Inteiro outra vez', 'Role para cima e ele se fecha de novo.'],
];

const wrap = 'mx-auto w-full max-w-7xl px-6 sm:px-10';

function Botao({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="k-shine group inline-flex h-14 items-center justify-center gap-3 rounded-full bg-[#f2f0eb] px-8 text-sm font-semibold tracking-wide text-[#050608] shadow-[0_18px_50px_-18px_rgb(242_240_235/0.45)] transition-[transform,box-shadow] duration-300 ease-[var(--ease-out-soft)] hover:-translate-y-0.5 active:scale-[0.98]"
    >
      <span className="relative z-10">{children}</span>
      <span aria-hidden className="relative z-10 transition-transform duration-300 group-hover:translate-x-1">→</span>
    </a>
  );
}

export default function App() {
  return (
    <div className="film">
      <header className="fixed inset-x-0 top-0 z-40 mix-blend-difference text-white">
        <div className={`${wrap} flex h-16 items-center justify-between`}>
          <a href="#inicio" className="font-[family-name:var(--font-display)] text-sm font-bold tracking-[0.2em]">MERIDIAN</a>
          <nav className="flex gap-6 text-xs font-medium uppercase tracking-[0.16em] sm:gap-10">
            <a href="#relogio" className="opacity-80 transition-opacity hover:opacity-100">Abrir</a>
            <a href="#horologia" className="opacity-80 transition-opacity hover:opacity-100">Horologia</a>
          </nav>
        </div>
      </header>

      <main id="conteudo">
        {/* ============ 1. ABERTURA — vídeo em tela cheia ============ */}
        <section id="inicio" data-progress className="relative h-[100svh] overflow-hidden">
          <LoopVideo id="ceu" className="absolute inset-0" />
          <div className="veu-baixo absolute inset-0" />
          <div className="absolute inset-x-0 bottom-[14%] sm:bottom-[10%]">
            <GiantWord className="text-[17vw] text-white/40" from={0} to={-10}>Meridian</GiantWord>
          </div>
          <div className={`${wrap} relative z-10 flex h-full flex-col justify-end pb-28 sm:pb-24`}>
            <div className="max-w-2xl space-y-6">
              <Reveal>
                <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.22em] text-white/75">
                  <span className="h-px w-8 bg-current" aria-hidden />
                  Alta relojoaria · Edição demonstrativa
                </p>
              </Reveal>
              <SplitHeading
                text="O tempo, revelado."
                className="font-[family-name:var(--font-serif)] text-[3.2rem] font-light leading-[0.95] tracking-[-0.02em] sm:text-8xl lg:text-[7.5rem]"
              />
              <Reveal as="p" delay={0.45} className="max-w-md text-base leading-relaxed text-white/75 sm:text-lg">
                Role a página: o relógio se abre diante de você, peça por peça.
              </Reveal>
              <Reveal delay={0.6}>
                <Magnetic><Botao href="#relogio">Abrir o relógio</Botao></Magnetic>
              </Reveal>
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-6 z-10 hidden justify-center text-white md:flex"><ScrollHint href="#relogio" /></div>
        </section>

        {/* ============ 2. O RELÓGIO SE ABRE — vídeo controlado pela rolagem ============ */}
        <ScrubVideo id="relogio" altura={520} steps={4}>
          <div className="veu-esq absolute inset-0" />
          <div className={`${wrap} relative flex h-full items-end pb-20 md:items-center md:pb-0`}>
            <div className="max-w-md">
              <p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-white/70">O relógio por dentro</p>
              <div className="relative h-[9.5rem] sm:h-[11rem]">
                {ETAPAS.map(([t, d], i) => (
                  <div key={t} className={`step s${i} absolute inset-0`}>
                    <p className="font-[family-name:var(--font-display)] text-xs font-semibold tracking-[0.2em] text-white/60">
                      {String(i + 1).padStart(2, '0')} / 04
                    </p>
                    <h2 className="mt-3 font-[family-name:var(--font-serif)] text-4xl font-light leading-none tracking-tight sm:text-6xl">{t}</h2>
                    <p className="mt-4 text-base leading-relaxed text-white/75 sm:text-lg">{d}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 h-px w-48 bg-white/20"><div className="bar-h h-px bg-white" /></div>
            </div>
          </div>
        </ScrubVideo>

        {/* ============ 3. HOROLOGIA — macro do mecanismo ============ */}
        <section id="horologia" data-progress className="relative min-h-[130svh] overflow-hidden">
          <LoopVideo id="movimento" className="absolute inset-0" />
          <div className="veu-total absolute inset-0" />
          <div className="pointer-events-none absolute inset-x-0 top-[14%]">
            <GiantWord className="text-[15vw] text-white/70" from={6} to={-14}>Horology</GiantWord>
          </div>
          <div className={`${wrap} relative z-10 flex min-h-[130svh] items-end pb-28`}>
            <Reveal className="max-w-xl space-y-6">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/65">Horologia</p>
              <h2 className="font-[family-name:var(--font-serif)] text-5xl font-light leading-[1] tracking-tight sm:text-7xl">Cada engrenagem é uma decisão.</h2>
              <p className="max-w-md text-base leading-relaxed text-white/75 sm:text-lg">
                Atrás do mostrador existe uma cidade em miniatura, que não para nem à noite.
              </p>
            </Reveal>
          </div>
        </section>

        <div className="relative z-10 bg-[#050608] py-10 sm:py-14">
          <Marquee texto="MERIDIAN  ·  HOROLOGIA  ·  EDIÇÃO DEMONSTRATIVA" className="k-outline font-[family-name:var(--font-display)] text-[10vw] font-bold leading-none text-white/50 sm:text-[6vw]" />
        </div>

        {/* ============ 4. FECHAMENTO — no pulso ============ */}
        <section id="cta" className="relative min-h-[100svh] overflow-hidden">
          <LoopVideo id="pulso" className="absolute inset-0" />
          <div className="veu-total absolute inset-0" />
          <div className={`${wrap} relative z-10 flex min-h-[100svh] flex-col items-center justify-center text-center`}>
            <Reveal>
              <h2 className="mx-auto max-w-3xl font-[family-name:var(--font-serif)] text-5xl font-light leading-[1] tracking-tight sm:text-8xl">
                Reserve o seu tempo.
              </h2>
              <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-white/80 sm:text-lg">
                Uma peça por vez, montada à mão. Fale com a manufatura.
              </p>
              <div className="mt-10 flex justify-center"><Magnetic><Botao href="#inicio">Quero conhecer</Botao></Magnetic></div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="relative z-10 bg-[#050608] px-6 py-10 text-center text-xs leading-relaxed text-white/45">
        Site de demonstração. Marca e textos fictícios; vídeos usados com permissão do titular.
      </footer>
    </div>
  );
}
