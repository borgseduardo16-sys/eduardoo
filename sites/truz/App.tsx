import { ArrowRight, MapPin, Phone, Plus, Star } from 'lucide-react';
import { Foto, Marquee } from '../_kit/ui';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { Magnetic } from '@/components/motion/magnetic';
import { EMPRESA, FAQ, MAPS_URL, PROCESSO, ROTA_URL, SERVICOS, WHATSAPP_URL } from './dados';
import { CachoBaloes, Galeria, IconeWhats, WhatsFlutuante } from './partes';
import { Orcamento } from './orcamento';

/*
 * Truz, Truz, Surpresa — decoração de festas (Barcelos, PT). Conceito: "bater à porta". A porta em arco bate duas vezes
 * ("truz, truz"), abre e revela o cenário. Creme, azul-bebé, pêssego e dourado; Fraunces + Parisienne. Português de Portugal.
 */

const wrap = 'mx-auto w-full max-w-7xl px-5 sm:px-10';
const rotulo = 'text-[0.6875rem] font-semibold uppercase tracking-[0.28em]';
const F = 'font-[family-name:var(--font-fr)]';
const S = 'font-[family-name:var(--font-script)]';

function Cabecalho() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-tinta/[0.06] bg-creme/85 backdrop-blur-xl">
      <div className={`${wrap} flex h-[4.25rem] items-center justify-between`}>
        <a href="#inicio" className="leading-none" aria-label={`${EMPRESA.nome} — início`}>
          <span className={`${S} block whitespace-nowrap text-[1.7rem] text-azul-esc sm:text-3xl`}>Truz, Truz, Surpresa</span>
        </a>
        <nav className="flex items-center gap-7 text-[0.8125rem] text-tinta/75">
          <a href="#galeria" className="hidden transition-colors hover:text-tinta md:inline">Trabalhos</a>
          <a href="#servicos" className="hidden transition-colors hover:text-tinta md:inline">Serviços</a>
          <a href="#contacto" className="hidden transition-colors hover:text-tinta md:inline">Contacto</a>
          <a href="#orcamento" className="inline-flex h-11 items-center whitespace-nowrap rounded-full bg-azul-esc px-4 font-medium text-creme transition-transform hover:-translate-y-0.5 sm:px-5"><span className="sm:hidden">Orçamento</span><span className="hidden sm:inline">Pedir orçamento</span></a>
        </nav>
      </div>
    </header>
  );
}

function Botao({ children, href = '#orcamento', claro = false }: { children: React.ReactNode; href?: string; claro?: boolean }) {
  return (
    <a
      href={href}
      className={`k-shine group inline-flex h-14 items-center justify-center gap-3 rounded-full px-8 text-[0.9375rem] font-medium transition-[transform,box-shadow] duration-300 ease-[var(--ease-out-soft)] hover:-translate-y-0.5 active:scale-[0.98] ${
        claro ? 'bg-creme text-tinta shadow-[0_18px_40px_-16px_rgb(0_0_0/0.6)]' : 'bg-azul-esc text-creme shadow-[0_18px_40px_-16px_rgb(75_115_146/0.8)]'
      }`}
    >
      <span className="relative z-10">{children}</span>
      <ArrowRight className="relative z-10 size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
    </a>
  );
}

export default function App() {
  return (
    <div className="tz">
      <Cabecalho />
      <main id="conteudo">
        {/* ================= HERO ================= */}
        <section id="inicio" className="papel relative overflow-hidden bg-creme pt-[4.25rem]">
          <CachoBaloes className="absolute -left-10 top-24 hidden h-52 w-48 opacity-90 lg:block" />
          <div className={`${wrap} grid min-h-[calc(100svh-4.25rem)] grid-cols-1 items-center gap-8 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14`}>
            <div className="relative z-10 order-2 lg:order-1">
              <Reveal delay={0.2}>
                <p className={`${rotulo} flex items-center gap-3 text-pedra`}><span className="h-px w-8 bg-ouro" aria-hidden />Decoração de festas · {EMPRESA.zonas[0]}</p>
              </Reveal>
              <Reveal delay={0.3}>
                <h1 className={`${F} mt-5 text-[2.4rem] leading-[1.06] tracking-tight sm:text-6xl lg:text-[4.1rem]`}>
                  Abra a porta <em className="font-light italic text-azul-esc">à surpresa</em>.
                </h1>
              </Reveal>
              <Reveal as="p" delay={0.45} className="mt-6 max-w-lg text-[1.0625rem] leading-relaxed text-pedra sm:text-lg">
                Cenários, mesas e pequenos detalhes para batizados, aniversários e celebrações. Montamos tudo no local, para si só restar saborear o momento.
              </Reveal>
              <Reveal delay={0.6} className="mt-8 flex flex-wrap items-center gap-5">
                <Magnetic><Botao>Pedir orçamento</Botao></Magnetic>
                <a href="#galeria" className="text-sm font-medium text-tinta/80 underline-offset-8 transition-colors hover:text-azul-esc hover:underline">Ver trabalhos</a>
              </Reveal>
              <Reveal delay={0.75} className="mt-9 inline-flex items-center gap-3 rounded-full border border-tinta/10 bg-white/60 px-4 py-2 text-sm text-pedra">
                <span className="flex gap-0.5 text-ouro" aria-hidden>{[0, 1, 2, 3, 4].map((i) => <Star key={i} className="size-4 fill-current" />)}</span>
                <span><b className="font-semibold text-tinta">{EMPRESA.nota}</b> · {EMPRESA.avaliacoes} avaliações no Google</span>
              </Reveal>
            </div>

            {/* a porta */}
            <div className="relative order-1 mx-auto w-full max-w-[24rem] lg:order-2 lg:max-w-[28rem]">
              <p className={`${S} fala absolute -top-1 right-2 z-20 rounded-2xl bg-white px-4 py-1 text-3xl text-azul-esc shadow-lg sm:right-0`} aria-hidden>truz, truz!</p>
              <div className="porta relative mt-10 aspect-[4/5] w-full overflow-hidden arco shadow-[0_40px_80px_-40px_rgb(75_115_146/0.55)] ring-1 ring-ouro/50">
                <Foto id="duarte" alt="Cenário de aniversário com urso num cesto de balão, painéis em arco e balões em tons de pêssego e dourado" posicao="50% 55%" className="revela-foto absolute inset-0 h-full w-full" />
                <div className="folha folha-e" aria-hidden><span className="puxador" style={{ right: 12 }} /></div>
                <div className="folha folha-d" aria-hidden><span className="puxador" style={{ left: 12 }} /></div>
              </div>
              <CachoBaloes className="absolute -right-6 -bottom-8 h-48 w-44 scale-75 sm:-right-14 sm:scale-90" espelho />
            </div>
          </div>
        </section>

        <div className="border-y border-tinta/10 bg-azul-claro py-4 text-azul-esc">
          <Marquee texto="Batizados ✦ Aniversários ✦ Baby showers ✦ Jantares e almoços ✦ Casamentos ✦ Pequenas celebrações ✦ " className={`${F} text-2xl italic sm:text-3xl`} />
        </div>

        {/* ================= GALERIA ================= */}
        <section id="galeria" className="py-24 sm:py-32">
          <div className={wrap}>
            <Reveal className="mx-auto mb-12 max-w-2xl text-center">
              <p className={`${S} text-5xl text-azul-esc sm:text-6xl`}>os nossos trabalhos</p>
              <h2 className={`${F} mt-3 text-[2rem] leading-[1.1] tracking-tight sm:text-5xl`}>Festas que <em className="font-light italic text-caramelo">ganham vida</em>.</h2>
              <p className="mt-5 text-base text-pedra sm:text-lg">Toque numa fotografia para ver em grande.</p>
            </Reveal>
            <Galeria />
          </div>
        </section>

        {/* ================= SERVIÇOS ================= */}
        <section id="servicos" className="bg-mimo/60 py-24 sm:py-32">
          <div className={wrap}>
            <Reveal className="mx-auto mb-14 max-w-2xl text-center">
              <p className={`${rotulo} text-pedra`}>O que fazemos</p>
              <h2 className={`${F} mt-4 text-[2rem] leading-[1.1] tracking-tight sm:text-5xl`}>Do cenário ao <em className="font-light italic text-caramelo">último detalhe</em>.</h2>
            </Reveal>
            <RevealGroup className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {SERVICOS.map((s) => (
                <RevealItem key={s.n}>
                  <article className="cartao-s h-full rounded-[1.75rem] border border-ouro/30 bg-creme p-7">
                    <span className={`${F} text-4xl italic text-ouro`}>{s.n}</span>
                    <h3 className={`${F} mt-4 text-2xl leading-tight`}>{s.t}</h3>
                    <p className="mt-3 text-[0.9375rem] leading-relaxed text-pedra">{s.d}</p>
                  </article>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* ================= PROCESSO ================= */}
        <section id="processo" className="py-24 sm:py-32">
          <div className={wrap}>
            <Reveal className="mx-auto mb-14 max-w-2xl text-center">
              <p className={`${S} text-5xl text-azul-esc sm:text-6xl`}>como funciona</p>
              <h2 className={`${F} mt-3 text-[2rem] leading-[1.1] tracking-tight sm:text-5xl`}>Quatro passos até à <em className="font-light italic text-caramelo">surpresa</em>.</h2>
            </Reveal>
            <RevealGroup className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {PROCESSO.map(([t, d], i) => (
                <RevealItem key={t}>
                  <div className="relative border-t border-ouro/60 pt-6">
                    <span className={`${F} text-5xl font-light italic text-azul`}>{String(i + 1).padStart(2, '0')}</span>
                    <h3 className={`${F} mt-3 text-2xl`}>{t}</h3>
                    <p className="mt-2 text-[0.9375rem] leading-relaxed text-pedra">{d}</p>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* ================= ORÇAMENTO ================= */}
        <section id="orcamento" className="relative overflow-hidden bg-azul-claro py-24 sm:py-32">
          <CachoBaloes className="absolute -right-10 top-10 hidden h-52 w-48 opacity-80 lg:block" espelho />
          <div className={`${wrap} relative`}>
            <Reveal className="mx-auto mb-12 max-w-2xl text-center">
              <p className={`${S} text-5xl text-azul-esc sm:text-6xl`}>conte-nos a sua ideia</p>
              <h2 className={`${F} mt-3 text-[2rem] leading-[1.1] tracking-tight sm:text-5xl`}>Peça o seu <em className="font-light italic text-caramelo">orçamento</em>.</h2>
              <p className="mt-5 text-base text-pedra sm:text-lg">Cinco passos rápidos e o pedido segue por WhatsApp. Sem compromisso.</p>
            </Reveal>
            <Orcamento />
          </div>
        </section>

        {/* ================= CONTACTO + FAQ ================= */}
        <section id="contacto" className="py-24 sm:py-32">
          <div className={`${wrap} grid gap-14 lg:grid-cols-2`}>
            <Reveal>
              <p className={`${S} text-5xl text-azul-esc`}>venha ver-nos</p>
              <h2 className={`${F} mt-3 text-[2rem] leading-[1.1] tracking-tight sm:text-5xl`}>Estamos em <em className="font-light italic text-caramelo">Barcelos</em>.</h2>
              <address className="mt-8 flex items-start gap-3 text-base not-italic leading-relaxed text-pedra">
                <MapPin className="mt-1 size-5 shrink-0 text-azul-esc" aria-hidden />{EMPRESA.morada}
              </address>
              <a href={EMPRESA.telefoneLink} className="mt-4 flex items-center gap-3 text-base text-pedra transition-colors hover:text-azul-esc">
                <Phone className="size-5 shrink-0 text-azul-esc" aria-hidden />{EMPRESA.telefone}
              </a>
              <p className="mt-4 text-sm text-pedra">Zonas: {EMPRESA.zonas.join(', ')}.</p>
              <div className="mt-8 flex flex-wrap gap-4">
                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center gap-2 rounded-full bg-[#1f8f4e] px-6 text-sm font-medium text-white transition-transform hover:-translate-y-0.5"><IconeWhats className="size-5" />Falar no WhatsApp</a>
                <a href={ROTA_URL} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center gap-2 rounded-full border border-tinta/20 px-6 text-sm font-medium transition-colors hover:border-azul-esc hover:text-azul-esc">Como chegar</a>
                <a href={MAPS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center rounded-full px-2 text-sm text-pedra underline underline-offset-4">Ver no mapa</a>
              </div>
            </Reveal>
            <Reveal delay={0.15}>
              <h3 className={`${F} text-2xl`}>Perguntas frequentes</h3>
              <div className="mt-5 divide-y divide-tinta/10 border-y border-tinta/10">
                {FAQ.map((f) => (
                  <details key={f.q} className="faq group py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[1.0625rem] font-medium">
                      {f.q}<Plus className="size-5 shrink-0 text-azul-esc transition-transform group-open:rotate-45" aria-hidden />
                    </summary>
                    <p className="mt-3 text-[0.9375rem] leading-relaxed text-pedra">{f.a}</p>
                  </details>
                ))}
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="bg-noite px-5 py-14 text-center text-creme/80">
        <p className={`${S} text-4xl text-azul`}>Truz, Truz, Surpresa</p>
        <p className="mt-2 text-sm">Decoração de Festas · {EMPRESA.zonas[0]}, Portugal</p>
        <p className="mt-6 text-xs text-creme/50">© {new Date().getFullYear()} {EMPRESA.nome}. Todos os direitos reservados.</p>
      </footer>
      <WhatsFlutuante />
    </div>
  );
}
