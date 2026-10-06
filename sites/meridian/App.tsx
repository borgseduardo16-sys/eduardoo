import { Stage } from '../_kit/boot';
import { GiantWord, Marquee, ScrollHint, StickySection } from '../_kit/ui';
import { Reveal } from '@/components/motion/reveal';
import { SplitHeading } from '@/components/motion/split-heading';
import { Magnetic } from '@/components/motion/magnetic';

const PARTES = [
  ['Fundo da caixa', 'Aço escovado que fecha o relógio e protege o calibre.'],
  ['Movimento', 'Engrenagens em ouro trabalham em silêncio, todos os dias.'],
  ['Caixa', 'Lapidada à mão, com reflexos que mudam a cada ângulo.'],
  ['Mostrador', 'Azul profundo, raios finos e índices aplicados.'],
  ['Ponteiros', 'Hora, minuto e segundo — acertados com a hora de verdade.'],
  ['Cristal', 'Vidro safira, transparente como se não existisse.'],
];

const wrap = 'mx-auto w-full max-w-7xl px-6 sm:px-10';

function Botao({ href, children, claro = false }: { href: string; children: React.ReactNode; claro?: boolean }) {
  return (
    <a
      href={href}
      className={`k-shine group inline-flex h-14 items-center justify-center gap-3 rounded-full px-8 text-sm font-semibold tracking-wide transition-[transform,box-shadow] duration-300 ease-[var(--ease-out-soft)] hover:-translate-y-0.5 active:scale-[0.98] ${
        claro
          ? 'bg-[#eef2f8] text-[#0b1220] shadow-[0_18px_50px_-18px_rgb(238_242_248/0.5)]'
          : 'bg-[#0b1220] text-white shadow-[0_18px_50px_-18px_rgb(11_18_32/0.7)]'
      }`}
    >
      <span className="relative z-10">{children}</span>
      <span aria-hidden className="relative z-10 transition-transform duration-300 group-hover:translate-x-1">→</span>
    </a>
  );
}

export default function App() {
  return (
    <div className="mer">
      <Stage fallback="radial-gradient(120% 90% at 70% 15%, #f3f6fc 0%, #bfd1e8 100%)" />

      <header className="fixed inset-x-0 top-0 z-40 mix-blend-difference text-white">
        <div className={`${wrap} flex h-16 items-center justify-between`}>
          <a href="#inicio" className="font-[family-name:var(--font-display)] text-sm font-bold tracking-[0.2em]">MERIDIAN</a>
          <nav className="flex gap-6 text-xs font-medium uppercase tracking-[0.16em] sm:gap-10">
            <a href="#anatomia" className="opacity-80 transition-opacity hover:opacity-100">Calibre</a>
            <a href="#horologia" className="opacity-80 transition-opacity hover:opacity-100">Horologia</a>
          </nav>
        </div>
      </header>

      <main id="conteudo" className="relative z-10">
        {/* ============ 1. HERO ============ */}
        <section id="inicio" data-progress className="relative flex min-h-[100svh] items-center overflow-hidden">
          <div className="absolute inset-x-0 bottom-[6%] -z-0">
            <GiantWord className="text-[17vw] opacity-30" from={-3} to={-14}>Meridian</GiantWord>
          </div>
          <div className={`${wrap} relative z-10 grid grid-cols-1 gap-10 pb-24 pt-28 lg:grid-cols-2 lg:pb-16`}>
            <div className="max-w-xl space-y-7">
              <Reveal>
                <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.22em] opacity-70">
                  <span className="h-px w-8 bg-current" aria-hidden />
                  Alta relojoaria · Edição demonstrativa
                </p>
              </Reveal>
              <SplitHeading
                text="O tempo, desmontado em arte."
                className="font-[family-name:var(--font-serif)] text-[2.9rem] font-light leading-[0.98] tracking-[-0.02em] sm:text-7xl lg:text-[5.4rem]"
              />
              <Reveal as="p" delay={0.5} className="max-w-md text-base leading-relaxed opacity-75 sm:text-lg">
                Um calibre automático feito para ser visto por dentro. Role para atravessar as nuvens e abrir o relógio.
              </Reveal>
              <Reveal delay={0.65} className="flex flex-wrap items-center gap-5">
                <Magnetic><Botao href="#anatomia">Abrir o relógio</Botao></Magnetic>
                <a href="#horologia" className="text-sm font-medium underline-offset-8 hover:underline">Ver horologia</a>
              </Reveal>
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-6 z-10 hidden justify-center md:flex"><ScrollHint href="#travessia" /></div>
        </section>

        {/* ============ 2. TRAVESSIA ============ */}
        <StickySection id="travessia" altura={260} steps={2}>
          <div className="grid h-full place-items-center px-6 text-center">
            <div className="relative">
              <p className="step s0 absolute inset-0 grid place-items-center font-[family-name:var(--font-serif)] text-[2.6rem] font-light italic leading-[1.02] sm:text-7xl lg:text-[7rem]">
                Acima do ruído,
              </p>
              <p className="step s1 grid place-items-center font-[family-name:var(--font-serif)] text-[2.6rem] font-light italic leading-[1.02] sm:text-7xl lg:text-[7rem]" aria-hidden={false}>
                o tempo tem outro ritmo.
              </p>
            </div>
          </div>
        </StickySection>

        {/* ============ 3. ANATOMIA ============ */}
        <StickySection id="anatomia" altura={560} steps={6}>
          <div className={`${wrap} grid h-full grid-cols-1 content-start gap-8 pt-24 sm:pt-28 lg:grid-cols-[1fr_1fr] lg:content-center`}>
            <div className="max-w-md">
              <p className="mb-6 text-xs font-semibold uppercase tracking-[0.22em] opacity-70">Anatomia do calibre</p>
              <div className="relative h-[11.5rem] sm:h-[12.5rem]">
                {PARTES.map(([nome, texto], i) => (
                  <div key={nome} className={`step s${i} absolute inset-0`}>
                    <p className="font-[family-name:var(--font-display)] text-xs font-semibold tracking-[0.2em] opacity-60">
                      {String(i + 1).padStart(2, '0')} / 06
                    </p>
                    <h2 className="mt-3 font-[family-name:var(--font-serif)] text-4xl font-light leading-none tracking-tight sm:text-6xl">{nome}</h2>
                    <p className="mt-4 text-base leading-relaxed opacity-75 sm:text-lg">{texto}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 h-px w-48 bg-current/15"><div className="bar-h h-px bg-current" /></div>
            </div>
          </div>
        </StickySection>

        {/* ============ 4. HOROLOGIA (escuro) ============ */}
        <section id="horologia" data-progress className="dark relative overflow-hidden pb-24 pt-[34vh] sm:pt-[44vh]">
          <div className="pointer-events-none absolute inset-x-0 top-[12vh]">
            <GiantWord className="text-[15vw] opacity-60" from={8} to={-12}>Horology</GiantWord>
          </div>
          <div className={`${wrap} relative z-10 grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_0.9fr]`}>
            <Reveal className="max-w-xl space-y-6">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-60">Horologia</p>
              <h2 className="font-[family-name:var(--font-serif)] text-5xl font-light leading-[1] tracking-tight sm:text-7xl">Cada engrenagem é uma decisão.</h2>
              <p className="max-w-md text-base leading-relaxed opacity-70 sm:text-lg">
                Atrás do mostrador existe uma cidade em miniatura, que não para nem à noite. Aproxime-se.
              </p>
            </Reveal>
          </div>
          <div className="relative z-10 mt-[22vh]">
            <Marquee texto="MERIDIAN  ·  HOROLOGIA  ·  EDIÇÃO DEMONSTRATIVA" className="k-outline font-[family-name:var(--font-display)] text-[9vw] font-bold leading-none opacity-50 sm:text-[6vw]" />
          </div>
        </section>

        {/* ============ 5. CTA ============ */}
        <section id="cta" className="dark relative overflow-hidden py-28 sm:py-40">
          <div className={`${wrap} relative z-10 text-center`}>
            <Reveal>
              <h2 className="mx-auto max-w-3xl font-[family-name:var(--font-serif)] text-5xl font-light leading-[1] tracking-tight sm:text-8xl">
                Reserve o seu tempo.
              </h2>
              <p className="mx-auto mt-6 max-w-md text-base leading-relaxed opacity-70 sm:text-lg">
                Uma peça por vez, montada à mão. Fale com a manufatura.
              </p>
              <div className="mt-10 flex justify-center"><Magnetic><Botao href="#inicio" claro>Quero conhecer</Botao></Magnetic></div>
            </Reveal>
          </div>
          <p className="relative z-10 mx-auto mt-24 max-w-xl px-6 text-center text-xs leading-relaxed opacity-50">
            Site de demonstração do kit de sites cinematográficos. Marca, produto e textos são fictícios.
          </p>
        </section>
      </main>
    </div>
  );
}
