import { ArrowRight, MapPin, Phone, Plus } from 'lucide-react';
import { Foto, Marquee } from '../_kit/ui';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { Magnetic } from '@/components/motion/magnetic';
import { EMPRESA, FAQ, MAPS_URL, PROCESSO, ROTA_URL, WHATSAPP_URL } from './dados';
import { Carrossel, IconeWhats, Medalhao, Ornamento, ServicosAbas, WhatsFlutuante } from './partes';
import { Orcamento } from './orcamento';

/*
 * Jéssica Fernanda — cerimonialista. Modelo "álbum": fundo creme da própria logo, ouro champagne, Marcellus (iguala as
 * capitulares da logo) + Cormorant itálico + Great Vibes; fotos 100% verticais em arcos; hero com colunas de fotos que
 * correm em sentidos opostos; portfólio em carrossel; serviços em abas com foto.
 */

const wrap = 'mx-auto w-full max-w-7xl px-5 sm:px-10';
const rotulo = 'text-[0.6875rem] font-semibold uppercase tracking-[0.28em]';
const D = 'font-[family-name:var(--font-marcel)]';
const SELO = 'JÉSSICA FERNANDA • CERIMONIALISTA • ARARAS • ';

const COLUNAS = [
  { cls: 'col-sobe', fotos: [['ipe', '55% 55%'], ['escadaria', '45% 50%'], ['igreja', '50% 50%']] },
  { cls: 'col-desce mt-16', fotos: [['veu', '50% 40%'], ['encantado', '50% 45%'], ['cachorro', '50% 55%']] },
  { cls: 'col-sobe2 hidden sm:flex', fotos: [['bolhas', '55% 40%'], ['igreja', '50% 50%'], ['ipe', '55% 55%']] },
] as const;

function Cabecalho() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-tinta/[0.06] bg-papel/85 backdrop-blur-xl">
      <div className={`${wrap} flex h-[4.5rem] items-center justify-between`}>
        <a href="#conteudo" className="flex items-center gap-3" aria-label={`${EMPRESA.nome} — início`}>
          <Foto id="logo" alt="" className="size-10 shrink-0 rounded-full sm:size-11" />
          <span className="leading-none">
            <span className={`${D} block whitespace-nowrap text-[0.9375rem] tracking-[0.06em] sm:text-lg sm:tracking-[0.08em]`}>JÉSSICA FERNANDA</span>
            <span className="mt-1 block text-[0.5rem] font-semibold tracking-[0.42em] text-ouro">CERIMONIALISTA</span>
          </span>
        </a>
        <nav className="flex items-center gap-7 text-[0.8125rem] text-tinta/75">
          <a href="#portfolio" className="hidden transition-colors hover:text-tinta md:inline">Portfólio</a>
          <a href="#servicos" className="hidden transition-colors hover:text-tinta md:inline">Serviços</a>
          <a href="#contato" className="hidden transition-colors hover:text-tinta md:inline">Contato</a>
          <a href="#orcamento" className="inline-flex h-11 items-center whitespace-nowrap rounded-full bg-cacau px-4 font-medium text-papel transition-transform hover:-translate-y-0.5 sm:px-5"><span className="sm:hidden">Orçamento</span><span className="hidden sm:inline">Fazer orçamento</span></a>
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
        claro ? 'bg-papel text-tinta shadow-[0_18px_40px_-16px_rgb(0_0_0/0.6)]' : 'bg-cacau text-papel shadow-[0_18px_40px_-16px_rgb(77_59_48/0.8)]'
      }`}
    >
      <span className="relative z-10">{children}</span>
      <ArrowRight className="relative z-10 size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
    </a>
  );
}

export default function App() {
  return (
    <div className="jes">
      <Cabecalho />
      <main id="conteudo">
        {/* ================= HERO ================= */}
        <section id="inicio" className="papel relative overflow-hidden bg-papel pt-[4.5rem]">
          <div className={`${wrap} grid min-h-[calc(100svh-4.5rem)] grid-cols-1 items-center gap-6 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10`}>
            <div className="relative z-10">
              <Medalhao className="aparece size-36 sm:size-44" texto={SELO} />
              <Reveal delay={0.3}>
                <p className={`${rotulo} mt-8 flex items-center gap-3 text-pedra`}><span className="h-px w-8 bg-ouro" aria-hidden />Cerimonial · {EMPRESA.cidade}</p>
              </Reveal>
              <Reveal delay={0.4}>
                <h1 className={`${D} mt-5 text-[2.3rem] leading-[1.08] tracking-tight sm:text-6xl lg:text-[4.2rem]`}>
                  Histórias de amor, <em className="font-serif font-light italic text-ouro">cuidadas</em> em cada detalhe.
                </h1>
              </Reveal>
              <Reveal as="p" delay={0.55} className="mt-6 max-w-lg text-[1.0625rem] leading-relaxed text-pedra sm:text-lg">
                Assessoria e cerimonial para casamentos e celebrações: do primeiro papo ao último brinde, vocês só precisam estar presentes.
              </Reveal>
              <Reveal delay={0.7} className="mt-8 flex flex-wrap items-center gap-5">
                <Magnetic><Botao>Simular meu evento</Botao></Magnetic>
                <a href="#portfolio" className="text-sm font-medium text-tinta/80 underline-offset-8 transition-colors hover:text-ouro hover:underline">Ver portfólio</a>
              </Reveal>
            </div>

            {/* colunas de fotos em movimento */}
            <div aria-hidden className="surge relative mx-auto h-[30rem] w-full max-w-[34rem] overflow-hidden mascara-v sm:h-[38rem] lg:h-[calc(100svh-8rem)] lg:max-h-[46rem]" style={{ animationDelay: '.25s' }}>
              <div className="flex h-full gap-4">
                {COLUNAS.map((c, k) => (
                  <div key={k} className={`min-w-0 flex-1 ${c.cls.includes('hidden') ? 'hidden sm:block' : ''}`}>
                    <div className={`col ${c.cls.replace('hidden sm:flex', '')}`}>
                      {[0, 1].map((g) => (
                        <div key={g} className="grupo">
                          {c.fotos.map(([img, pos], j) => (
                            <div key={`${g}-${j}`} className={`${(j + k) % 2 ? 'arco' : 'oval'} aspect-[3/4] w-full overflow-hidden shadow-[0_24px_50px_-30px_rgb(43_36_32/0.55)]`}>
                              <Foto id={img} alt="" posicao={pos} className="h-full w-full" />
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ================= MANIFESTO ================= */}
        <section id="manifesto" className="relative overflow-hidden bg-linho py-24 sm:py-36">
          <div className="papel absolute inset-0" />
          <div className="relative mx-auto max-w-3xl px-6 text-center">
            <Reveal><Ornamento className="mx-auto h-3 w-40 text-ouro" /></Reveal>
            <Reveal delay={0.1}><p className="mt-8 font-[family-name:var(--font-script)] text-6xl text-ouro sm:text-7xl">com todo o carinho</p></Reveal>
            <Reveal delay={0.2}>
              <h2 className={`${D} mt-4 text-[2rem] leading-[1.15] tracking-tight sm:text-5xl`}>
                Cada casal tem um ritmo. <em className="font-serif font-light italic text-ouro">O meu trabalho é fazer o seu dia caber nele.</em>
              </h2>
            </Reveal>
            <Reveal delay={0.3} as="p" className="mx-auto mt-8 max-w-xl text-base leading-relaxed text-pedra sm:text-lg">
              Cerimonial é presença: estar em cada detalhe para que a história de vocês seja o centro do dia.
            </Reveal>
          </div>
        </section>

        {/* ================= PORTFÓLIO ================= */}
        <section id="portfolio" className="relative py-24 sm:py-36">
          <div className={wrap}>
            <Reveal className="mx-auto mb-14 max-w-2xl text-center">
              <p className={`${rotulo} text-pedra`}>Portfólio</p>
              <h2 className={`${D} mt-4 text-[2.2rem] leading-[1.08] tracking-tight sm:text-6xl`}>Momentos <em className="font-serif font-light italic text-ouro">que ficam</em>.</h2>
              <p className="mt-5 text-base text-pedra sm:text-lg">Arraste para o lado para ver mais.</p>
            </Reveal>
          </div>
          <Carrossel />
        </section>

        {/* ================= FAIXA DE FOTO ================= */}
        <section id="faixa" data-progress className="relative h-[70svh] min-h-[28rem] overflow-hidden bg-noite text-papel">
          <div className="absolute inset-0 overflow-hidden"><Foto id="encantado" alt="" className="faixa-foto absolute inset-0" posicao="50% 40%" /></div>
          <div className="absolute inset-0 bg-gradient-to-t from-noite/90 via-noite/45 to-noite/55" />
          <div className="relative mx-auto flex h-full max-w-4xl flex-col items-center justify-center px-6 text-center">
            <Reveal>
              <p className="font-[family-name:var(--font-script)] text-6xl text-ouro-claro sm:text-7xl">cada história pede</p>
              <h2 className={`${D} mt-3 text-[2.2rem] leading-[1.1] sm:text-6xl`}>um cuidado diferente.</h2>
            </Reveal>
          </div>
        </section>

        {/* ================= SERVIÇOS ================= */}
        <section id="servicos" className="relative py-24 sm:py-36">
          <div className={wrap}>
            <Reveal className="mb-14 max-w-2xl">
              <p className={`${rotulo} text-pedra`}>Serviços</p>
              <h2 className={`${D} mt-4 text-[2.2rem] leading-[1.08] tracking-tight sm:text-6xl`}>Formas de cuidar do <em className="font-serif font-light italic text-ouro">seu dia</em>.</h2>
            </Reveal>
            <Reveal delay={0.1}><ServicosAbas /></Reveal>
          </div>
        </section>

        {/* faixa em script */}
        <div className="relative overflow-hidden border-y border-ouro/25 bg-linho py-6" aria-hidden>
          <Marquee texto="Casamentos  ·  Mini weddings  ·  Noivados  ·  Bodas  ·  Celebrações" className="font-[family-name:var(--font-script)] text-[13vw] leading-[1.3] text-ouro sm:text-[6.5vw]" />
        </div>

        {/* ================= PROCESSO ================= */}
        <section id="processo" className="relative py-24 sm:py-36">
          <div className={`${wrap} grid grid-cols-1 items-center gap-14 lg:grid-cols-[0.8fr_1.2fr]`}>
            <Reveal className="relative mx-auto w-full max-w-sm">
              <div className="arco papel relative aspect-[3/4.3] overflow-hidden shadow-[0_40px_80px_-44px_rgb(43_36_32/0.6)]">
                <Foto id="igreja" alt="Noiva com buquê de hortênsias diante da igreja" className="absolute inset-0" posicao="50% 45%" />
              </div>
            </Reveal>
            <div>
              <Reveal>
                <p className={`${rotulo} text-pedra`}>Como funciona</p>
                <h2 className={`${D} mt-4 text-[2.2rem] leading-[1.08] tracking-tight sm:text-5xl`}>Do primeiro papo ao <em className="font-serif font-light italic text-ouro">grande dia</em>.</h2>
              </Reveal>
              <div data-progress className="relative mt-10">
                <span aria-hidden className="absolute bottom-3 left-[1.35rem] top-3 w-px bg-tinta/10" />
                <span aria-hidden className="fio-v absolute bottom-3 left-[1.35rem] top-3 w-px bg-ouro" />
                <ol className="space-y-9">
                  {PROCESSO.map(([t, d], i) => (
                    <li key={t} className="relative grid grid-cols-[2.75rem_1fr] gap-5">
                      <span className="z-10 grid size-11 place-items-center rounded-full border border-ouro bg-papel font-serif text-lg italic text-ouro">{['I', 'II', 'III', 'IV'][i]}</span>
                      <Reveal className="pt-1">
                        <h3 className={`${D} text-2xl sm:text-3xl`}>{t}</h3>
                        <p className="mt-1.5 text-[1.0625rem] leading-relaxed text-pedra">{d}</p>
                      </Reveal>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </section>

        {/* ================= ORÇAMENTO ================= */}
        <section id="orcamento" className="relative overflow-hidden bg-linho py-24 sm:py-36">
          <div className="papel absolute inset-0" />
          <div aria-hidden className="absolute -left-40 top-20 size-[34rem] rounded-full bg-blush/70 blur-[120px]" />
          <div aria-hidden className="absolute -right-32 bottom-10 size-[30rem] rounded-full bg-ouro-claro/30 blur-[120px]" />
          <div className={`${wrap} relative`}>
            <Reveal className="mx-auto mb-12 max-w-2xl text-center">
              <p className="font-[family-name:var(--font-script)] text-6xl text-ouro sm:text-7xl">vamos começar?</p>
              <h2 className={`${D} mt-2 text-[2.2rem] leading-[1.08] tracking-tight sm:text-5xl`}>Simule o seu evento.</h2>
              <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-pedra sm:text-lg">Cinco perguntas rápidas e o seu pedido chega pronto no WhatsApp da Jéssica.</p>
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
                <h2 className={`${D} mt-4 text-[2.2rem] leading-[1.08] tracking-tight sm:text-5xl`}>Vamos conversar sobre o <em className="font-serif font-light italic text-ouro">seu evento</em>?</h2>
              </Reveal>
              <RevealGroup className="mt-10 space-y-4" stagger={0.1}>
                <RevealItem className="papel rounded-[32px] border border-ouro/25 bg-linho/50 p-7">
                  <Phone className="size-5 text-ouro" aria-hidden />
                  <p className={`${rotulo} mt-4 text-pedra`}>Telefone e WhatsApp</p>
                  <a href={EMPRESA.telefoneLink} className="mt-1 block font-serif text-3xl hover:text-ouro">{EMPRESA.telefone}</a>
                  <a href={WHATSAPP_URL} target="_blank" rel="noopener" className="mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-cacau px-6 text-sm font-medium text-papel transition-transform hover:-translate-y-0.5"><IconeWhats className="size-5" /> Chamar no WhatsApp</a>
                </RevealItem>
                <RevealItem className="papel rounded-[32px] border border-ouro/25 bg-linho/50 p-7">
                  <MapPin className="size-5 text-ouro" aria-hidden />
                  <p className={`${rotulo} mt-4 text-pedra`}>Endereço</p>
                  <p className="mt-1 text-[1.0625rem] leading-relaxed">{EMPRESA.endereco}</p>
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-ouro">
                    <a href={ROTA_URL} target="_blank" rel="noopener" className="hover:underline">Como chegar →</a>
                    <a href={MAPS_URL} target="_blank" rel="noopener" className="hover:underline">Ver no Google Maps →</a>
                  </div>
                </RevealItem>
              </RevealGroup>
            </div>
            <div>
              <Reveal><p className={`${rotulo} text-pedra`}>Dúvidas frequentes</p></Reveal>
              <RevealGroup className="mt-6 divide-y divide-tinta/12 border-y border-tinta/12" stagger={0.06}>
                {FAQ.map(({ q, a }) => (
                  <RevealItem key={q}>
                    <details className="faq">
                      <summary className="flex min-h-16 cursor-pointer items-center justify-between gap-4 py-5 text-left font-[family-name:var(--font-marcel)] text-xl sm:text-2xl">
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
          <Foto id="logo" alt="Logo Jéssica Fernanda Cerimonialista" className="size-28 rounded-full" />
          <Ornamento className="my-6 h-3 w-40 text-ouro/70" />
          <p className="text-xs leading-relaxed text-papel/55">{EMPRESA.endereco}<br />© {new Date().getFullYear()} {EMPRESA.nome} Cerimonialista</p>
        </div>
      </footer>
      <WhatsFlutuante />
    </div>
  );
}
