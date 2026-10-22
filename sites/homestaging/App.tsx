import { ArrowDown, ArrowRight, ArrowUpRight, MapPin, Phone, Plus, Star } from 'lucide-react';
import { Marquee } from '../_kit/ui';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { Magnetic } from '@/components/motion/magnetic';
import { EMPRESA, FAQ, MAPS_URL, METODO, ROTA_URL, WHATSAPP_URL } from './dados';
import { AntesDepois, IconeWhats, Logo, Palavras, Projetos, ServicosLista, WhatsFlutuante } from './partes';
import { Proposta } from './proposta';

/*
 * 5D Home Staging & Healthy Homes (Porto). Modelo "galeria de arquitetura": gesso quente, grafite, menta do vidro
 * da cozinha e latão; Instrument Serif enorme + Plus Jakarta. Abertura com o logótipo a desenhar-se; hero em que a
 * rolagem faz o antes → depois da mesma cozinha; projetos num trilho horizontal; serviços com foto que segue o cursor.
 */

const wrap = 'mx-auto w-full max-w-[90rem] px-5 sm:px-10';
const rotulo = 'text-[0.6875rem] font-semibold uppercase tracking-[0.28em]';
const D = 'font-[family-name:var(--font-is)]';

function Cortina() {
  return (
    <div aria-hidden className="cortina pointer-events-none fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-carvao">
      <Logo claro animar className="h-24 w-auto" />
      <p className={`nome ${D} text-3xl text-gesso`}>5D Home Staging</p>
    </div>
  );
}

function Cabecalho() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-grafite/[0.07] bg-gesso/80 backdrop-blur-xl">
      <div className={`${wrap} flex h-[4.5rem] items-center justify-between`}>
        <a href="#inicio" className="flex items-center gap-3" aria-label={`${EMPRESA.nome} — início`}>
          <Logo className="h-8 w-auto" />
          <span className="leading-none">
            <span className={`${D} block whitespace-nowrap text-[1.35rem]`}>5D Home Staging</span>
            <span className="mt-0.5 block whitespace-nowrap text-[0.5625rem] font-semibold uppercase tracking-[0.3em] text-pedra">&amp; Healthy Homes</span>
          </span>
        </a>
        <nav className="flex items-center gap-8 text-[0.8125rem] text-grafite/75">
          <a href="#projetos" className="hidden transition-colors hover:text-grafite md:inline">Projetos</a>
          <a href="#servicos" className="hidden transition-colors hover:text-grafite md:inline">Serviços</a>
          <a href="#metodo" className="hidden transition-colors hover:text-grafite lg:inline">Método</a>
          <a href="#contacto" className="hidden transition-colors hover:text-grafite md:inline">Contacto</a>
          <a href="#proposta" className="inline-flex h-11 items-center whitespace-nowrap rounded-full bg-grafite px-4 font-medium text-gesso transition-transform hover:-translate-y-0.5 sm:px-6"><span className="sm:hidden">Proposta</span><span className="hidden sm:inline">Pedir proposta</span></a>
        </nav>
      </div>
    </header>
  );
}

function Botao({ children, href = '#proposta', claro = false }: { children: React.ReactNode; href?: string; claro?: boolean }) {
  return (
    <a href={href}
      className={`k-shine group inline-flex h-14 items-center justify-center gap-3 rounded-full px-8 text-[0.9375rem] font-medium transition-[transform,box-shadow] duration-300 ease-[var(--ease-out-soft)] hover:-translate-y-0.5 active:scale-[0.98] ${
        claro ? 'bg-gesso text-grafite' : 'bg-grafite text-gesso shadow-[0_18px_40px_-18px_rgb(29_31_29/0.8)]'}`}>
      <span className="relative z-10">{children}</span>
      <ArrowRight className="relative z-10 size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
    </a>
  );
}

const Estrelas = ({ className = 'size-4' }: { className?: string }) => (
  <span className="flex gap-0.5 text-latao" aria-hidden>{[0, 1, 2, 3, 4].map((i) => <Star key={i} className={`${className} fill-current`} />)}</span>
);

export default function App() {
  return (
    <div className="hs">
      <Cortina />
      <Cabecalho />
      <main id="conteudo">
        {/* ================= HERO: antes → depois ================= */}
        <section id="inicio" data-progress="stick" className="grao relative h-[260vh] bg-gesso">
          <div className="sticky top-0 h-[100svh] overflow-hidden pt-[4.5rem]">
            <div className={`${wrap} grid h-full grid-cols-1 items-center gap-8 py-8 md:grid-cols-[0.9fr_1.1fr] md:gap-12 lg:gap-20`}>
              <div className="hero-titulo relative z-10 order-2 md:order-1">
                <Reveal delay={0.1}>
                  <p className={`${rotulo} flex items-center gap-3 text-pedra`}><span className="h-px w-10 bg-latao" aria-hidden />Home staging · Porto</p>
                </Reveal>
                <Reveal delay={0.2}>
                  <h1 className={`${D} mt-6 text-[3rem] leading-[0.95] tracking-[-0.02em] sm:text-[4.4rem] lg:text-[5.4rem] xl:text-[6.2rem]`}>
                    Mostre a casa <em className="text-musgo">como ela pode ser vivida.</em>
                  </h1>
                </Reveal>
                <Reveal as="p" delay={0.35} className="mt-7 max-w-md text-[1.0625rem] leading-relaxed text-pedra">
                  Preparamos imóveis para vender, arrendar ou simplesmente viver melhor. Cada divisão pensada para a fotografia, para a visita e para quem lá vai morar.
                </Reveal>
                <Reveal delay={0.5} className="mt-9 flex flex-wrap items-center gap-6">
                  <Magnetic><Botao>Pedir proposta</Botao></Magnetic>
                  <a href="#projetos" className="text-sm font-medium underline-offset-8 hover:underline">Ver projetos</a>
                </Reveal>
                <Reveal delay={0.65} className="mt-9 flex items-center gap-4 border-t border-grafite/10 pt-6">
                  <span className={`${D} text-5xl leading-none`}>{EMPRESA.nota}</span>
                  <span>
                    <Estrelas />
                    <span className="mt-1 block text-xs text-pedra">{EMPRESA.avaliacoes} avaliações no Google</span>
                  </span>
                  <span className="ml-auto hidden items-center gap-2 text-[0.6875rem] uppercase tracking-[0.22em] text-pedra md:flex">
                    Role: antes → depois <ArrowDown className="size-3.5 animate-bounce" aria-hidden />
                  </span>
                </Reveal>
              </div>
              <div className="relative order-1 aspect-[4/5] w-full md:order-2 md:aspect-auto md:h-[calc(100svh-9rem)]">
                <AntesDepois />
              </div>
            </div>
          </div>
        </section>

        <div className="border-y border-grafite/10 bg-menta/50 py-5 text-grafite">
          <Marquee texto="Home staging · Healthy Homes · Decoração de interiores · Porto" className={`${D} text-3xl italic sm:text-4xl`} />
        </div>

        {/* ================= MANIFESTO ================= */}
        <section id="manifesto" className="py-28 sm:py-44">
          <div className={`${wrap} grid gap-10 lg:grid-cols-[14rem_1fr]`}>
            <p className={`${rotulo} text-pedra`}>O nosso olhar</p>
            <Palavras
              texto="Um imóvel vazio pede imaginação. Um imóvel preparado conta uma história: a luz da manhã, o lugar do sofá, a mesa posta para dois. É essa história que fica na memória de quem visita."
              destaque={['história', 'memória']}
            />
          </div>
        </section>

        {/* ================= PROJETOS (trilho horizontal) ================= */}
        <Projetos />

        {/* ================= SERVIÇOS ================= */}
        <section id="servicos" className="py-28 sm:py-40">
          <div className={wrap}>
            <div className="mb-14 grid gap-6 lg:grid-cols-[14rem_1fr]">
              <p className={`${rotulo} text-pedra`}>Serviços</p>
              <Reveal>
                <h2 className={`${D} text-[2.8rem] leading-[0.98] tracking-[-0.02em] sm:text-[4.6rem]`}>Do primeiro olhar <em className="text-musgo">à chave na mão.</em></h2>
              </Reveal>
            </div>
            <ServicosLista />
          </div>
        </section>

        {/* ================= MÉTODO ================= */}
        <section id="metodo" data-progress className="bg-osso py-28 sm:py-40">
          <div className={wrap}>
            <div className="mb-16 grid gap-6 lg:grid-cols-[14rem_1fr]">
              <p className={`${rotulo} text-pedra`}>Método</p>
              <Reveal>
                <h2 className={`${D} text-[2.8rem] leading-[0.98] tracking-[-0.02em] sm:text-[4.6rem]`}>Quatro tempos, <em className="text-musgo">zero improviso.</em></h2>
              </Reveal>
            </div>
            <div className="relative">
              <div className="absolute inset-x-0 top-0 hidden h-px bg-grafite/10 lg:block" aria-hidden><div className="fio h-full bg-latao" /></div>
              <RevealGroup className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
                {METODO.map(([t, d], i) => (
                  <RevealItem key={t}>
                    <div className="border-t border-grafite/15 pt-8 lg:border-0">
                      <span className={`${D} text-6xl italic text-latao`}>{String(i + 1).padStart(2, '0')}</span>
                      <h3 className={`${D} mt-4 text-3xl`}>{t}</h3>
                      <p className="mt-3 max-w-xs text-[0.9375rem] leading-relaxed text-pedra">{d}</p>
                    </div>
                  </RevealItem>
                ))}
              </RevealGroup>
            </div>
          </div>
        </section>

        {/* ================= AVALIAÇÃO ================= */}
        <section className="relative overflow-hidden bg-carvao py-24 text-gesso sm:py-32">
          <div className={`${wrap} flex flex-col items-start justify-between gap-10 md:flex-row md:items-end`}>
            <Reveal>
              <p className={`${rotulo} text-gesso/55`}>No Google</p>
              <p className={`${D} mt-4 text-[8rem] leading-[0.8] sm:text-[13rem]`}>{EMPRESA.nota}</p>
            </Reveal>
            <Reveal delay={0.15} className="max-w-md">
              <Estrelas className="size-6" />
              <p className={`${D} mt-5 text-3xl leading-tight sm:text-4xl`}>{EMPRESA.avaliacoes} avaliações e <em className="text-menta">uma média de 5 em 5.</em></p>
              <a href={MAPS_URL} target="_blank" rel="noopener noreferrer" className="mt-7 inline-flex items-center gap-2 border-b border-gesso/30 pb-1 text-sm transition-colors hover:border-menta hover:text-menta">
                Ler as avaliações no Google <ArrowUpRight className="size-4" aria-hidden />
              </a>
            </Reveal>
          </div>
        </section>

        {/* ================= PROPOSTA ================= */}
        <section id="proposta" className="grao relative py-28 sm:py-40">
          <div className={`${wrap} relative`}>
            <div className="mx-auto mb-14 max-w-4xl">
              <p className={`${rotulo} text-pedra`}>Proposta à medida</p>
              <Reveal>
                <h2 className={`${D} mt-5 text-[2.8rem] leading-[0.98] tracking-[-0.02em] sm:text-[4.6rem]`}>Conte-nos sobre o imóvel. <em className="text-musgo">Nós tratamos do resto.</em></h2>
              </Reveal>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-pedra sm:text-lg">Cinco passos, menos de dois minutos. O pedido segue pelo WhatsApp e respondemos com uma proposta, sem compromisso.</p>
            </div>
            <Proposta />
          </div>
        </section>

        {/* ================= CONTACTO + FAQ ================= */}
        <section id="contacto" className="border-t border-grafite/10 py-28 sm:py-36">
          <div className={`${wrap} grid gap-16 lg:grid-cols-2`}>
            <Reveal>
              <p className={`${rotulo} text-pedra`}>Contacto</p>
              <h2 className={`${D} mt-5 text-[2.8rem] leading-[0.98] tracking-[-0.02em] sm:text-[4.2rem]`}>Estamos no <em className="text-musgo">Porto.</em></h2>
              <dl className="mt-10 divide-y divide-grafite/10 border-y border-grafite/10 text-[0.9375rem]">
                <div className="flex items-start gap-4 py-5"><MapPin className="mt-0.5 size-5 shrink-0 text-musgo" aria-hidden /><dt className="sr-only">Morada</dt><dd>{EMPRESA.morada}<br />{EMPRESA.codigo}, Portugal</dd></div>
                <div className="flex items-center gap-4 py-5"><Phone className="size-5 shrink-0 text-musgo" aria-hidden /><dt className="sr-only">Telefone</dt><dd><a href={EMPRESA.telefoneLink} className="hover:text-musgo">{EMPRESA.telefone}</a></dd></div>
              </dl>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center gap-2 rounded-full bg-grafite px-6 text-sm font-medium text-gesso transition-transform hover:-translate-y-0.5"><IconeWhats className="size-5" />WhatsApp</a>
                <a href={ROTA_URL} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center gap-2 rounded-full border border-grafite/25 px-6 text-sm font-medium transition-colors hover:border-grafite">Como chegar <ArrowUpRight className="size-4" aria-hidden /></a>
              </div>
            </Reveal>
            <Reveal delay={0.15}>
              <p className={`${rotulo} text-pedra`}>Perguntas frequentes</p>
              <div className="mt-8 divide-y divide-grafite/10 border-y border-grafite/10">
                {FAQ.map((f) => (
                  <details key={f.q} className="faq group py-5">
                    <summary className={`${D} flex cursor-pointer list-none items-center justify-between gap-4 text-[1.6rem] leading-tight`}>
                      {f.q}<Plus className="size-5 shrink-0 text-musgo transition-transform duration-300 group-open:rotate-45" aria-hidden />
                    </summary>
                    <p className="mt-3 max-w-lg text-[0.9375rem] leading-relaxed text-pedra">{f.a}</p>
                  </details>
                ))}
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="relative overflow-hidden bg-carvao pt-20 text-gesso/75">
        <div className={`${wrap} flex flex-col justify-between gap-8 sm:flex-row sm:items-end`}>
          <div>
            <Logo claro className="h-12 w-auto" />
            <p className={`${D} mt-5 text-3xl text-gesso`}>{EMPRESA.nome}</p>
            <p className="mt-2 text-sm">{EMPRESA.categoria} · Porto, Portugal</p>
          </div>
          <Botao claro>Pedir proposta</Botao>
        </div>
        <p aria-hidden className={`contorno ${D} pointer-events-none mt-10 select-none text-center text-[38vw] leading-[0.78] sm:text-[30vw]`}>5D</p>
        <p className="border-t border-gesso/10 py-6 text-center text-xs text-gesso/45">© {new Date().getFullYear()} {EMPRESA.nome}. Todos os direitos reservados.</p>
      </footer>
      <WhatsFlutuante />
    </div>
  );
}
