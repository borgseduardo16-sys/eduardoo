import { ArrowRight, Clock, MapPin, Phone, Plus } from 'lucide-react';
import { Foto, Marquee, StickySection } from '../_kit/ui';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { Magnetic } from '@/components/motion/magnetic';
import { Parallax } from '@/components/motion/parallax';
import { CAPITULOS, EMPRESA, FAQ, HORARIOS, MAPS_URL, PROCESSO, ROTA_URL, SERVICOS, WHATSAPP_URL } from './dados';
import { Estrelas, IconeWhats, Monograma, Ornamento, SeloGiratorio, StatusAberto, WhatsFlutuante } from './partes';
import { Orcamento } from './orcamento';

/*
 * Kelle Garcia — cerimonial. Modelo "revista de casamento": papel creme, sálvia e dourado, Cormorant + Pinyon Script,
 * molduras em arco e oval (nada de caixas), monograma, selo de cera e serviços como cartões de convite.
 */

const wrap = 'mx-auto w-full max-w-7xl px-5 sm:px-10';
const rotulo = 'text-[0.6875rem] font-semibold uppercase tracking-[0.28em]';
const SELO = 'CERIMONIAL • KELLE GARCIA • TRÊS LAGOAS • ';

function Cabecalho() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-tinta/[0.06] bg-papel/85 backdrop-blur-xl">
      <div className={`${wrap} flex h-[4.5rem] items-center justify-between`}>
        <a href="#conteudo" className="flex items-center gap-3" aria-label={`${EMPRESA.nome} — início`}>
          <Monograma className="size-10 text-ouro" />
          <span className="leading-none">
            <span className="block font-serif text-[1.6rem] font-light tracking-[0.02em]">Kelle Garcia</span>
            <span className="mt-0.5 block text-[0.5rem] font-semibold tracking-[0.36em] text-pedra">CERIMONIAL</span>
          </span>
        </a>
        <nav className="flex items-center gap-7 text-[0.8125rem] text-tinta/75">
          <a href="#capitulos" className="hidden transition-colors hover:text-tinta md:inline">O grande dia</a>
          <a href="#servicos" className="hidden transition-colors hover:text-tinta md:inline">Serviços</a>
          <a href="#contato" className="hidden transition-colors hover:text-tinta md:inline">Contato</a>
          <a href="#orcamento" className="inline-flex h-11 items-center rounded-full bg-salvia-esc px-5 font-medium text-papel transition-transform hover:-translate-y-0.5">Fazer orçamento</a>
        </nav>
      </div>
    </header>
  );
}

function BotaoPrincipal({ children, href = '#orcamento', claro = false }: { children: React.ReactNode; href?: string; claro?: boolean }) {
  return (
    <a
      href={href}
      className={`k-shine group inline-flex h-14 items-center justify-center gap-3 rounded-full px-8 text-[0.9375rem] font-medium transition-[transform,box-shadow] duration-300 ease-[var(--ease-out-soft)] hover:-translate-y-0.5 active:scale-[0.98] ${
        claro ? 'bg-papel text-tinta shadow-[0_18px_40px_-16px_rgb(0_0_0/0.6)]' : 'bg-salvia-esc text-papel shadow-[0_18px_40px_-16px_rgb(77_91_71/0.8)]'
      }`}
    >
      <span className="relative z-10">{children}</span>
      <ArrowRight className="relative z-10 size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
    </a>
  );
}

export default function App() {
  return (
    <div className="kel">
      <Cabecalho />
      <main id="conteudo">
        {/* ================= HERO — desktop: o arco cresce até a tela inteira ================= */}
        <StickySection id="inicio" altura={230} className="h-sec hidden md:block">
          <div className="papel absolute inset-0 bg-papel" />
          {/* nome gigante atrás do arco */}
          <p aria-hidden className="h-esq absolute left-[5vw] top-[22vh] z-0 font-serif text-[15vw] font-light leading-[0.8] tracking-[-0.03em] text-tinta">Kelle</p>
          <p aria-hidden className="h-dir absolute right-[4vw] top-[52vh] z-0 font-serif text-[15vw] font-light italic leading-[0.8] tracking-[-0.03em] text-salvia-esc">Garcia</p>
          <h1 className="sr-only">Kelle Garcia — Cerimonial em {EMPRESA.cidade}</h1>

          <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-[46%]">
            <div className="h-arco entra-arco relative overflow-hidden shadow-[0_40px_90px_-40px_rgb(43_38_34/0.6)]">
              <Foto id="pier" alt="Casal de noivos no píer ao pôr do sol" className="entra-zoom absolute inset-0" posicao="42% 50%" />
              <div className="h-veu absolute inset-0 bg-gradient-to-t from-noite via-noite/40 to-noite/20" />
            </div>
          </div>

          <div className="h-ini absolute left-[5vw] top-[12vh] z-20 flex items-center gap-3 text-pedra">
            <span className="h-px w-8 bg-ouro" aria-hidden />
            <span className={rotulo}>Cerimonial · {EMPRESA.cidade}</span>
          </div>
          <SeloGiratorio texto={SELO} className="h-ini absolute bottom-[7vh] left-[5vw] z-20 size-36 text-tinta/70" />
          <div className="h-ini absolute bottom-[8vh] right-[5vw] z-20 max-w-sm">
            <p className="text-[1.0625rem] leading-relaxed text-tinta/80">Do primeiro café ao último brinde, cada detalhe do seu casamento nas mãos certas.</p>
            <div className="mt-6 flex items-center gap-5">
              <Magnetic><BotaoPrincipal>Planejar meu evento</BotaoPrincipal></Magnetic>
            </div>
          </div>

          {/* frase final sobre a foto em tela cheia */}
          <div className="h-fim pointer-events-none absolute inset-x-0 bottom-[14vh] z-30 text-center text-papel">
            <p className="font-[family-name:var(--font-script)] text-6xl text-ouro-claro lg:text-7xl">para sempre</p>
            <p className="mx-auto mt-2 max-w-4xl font-serif text-6xl font-light leading-[1] lg:text-7xl">O seu grande dia merece ser vivido, não coordenado.</p>
          </div>
        </StickySection>

        {/* ================= HERO — celular ================= */}
        <section id="inicio-m" className="papel relative overflow-hidden bg-papel pb-16 pt-28 md:hidden">
          <div className={wrap}>
            <p className={`${rotulo} flex items-center gap-3 text-pedra`}><span className="h-px w-8 bg-ouro" aria-hidden />Cerimonial · {EMPRESA.cidade}</p>
            <h1 className="mt-5 font-serif font-light leading-[0.82] tracking-[-0.03em]">
              <span className="block text-[23vw]">Kelle</span>
              <span className="block pl-[14vw] text-[23vw] italic text-salvia-esc">Garcia</span>
            </h1>
            <div className="relative mt-8">
              <div className="arco relative aspect-[4/5] overflow-hidden shadow-[0_30px_60px_-30px_rgb(43_38_34/0.6)]">
                <Foto id="pier" alt="Casal de noivos no píer ao pôr do sol" className="absolute inset-0" posicao="42% 50%" />
              </div>
              <SeloGiratorio texto={SELO} className="absolute -bottom-10 -left-2 size-28 rounded-full bg-papel text-tinta/70" />
            </div>
            <p className="mt-14 text-[1.0625rem] leading-relaxed text-tinta/80">Do primeiro café ao último brinde, cada detalhe do seu casamento nas mãos certas.</p>
            <div className="mt-6"><BotaoPrincipal>Planejar meu evento</BotaoPrincipal></div>
          </div>
        </section>

        {/* ================= MANIFESTO ================= */}
        <section id="manifesto" className="relative overflow-hidden py-28 sm:py-40">
          <Parallax distance={50} className="absolute left-[4vw] top-24 hidden lg:block">
            <div className="oval h-[22rem] w-[15rem] overflow-hidden shadow-[0_30px_60px_-30px_rgb(43_38_34/0.5)]"><Foto id="sorriso" alt="" className="h-full w-full" posicao="50% 30%" /></div>
          </Parallax>
          <Parallax distance={-40} className="absolute bottom-20 right-[5vw] hidden lg:block">
            <div className="arco h-[20rem] w-[14rem] overflow-hidden shadow-[0_30px_60px_-30px_rgb(43_38_34/0.5)]"><Foto id="flores" alt="" className="h-full w-full" posicao="55% 40%" /></div>
          </Parallax>
          <div className="mx-auto max-w-3xl px-6 text-center">
            <Reveal><Ornamento className="mx-auto h-3 w-40 text-ouro" /></Reveal>
            <Reveal delay={0.1}><p className="mt-8 font-[family-name:var(--font-script)] text-5xl text-ouro sm:text-6xl">com carinho,</p></Reveal>
            <Reveal delay={0.2}>
              <h2 className="mt-2 font-serif text-[2.6rem] font-light leading-[1.02] tracking-tight sm:text-7xl">
                Cada casamento é <em className="italic text-salvia-esc">único</em>. A forma de cuidar dele também.
              </h2>
            </Reveal>
            <Reveal delay={0.3} as="p" className="mx-auto mt-8 max-w-xl text-base leading-relaxed text-pedra sm:text-lg">
              Cerimonial é estar presente em cada detalhe para que vocês só precisem estar presentes um para o outro.
            </Reveal>
          </div>
        </section>

        {/* ================= CAPÍTULOS — desktop ================= */}
        <StickySection id="capitulos" altura={520} steps={5} className="hidden bg-linho md:block">
          <div className="papel absolute inset-0" />
          <div className={`${wrap} relative grid h-full grid-cols-[1fr_1fr] items-center gap-16 pt-16`}>
            <div>
              <p className={`${rotulo} text-pedra`}>O grande dia, em capítulos</p>
              <div className="mt-4 h-[7.5rem] overflow-hidden" aria-hidden>
                <div className="cap-num font-serif text-[7.5rem] font-light italic leading-none text-ouro">
                  {CAPITULOS.map((c) => <div key={c.n} className="h-[7.5rem]">{c.n}</div>)}
                </div>
              </div>
              <ol className="mt-6 space-y-5">
                {CAPITULOS.map((c, i) => (
                  <li key={c.t} className={`cap-txt c${i}`}>
                    <h3 className="font-serif text-4xl font-light leading-tight lg:text-5xl">{c.t}</h3>
                    <span className="cap-l mt-2 block h-px w-24 bg-ouro" aria-hidden />
                    <p className="cap-d mt-2 max-w-md text-[1.0625rem] leading-relaxed text-pedra">{c.d}</p>
                  </li>
                ))}
              </ol>
            </div>
            <div className="relative mx-auto h-[74vh] w-[min(34rem,40vw)]">
              <svg aria-hidden className="absolute -inset-5 h-[calc(100%+2.5rem)] w-[calc(100%+2.5rem)] text-ouro/60" viewBox="0 0 100 140" preserveAspectRatio="none">
                <ellipse cx="50" cy="70" rx="49.5" ry="69.5" fill="none" stroke="currentColor" strokeWidth="0.25" vectorEffect="non-scaling-stroke" strokeDasharray="2 5" />
              </svg>
              <div className="oval absolute inset-0 overflow-hidden bg-tinta/10 shadow-[0_50px_90px_-40px_rgb(43_38_34/0.7)]">
                {CAPITULOS.map((c, i) => (
                  <div key={c.img} className={`cap-foto f${i} absolute inset-0`}>
                    <Foto id={c.img} alt={i === 0 ? c.t : ''} posicao={c.pos} className="absolute inset-0" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </StickySection>

        {/* ================= CAPÍTULOS — celular ================= */}
        <section id="capitulos-m" className="papel relative bg-linho py-20 md:hidden">
          <div className={wrap}>
            <p className={`${rotulo} text-pedra`}>O grande dia, em capítulos</p>
            <div className="mt-10 space-y-16">
              {CAPITULOS.map((c, i) => (
                <Reveal key={c.t} className={i % 2 ? 'pl-10' : 'pr-10'}>
                  <div className={`${i % 2 ? 'arco' : 'oval'} aspect-[3/4] overflow-hidden shadow-[0_30px_60px_-30px_rgb(43_38_34/0.5)]`}>
                    <Foto id={c.img} alt={c.t} posicao={c.pos} className="h-full w-full" />
                  </div>
                  <p className="mt-5 font-serif text-5xl font-light italic text-ouro">{c.n}</p>
                  <h3 className="font-serif text-4xl font-light">{c.t}</h3>
                  <p className="mt-2 text-[1.0625rem] leading-relaxed text-pedra">{c.d}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ================= SERVIÇOS como convites ================= */}
        <section id="servicos" className="relative overflow-hidden py-24 sm:py-36">
          <div aria-hidden className="absolute -right-40 top-20 size-[36rem] rounded-full bg-blush/50 blur-[120px]" />
          <div className={`${wrap} relative`}>
            <Reveal className="mx-auto mb-16 max-w-2xl text-center">
              <p className={`${rotulo} text-pedra`}>Serviços</p>
              <h2 className="mt-4 font-serif text-[2.6rem] font-light leading-[1.02] tracking-tight sm:text-7xl">Formas de cuidar do <em className="italic text-salvia-esc">seu dia</em>.</h2>
            </Reveal>
            <RevealGroup className="grid grid-cols-1 gap-x-6 gap-y-14 sm:grid-cols-2 lg:grid-cols-4" stagger={0.12}>
              {SERVICOS.map((s, i) => (
                <RevealItem key={s.t} className="convite relative">
                  <div className="papel relative flex h-full flex-col items-center rounded-t-[999px] rounded-b-[28px] bg-papel px-7 pb-8 pt-16 text-center shadow-[0_30px_60px_-36px_rgb(43_38_34/0.45)]">
                    <div className="pointer-events-none absolute inset-2.5 rounded-t-[999px] rounded-b-[22px] border border-ouro/45" aria-hidden />
                    <div className="pointer-events-none absolute inset-4 rounded-t-[999px] rounded-b-[18px] border border-ouro/20" aria-hidden />
                    <span className="selo absolute -top-7 left-1/2 grid size-16 -translate-x-1/2 place-items-center rounded-full" aria-hidden>
                      <Monograma className="size-12" cor="#f6e7c8" />
                    </span>
                    <p className="font-serif text-sm italic text-ouro">nº {String(i + 1).padStart(2, '0')}</p>
                    <h3 className="mt-2 font-serif text-[2rem] font-light leading-[1.05]">{s.t}</h3>
                    <p className="mt-1 font-serif text-lg italic text-salvia-esc">{s.sub}</p>
                    <Ornamento className="my-5 h-3 w-28 text-ouro" />
                    <ul className="space-y-2.5 text-[0.9375rem] text-tinta/80">
                      {s.itens.map((it) => <li key={it}>{it}</li>)}
                    </ul>
                    <a href="#orcamento" className="relative mt-auto pt-8 text-sm font-medium text-salvia-esc underline-offset-8 hover:underline">Consultar →</a>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* faixa em script */}
        <div className="relative overflow-hidden border-y border-ouro/25 bg-linho py-6" aria-hidden>
          <Marquee texto="Casamentos  ·  Mini weddings  ·  Noivados  ·  Bodas  ·  15 anos" className="font-[family-name:var(--font-script)] text-[13vw] leading-[1.3] text-ouro sm:text-[6.5vw]" />
        </div>

        {/* ================= DESTAQUE escuro com avaliação ================= */}
        <section id="avaliacao" className="relative overflow-hidden bg-noite py-28 text-papel sm:py-40">
          <Foto id="luzes" alt="" className="absolute inset-0 opacity-45" posicao="50% 30%" />
          <div className="absolute inset-0 bg-gradient-to-r from-noite via-noite/75 to-noite/30" />
          <div className={`${wrap} relative grid grid-cols-1 items-end gap-14 lg:grid-cols-[1.3fr_0.7fr]`}>
            <Reveal>
              <p className="font-[family-name:var(--font-script)] text-5xl text-ouro-claro sm:text-6xl">no grande dia,</p>
              <h2 className="mt-2 max-w-3xl font-serif text-[2.8rem] font-light leading-[1] tracking-tight sm:text-7xl lg:text-8xl">vocês aproveitam. <em className="italic text-ouro-claro">A gente cuida.</em></h2>
            </Reveal>
            <Reveal delay={0.15}>
              <a href={MAPS_URL} target="_blank" rel="noopener" className="group block rounded-[32px] border border-papel/15 bg-noite/40 p-8 backdrop-blur-md transition-colors hover:border-ouro/50">
                <p className="font-serif text-[6.5rem] font-light leading-none">{EMPRESA.nota}</p>
                <div className="mt-3"><Estrelas className="size-5" /></div>
                <p className="mt-4 text-sm text-papel/75">Avaliação no Google</p>
                <p className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-ouro-claro">Ver avaliações <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden /></p>
              </a>
            </Reveal>
          </div>
        </section>

        {/* ================= PROCESSO ================= */}
        <section id="processo" className="relative py-24 sm:py-36">
          <div className={wrap}>
            <Reveal className="mx-auto mb-16 max-w-2xl text-center">
              <p className={`${rotulo} text-pedra`}>Como funciona</p>
              <h2 className="mt-4 font-serif text-[2.6rem] font-light leading-[1.02] tracking-tight sm:text-7xl">Do primeiro café ao <em className="italic text-salvia-esc">grande dia</em>.</h2>
            </Reveal>
            <div data-progress className="relative mx-auto max-w-4xl">
              <span aria-hidden className="absolute bottom-0 left-6 top-0 w-px bg-tinta/10 md:left-1/2" />
              <span aria-hidden className="fio-v absolute bottom-0 left-6 top-0 w-px bg-ouro md:left-1/2" />
              <ol className="space-y-14">
                {PROCESSO.map(([t, d], i) => (
                  <li key={t} className="relative grid grid-cols-[3rem_1fr] gap-6 md:grid-cols-2 md:gap-16">
                    <span className="absolute left-6 top-1 z-10 grid size-12 -translate-x-1/2 place-items-center rounded-full border border-ouro bg-papel font-serif text-xl italic text-ouro md:left-1/2">{['I', 'II', 'III', 'IV'][i]}</span>
                    <Reveal className={`col-start-2 row-start-1 pt-1 ${i % 2 ? 'md:pl-12' : 'md:col-start-1 md:pr-12 md:text-right'}`}>
                      <h3 className="font-serif text-3xl font-light sm:text-4xl">{t}</h3>
                      <p className="mt-2 text-[1.0625rem] leading-relaxed text-pedra">{d}</p>
                    </Reveal>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ================= ORÇAMENTO ================= */}
        <section id="orcamento" className="relative overflow-hidden bg-linho py-24 sm:py-36">
          <div className="papel absolute inset-0" />
          <div aria-hidden className="absolute -left-40 top-20 size-[34rem] rounded-full bg-blush/60 blur-[120px]" />
          <div aria-hidden className="absolute -right-32 bottom-10 size-[30rem] rounded-full bg-salvia/25 blur-[120px]" />
          <div className={`${wrap} relative`}>
            <Reveal className="mx-auto mb-12 max-w-2xl text-center">
              <p className="font-[family-name:var(--font-script)] text-5xl text-ouro sm:text-6xl">vamos começar?</p>
              <h2 className="mt-2 font-serif text-[2.6rem] font-light leading-[1.02] tracking-tight sm:text-7xl">Simule o seu evento.</h2>
              <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-pedra sm:text-lg">Cinco perguntas rápidas e o seu pedido chega pronto no WhatsApp da Kelle.</p>
            </Reveal>
            <Reveal delay={0.1}><Orcamento /></Reveal>
          </div>
        </section>

        {/* ================= CONTATO + FAQ ================= */}
        <section id="contato" className="relative py-24 sm:py-36">
          <div className={`${wrap} grid grid-cols-1 gap-16 lg:grid-cols-2`}>
            <div>
              <Reveal>
                <p className={`${rotulo} text-pedra`}>Contato</p>
                <h2 className="mt-4 font-serif text-[2.6rem] font-light leading-[1.02] tracking-tight sm:text-6xl">Vamos tomar o <em className="italic text-salvia-esc">primeiro café</em>?</h2>
              </Reveal>
              <RevealGroup className="mt-10 space-y-4" stagger={0.1}>
                <RevealItem className="papel rounded-[32px] border border-ouro/25 bg-linho/50 p-7">
                  <Phone className="size-5 text-ouro" aria-hidden />
                  <p className={`${rotulo} mt-4 text-pedra`}>Telefone e WhatsApp</p>
                  <a href={EMPRESA.telefoneLink} className="mt-1 block font-serif text-3xl font-light hover:text-salvia-esc">{EMPRESA.telefone}</a>
                  <a href={WHATSAPP_URL} target="_blank" rel="noopener" className="mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-salvia-esc px-6 text-sm font-medium text-papel transition-transform hover:-translate-y-0.5"><IconeWhats className="size-5" /> Chamar no WhatsApp</a>
                </RevealItem>
                <RevealItem className="papel rounded-[32px] border border-ouro/25 bg-linho/50 p-7">
                  <MapPin className="size-5 text-ouro" aria-hidden />
                  <p className={`${rotulo} mt-4 text-pedra`}>Endereço</p>
                  <p className="mt-1 text-[1.0625rem] leading-relaxed">{EMPRESA.endereco}</p>
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-salvia-esc">
                    <a href={ROTA_URL} target="_blank" rel="noopener" className="hover:underline">Como chegar →</a>
                    <a href={MAPS_URL} target="_blank" rel="noopener" className="hover:underline">Ver no Google Maps →</a>
                  </div>
                </RevealItem>
                <RevealItem className="papel rounded-[32px] border border-ouro/25 bg-linho/50 p-7">
                  <Clock className="size-5 text-ouro" aria-hidden />
                  <p className={`${rotulo} mt-4 text-pedra`}>Horário de atendimento</p>
                  <div className="mt-1"><StatusAberto /></div>
                  <dl className="mt-3 space-y-1.5 text-[0.9375rem]">
                    {HORARIOS.map(([d, h]) => <div key={d} className="flex justify-between gap-4"><dt className="text-pedra">{d}</dt><dd>{h}</dd></div>)}
                  </dl>
                </RevealItem>
              </RevealGroup>
            </div>
            <div>
              <Reveal><p className={`${rotulo} text-pedra`}>Dúvidas frequentes</p></Reveal>
              <RevealGroup className="mt-6 divide-y divide-tinta/12 border-y border-tinta/12" stagger={0.06}>
                {FAQ.map(({ q, a }) => (
                  <RevealItem key={q}>
                    <details className="faq">
                      <summary className="flex min-h-16 cursor-pointer items-center justify-between gap-4 py-5 text-left font-serif text-2xl font-light sm:text-[1.75rem]">
                        {q}
                        <Plus className="seta size-5 shrink-0 text-ouro transition-transform duration-300" aria-hidden />
                      </summary>
                      <div className="corpo"><div><p className="max-w-xl pb-6 text-[1.0625rem] leading-relaxed text-pedra">{a}</p></div></div>
                    </details>
                  </RevealItem>
                ))}
              </RevealGroup>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-noite py-16 text-papel">
        <div className={`${wrap} flex flex-col items-center text-center`}>
          <Monograma className="size-20 text-ouro-claro" />
          <p className="mt-5 font-serif text-4xl font-light">Kelle Garcia</p>
          <p className="mt-1 font-[family-name:var(--font-script)] text-3xl text-ouro-claro">cerimonial</p>
          <Ornamento className="my-6 h-3 w-40 text-ouro/70" />
          <p className="text-xs leading-relaxed text-papel/55">{EMPRESA.endereco}<br />© {new Date().getFullYear()} {EMPRESA.nome}</p>
        </div>
      </footer>
      <WhatsFlutuante />
    </div>
  );
}
