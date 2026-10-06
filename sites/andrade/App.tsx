import { ArrowDown, ArrowRight, Clock, MapPin, Phone, Star } from 'lucide-react';
import { Foto, Marquee, StickySection } from '../_kit/ui';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { SplitHeading } from '@/components/motion/split-heading';
import { Magnetic } from '@/components/motion/magnetic';
import { CountUp } from '@/components/vendas/count-up';
import { CITACAO, DESTAQUES, EMPRESA, HORARIOS, MAPS_URL, PROJETOS, ROTA_URL, WHATSAPP_URL } from './dados';
import { IconeWhats, ListaAmbientes, StatusAberto, WhatsFlutuante } from './partes';

/*
 * Andrade Móveis Planejados — site cinematográfico com as FOTOS REAIS dos projetos do cliente.
 * Motivos visuais tirados do próprio trabalho dele: a fita de LED âmbar que "acende" e o ripado de madeira.
 */

const wrap = 'mx-auto w-full max-w-7xl px-5 sm:px-10';
const MANIFESTO = 'Acabamento impecável, materiais de qualidade, pontualidade e profissionalismo.';

function Marca({ compacta = false }: { compacta?: boolean }) {
  return (
    <span className="inline-flex flex-col items-start leading-none">
      <span className="bg-gradient-to-b from-white via-[#d9d6d1] to-[#8f8a83] bg-clip-text font-[family-name:var(--font-display)] text-[1.05rem] font-extrabold tracking-[0.06em] text-transparent sm:text-xl">
        ANDRADE
      </span>
      {!compacta && (
        <span className="mt-1 flex items-center gap-1.5 text-[0.5rem] font-semibold tracking-[0.32em] text-ambar sm:text-[0.5625rem]">
          <span className="h-px w-3 bg-ambar/70" aria-hidden />
          MÓVEIS PLANEJADOS
          <span className="h-px w-3 bg-ambar/70" aria-hidden />
        </span>
      )}
    </span>
  );
}

function BotaoWhats({ children = 'Pedir orçamento pelo WhatsApp', grande = false }: { children?: React.ReactNode; grande?: boolean }) {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener"
      className={`k-shine group inline-flex items-center justify-center gap-3 rounded-full bg-ambar font-semibold text-carvao shadow-[0_18px_50px_-14px_rgb(240_164_58/0.65)] transition-[transform,box-shadow] duration-300 ease-[var(--ease-out-soft)] hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-12px_rgb(240_164_58/0.8)] active:scale-[0.98] ${
        grande ? 'h-16 px-9 text-base' : 'h-14 px-7 text-[0.9375rem]'
      }`}
    >
      <IconeWhats className="relative z-10 size-5" />
      <span className="relative z-10">{children}</span>
    </a>
  );
}

function Estrelas({ className = 'size-4' }: { className?: string }) {
  return (
    <span className="inline-flex gap-0.5 text-ambar" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`${className} fill-current`} />)}
    </span>
  );
}

export default function App() {
  const palavras = MANIFESTO.split(' ');
  return (
    <div className="and">
      {/* ================= Cabeçalho ================= */}
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/[0.06] bg-carvao/90 backdrop-blur-xl">
        <div className={`${wrap} flex h-[4.5rem] items-center justify-between`}>
          <a href="#inicio" aria-label={`${EMPRESA.nome} — início`}><Marca /></a>
          <nav className="flex items-center gap-7 text-[0.8125rem] font-medium">
            <a href="#projetos" className="hidden text-areia transition-colors hover:text-marfim md:inline">Projetos</a>
            <a href="#avaliacoes" className="hidden text-areia transition-colors hover:text-marfim md:inline">Avaliações</a>
            <a href="#contato" className="hidden text-areia transition-colors hover:text-marfim md:inline">Contato</a>
            <a href={WHATSAPP_URL} target="_blank" rel="noopener" className="inline-flex h-11 items-center gap-2 rounded-full border border-ambar/50 px-4 text-ambar transition-colors hover:bg-ambar hover:text-carvao">
              <IconeWhats className="size-4" /> Orçamento
            </a>
          </nav>
        </div>
      </header>

      <main id="conteudo">
        {/* ================= 1. HERO ================= */}
        <section id="inicio" data-progress className="relative h-[100svh] min-h-[38rem] overflow-hidden">
          <div className="absolute inset-0" style={{ transform: 'translate3d(0, calc(var(--p, 0) * 22%), 0)' }}>
            <Foto id="home" alt="Sala com painel de TV iluminado por LED e nichos com prateleiras iluminadas, projeto Andrade" className="aproximar absolute inset-0 bottom-[30%] sm:bottom-0" posicao="40% 35%" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-carvao from-[38%] via-carvao/40 via-[62%] to-transparent sm:from-carvao sm:from-0% sm:via-carvao/30 sm:via-50%" />
          <div className="absolute inset-0 hidden bg-gradient-to-r from-carvao/75 via-carvao/10 to-transparent sm:block" />

          {/* Moldura de LED que se desenha */}
          <svg aria-hidden className="moldura pointer-events-none absolute inset-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] sm:inset-6 sm:h-[calc(100%-3rem)] sm:w-[calc(100%-3rem)]" preserveAspectRatio="none">
            <rect x="1" y="1" width="calc(100% - 2px)" height="calc(100% - 2px)" rx="22" pathLength={1} fill="none" stroke="#f0a43a" strokeWidth="1.5" style={{ filter: 'drop-shadow(0 0 6px rgb(240 164 58 / .8))', width: 'calc(100% - 2px)', height: 'calc(100% - 2px)' }} />
          </svg>

          <div className={`${wrap} relative z-10 flex h-full flex-col justify-end pb-16 sm:pb-20`}>
            <div className="max-w-3xl space-y-6">
              <Reveal>
                <p className="flex items-center gap-3 text-[0.6875rem] font-semibold uppercase tracking-[0.26em] text-ambar">
                  <span className="h-px w-8 bg-ambar" aria-hidden />
                  Móveis planejados · {EMPRESA.cidade}
                </p>
              </Reveal>
              <SplitHeading
                text="Ambientes sob medida, com acabamento que se nota."
                className="font-[family-name:var(--font-serif)] text-[2.35rem] font-light leading-[1.02] tracking-[-0.02em] sm:text-7xl lg:text-[5.6rem]"
              />
              <Reveal as="p" delay={0.45} className="max-w-xl text-[0.9375rem] leading-relaxed text-marfim/80 sm:text-lg">
                Cozinhas, painéis de TV, home theaters e bancadas planejados para o seu espaço — com madeira, pedra e luz no lugar certo.
              </Reveal>
              <Reveal delay={0.6} className="flex flex-col items-start gap-5 pt-2 sm:flex-row sm:items-center">
                <Magnetic><BotaoWhats /></Magnetic>
                <a href="#projetos" className="inline-flex h-12 items-center gap-2 text-sm font-medium text-marfim/85 transition-colors hover:text-ambar">
                  Ver projetos <ArrowDown className="size-4" aria-hidden />
                </a>
              </Reveal>
              <Reveal delay={0.75}>
                <a href={MAPS_URL} target="_blank" rel="noopener" className="inline-flex items-center gap-3 rounded-full border border-white/12 bg-carvao/40 py-2 pl-3 pr-4 text-sm backdrop-blur-md transition-colors hover:border-ambar/50">
                  <Estrelas />
                  <span><strong className="font-semibold">{EMPRESA.nota}</strong> no Google · {EMPRESA.avaliacoes} avaliações</span>
                </a>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ================= 2. MANIFESTO (as palavras acendem com a rolagem) ================= */}
        <StickySection id="manifesto" altura={220}>
          <div className="ripado absolute inset-y-0 right-0 w-[18vw] opacity-40 [mask-image:linear-gradient(to_left,#000,transparent)]" aria-hidden />
          <div className={`${wrap} flex h-full flex-col justify-center`}>
            <p className="mb-8 text-[0.6875rem] font-semibold uppercase tracking-[0.26em] text-areia">O que os clientes destacam</p>
            <p className="max-w-5xl font-[family-name:var(--font-serif)] text-[2.3rem] font-light leading-[1.08] tracking-tight sm:text-6xl lg:text-[5.2rem]" aria-label={MANIFESTO}>
              {palavras.map((w, i) => (
                <span key={i} aria-hidden className="palavra" style={{ ['--i' as string]: i, ['--n' as string]: palavras.length }}>
                  {w}{' '}
                </span>
              ))}
            </p>
            <div className="mt-10 max-w-md">
              <span className="led" style={{ transform: 'scaleX(var(--p, 0))' }} />
              <p className="mt-4 text-sm text-areia">Resumo das avaliações da Andrade no Google.</p>
            </div>
          </div>
        </StickySection>

        {/* ================= 3. PROJETOS ================= */}
        {/* Desktop: trilho horizontal guiado pela rolagem */}
        <StickySection id="projetos" altura={480} className="hidden md:block">
          <div className="flex h-full flex-col justify-center">
            <div className={`${wrap} mb-8 flex items-end justify-between`}>
              <div>
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.26em] text-ambar">Projetos entregues</p>
                <h2 className="mt-3 font-[family-name:var(--font-serif)] text-5xl font-light tracking-tight lg:text-6xl">Feito pela Andrade.</h2>
              </div>
              <div className="w-48"><span className="led" style={{ transform: 'scaleX(var(--p, 0))' }} /></div>
            </div>
            <div className="trilho flex gap-[4vw] px-[8vw]">
              {PROJETOS.map((p, i) => (
                <figure key={p.img} className="group relative h-[62vh] w-[62vw] shrink-0 overflow-hidden rounded-[22px]">
                  <Foto id={p.img} alt={p.titulo} posicao={p.pos} className="absolute inset-0 transition-transform duration-[1.2s] ease-[var(--ease-out-soft)] group-hover:scale-[1.04]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-carvao/90 via-carvao/10 to-transparent" />
                  <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-8 p-8">
                    <div className="max-w-md">
                      <p className="font-[family-name:var(--font-display)] text-xs text-ambar">{String(i + 1).padStart(2, '0')} / {String(PROJETOS.length).padStart(2, '0')}</p>
                      <h3 className="mt-2 font-[family-name:var(--font-serif)] text-3xl font-light lg:text-4xl">{p.titulo}</h3>
                      <p className="mt-2 text-[0.9375rem] text-marfim/75">{p.texto}</p>
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </StickySection>

        {/* Celular: lista vertical, cada foto revelada ao entrar */}
        <section id="projetos-lista" className="py-20 md:hidden" aria-labelledby="projetos-titulo">
          <div className={wrap}>
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.26em] text-ambar">Projetos entregues</p>
            <h2 id="projetos-titulo" className="mt-3 font-[family-name:var(--font-serif)] text-[2.6rem] font-light tracking-tight">Feito pela Andrade.</h2>
            <div className="mt-10 space-y-14">
              {PROJETOS.map((p, i) => (
                <figure key={p.img} data-progress>
                  <div className="revela aspect-[4/5] overflow-hidden">
                    <Foto id={p.img} alt={p.titulo} posicao={p.pos} className="h-full w-full" />
                  </div>
                  <figcaption className="mt-5">
                    <p className="font-[family-name:var(--font-display)] text-xs text-ambar">{String(i + 1).padStart(2, '0')}</p>
                    <h3 className="mt-1 font-[family-name:var(--font-serif)] text-2xl font-light">{p.titulo}</h3>
                    <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-areia">{p.texto}</p>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* ================= 4. DETALHE (a foto cresce até tomar a tela) ================= */}
        <StickySection id="detalhe" altura={260}>
          <div className="zoom-foto absolute inset-0 overflow-hidden">
            <Foto id="bancada" alt="Bancada com frente ripada iluminada por fita de LED, projeto Andrade" className="absolute inset-0" posicao="50% 60%" />
            <div className="absolute inset-0 bg-gradient-to-t from-carvao/85 via-carvao/25 to-transparent" />
          </div>
          <div className={`${wrap} zoom-texto relative flex h-full items-end pb-20`}>
            <div className="max-w-2xl">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.26em] text-ambar">Detalhe</p>
              <h2 className="mt-4 font-[family-name:var(--font-serif)] text-5xl font-light leading-[1] tracking-tight sm:text-7xl">A luz certa muda o ambiente.</h2>
              <p className="mt-5 max-w-md text-base leading-relaxed text-marfim/80 sm:text-lg">
                Fita de LED embutida, ripado de madeira e pedra: o acabamento é o que transforma um móvel em projeto.
              </p>
            </div>
          </div>
        </StickySection>

        {/* ================= 5. AMBIENTES ================= */}
        <section id="ambientes" className="relative py-24 sm:py-36">
          <div className={wrap}>
            <Reveal className="mb-12 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
              <div>
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.26em] text-ambar">O que fazemos</p>
                <h2 className="mt-3 max-w-xl font-[family-name:var(--font-serif)] text-[2.6rem] font-light leading-[1.05] tracking-tight sm:text-6xl">Cada ambiente, planejado para o seu espaço.</h2>
              </div>
              <p className="max-w-xs text-sm leading-relaxed text-areia">Toque em um ambiente para conversar sobre o seu projeto pelo WhatsApp.</p>
            </Reveal>
            <ListaAmbientes />
          </div>
        </section>

        {/* Faixa ripada com marquee */}
        <div className="relative overflow-hidden border-y border-white/10 py-8" aria-hidden>
          <div className="ripado absolute inset-0 opacity-30" />
          <Marquee texto="COZINHAS  ·  PAINÉIS  ·  HOME THEATERS  ·  BANCADAS  ·  SOB MEDIDA" className="k-outline relative font-[family-name:var(--font-display)] text-[11vw] font-bold leading-none text-marfim/60 sm:text-[6vw]" />
        </div>

        {/* ================= 6. AVALIAÇÕES ================= */}
        <section id="avaliacoes" className="relative overflow-hidden py-24 sm:py-36">
          <div aria-hidden className="absolute -left-40 top-1/3 size-[36rem] rounded-full bg-ambar/10 blur-[120px]" />
          <div className={`${wrap} relative grid grid-cols-1 gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-center`}>
            <Reveal>
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.26em] text-ambar">Avaliações no Google</p>
              <p className="mt-6 flex items-end gap-5">
                <span className="font-[family-name:var(--font-serif)] text-[7rem] font-light leading-[0.8] tracking-tight sm:text-[10rem]">{EMPRESA.nota}</span>
                <span className="pb-3">
                  <Estrelas className="size-5" />
                  <span className="mt-2 block text-sm text-areia">
                    <CountUp to={EMPRESA.avaliacoes} /> avaliações
                  </span>
                </span>
              </p>
              <a href={MAPS_URL} target="_blank" rel="noopener" className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-marfim underline-offset-8 hover:text-ambar hover:underline">
                Ver avaliações no Google <ArrowRight className="size-4" aria-hidden />
              </a>
            </Reveal>
            <div>
              <Reveal>
                <blockquote className="relative rounded-[28px] border border-white/10 bg-grafite/80 p-8 sm:p-12">
                  <span aria-hidden className="absolute -top-8 left-8 font-[family-name:var(--font-serif)] text-[7rem] leading-none text-ambar/80">“</span>
                  <p className="font-[family-name:var(--font-serif)] text-3xl font-light italic leading-snug sm:text-[2.6rem]">{CITACAO}</p>
                  <footer className="mt-6 flex items-center gap-3 text-sm text-areia">
                    <Estrelas className="size-3.5" /> Cliente, avaliação no Google
                  </footer>
                </blockquote>
              </Reveal>
              <RevealGroup as="ul" className="mt-6 flex flex-wrap gap-2.5" stagger={0.08}>
                {DESTAQUES.map((d) => (
                  <RevealItem as="li" key={d}>
                    <span className="inline-flex h-10 items-center rounded-full border border-ambar/30 bg-ambar/[0.07] px-4 text-sm text-marfim">{d}</span>
                  </RevealItem>
                ))}
              </RevealGroup>
            </div>
          </div>
        </section>

        {/* ================= 7. COMO FUNCIONA ================= */}
        <section id="processo" className="relative border-t border-white/10 py-24 sm:py-32">
          <div className={wrap}>
            <Reveal className="max-w-2xl">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.26em] text-ambar">Como funciona</p>
              <h2 className="mt-3 font-[family-name:var(--font-serif)] text-[2.6rem] font-light leading-[1.05] tracking-tight sm:text-6xl">Da primeira conversa à montagem.</h2>
            </Reveal>
            <RevealGroup as="ol" className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-[24px] border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4" stagger={0.1}>
              {[
                ['Conversa', 'Você chama no WhatsApp, conta o que imagina e envia fotos do espaço.'],
                ['Projeto', 'Definimos juntos o desenho, os materiais e a iluminação.'],
                ['Produção', 'Os móveis são feitos sob medida para o seu ambiente.'],
                ['Montagem', 'Instalação com o cuidado e a pontualidade que os clientes destacam.'],
              ].map(([t, d], i) => (
                <RevealItem as="li" key={t} className="group relative bg-carvao p-8 transition-colors duration-500 hover:bg-grafite">
                  <span className="font-[family-name:var(--font-display)] text-xs text-ambar">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="mt-6 font-[family-name:var(--font-serif)] text-3xl font-light">{t}</h3>
                  <p className="mt-3 text-[0.9375rem] leading-relaxed text-areia">{d}</p>
                  <span aria-hidden className="led absolute inset-x-8 bottom-0 scale-x-0 transition-transform duration-700 ease-[var(--ease-out-soft)] group-hover:scale-x-100" />
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* ================= 8. CONTATO ================= */}
        <section id="contato" className="relative overflow-hidden">
          <div className="absolute inset-0">
            <Foto id="painel" alt="" className="absolute inset-0 opacity-35" posicao="50% 40%" />
            <div className="absolute inset-0 bg-gradient-to-b from-carvao via-carvao/80 to-carvao" />
          </div>
          <div className={`${wrap} relative py-24 sm:py-36`}>
            <Reveal className="mx-auto max-w-3xl text-center">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.26em] text-ambar">Orçamento</p>
              <h2 className="mt-4 font-[family-name:var(--font-serif)] text-5xl font-light leading-[1] tracking-tight sm:text-7xl lg:text-8xl">Vamos planejar o seu ambiente?</h2>
              <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-marfim/80 sm:text-lg">
                Mande uma mensagem com o que você imagina. A conversa começa pelo WhatsApp.
              </p>
              <div className="mt-10 flex justify-center"><Magnetic><BotaoWhats grande>Conversar no WhatsApp</BotaoWhats></Magnetic></div>
            </Reveal>

            <RevealGroup className="mx-auto mt-20 grid max-w-5xl grid-cols-1 gap-4 md:grid-cols-3" stagger={0.1}>
              <RevealItem className="rounded-[22px] border border-white/10 bg-grafite/70 p-7 backdrop-blur-md">
                <Phone className="size-5 text-ambar" aria-hidden />
                <p className="mt-5 text-xs uppercase tracking-[0.2em] text-areia">Telefone e WhatsApp</p>
                <a href={EMPRESA.telefoneLink} className="mt-2 block text-xl font-medium transition-colors hover:text-ambar">{EMPRESA.telefone}</a>
              </RevealItem>
              <RevealItem className="rounded-[22px] border border-white/10 bg-grafite/70 p-7 backdrop-blur-md">
                <MapPin className="size-5 text-ambar" aria-hidden />
                <p className="mt-5 text-xs uppercase tracking-[0.2em] text-areia">Endereço</p>
                <p className="mt-2 leading-relaxed">{EMPRESA.endereco}</p>
                <a href={ROTA_URL} target="_blank" rel="noopener" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-ambar hover:underline">Como chegar <ArrowRight className="size-3.5" aria-hidden /></a>
              </RevealItem>
              <RevealItem className="rounded-[22px] border border-white/10 bg-grafite/70 p-7 backdrop-blur-md">
                <Clock className="size-5 text-ambar" aria-hidden />
                <p className="mt-5 text-xs uppercase tracking-[0.2em] text-areia">Horário</p>
                <div className="mt-2"><StatusAberto /></div>
                <dl className="mt-4 space-y-1.5 text-sm">
                  {HORARIOS.map(([d, h]) => (
                    <div key={d} className="flex justify-between gap-4"><dt className="text-areia">{d}</dt><dd>{h}</dd></div>
                  ))}
                </dl>
              </RevealItem>
            </RevealGroup>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className={`${wrap} flex flex-col items-start justify-between gap-6 py-10 sm:flex-row sm:items-center`}>
          <Marca />
          <p className="text-xs leading-relaxed text-areia">
            © {new Date().getFullYear()} {EMPRESA.nome} · {EMPRESA.cidade}
          </p>
        </div>
      </footer>

      <WhatsFlutuante />
    </div>
  );
}
