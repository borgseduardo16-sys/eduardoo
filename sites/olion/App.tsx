import { ArrowRight, Clock, MapPin, Phone, Plus } from 'lucide-react';
import { Foto, Marquee, ScrollHint, StickySection } from '../_kit/ui';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { SplitHeading } from '@/components/motion/split-heading';
import { Magnetic } from '@/components/motion/magnetic';
import { DESTAQUES, EMPRESA, FAQ, GALERIA, HORARIOS, MAPS_URL, ROTA_URL, WHATSAPP_URL } from './dados';
import { Arco, IconeWhats, ListaOcasioes, StatusAberto, WhatsFlutuante } from './partes';
import { Orcamento } from './orcamento';

/*
 * Casa Olion — site cinematográfico com as FOTOS REAIS do espaço. Motivo: o arco (alameda de flores).
 * Ritmo: escuro (hero) → claro → areia → dia→noite → claro → floresta → claro → noite (orçamento) → areia.
 */

const wrap = 'mx-auto w-full max-w-7xl px-5 sm:px-10';
const MANIFESTO = 'Salão envidraçado, piscina e jardim reunidos em um só lugar para o seu grande dia.';
const rotulo = 'text-[0.6875rem] font-semibold uppercase tracking-[0.26em]';

function Marca({ claro = true }: { claro?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3">
      <Arco className={`size-9 ${claro ? 'text-ouro' : 'text-ouro-esc'}`} />
      <span className="leading-none">
        <span className={`block font-serif text-2xl font-light tracking-[0.06em] ${claro ? 'text-marfim' : 'text-noite'}`}>Casa Olion</span>
        <span className={`mt-1 block text-[0.5rem] font-semibold tracking-[0.34em] ${claro ? 'text-ouro' : 'text-ouro-esc'}`}>ESPAÇO PARA EVENTOS</span>
      </span>
    </span>
  );
}

const Botao = ({ href, children, tamanho = 'md', ...r }: { href: string; children: React.ReactNode; tamanho?: 'md' | 'lg' } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
  <a
    href={href}
    {...r}
    className={`k-shine group inline-flex items-center justify-center gap-3 rounded-full bg-ouro font-semibold text-noite shadow-[0_18px_50px_-14px_rgb(220_192_138/0.55)] transition-[transform,box-shadow] duration-300 ease-[var(--ease-out-soft)] hover:-translate-y-0.5 active:scale-[0.98] ${tamanho === 'lg' ? 'h-16 px-9 text-base' : 'h-14 px-7 text-[0.9375rem]'}`}
  >
    <span className="relative z-10 inline-flex items-center gap-3">{children}</span>
  </a>
);

export default function App() {
  const palavras = MANIFESTO.split(' ');
  return (
    <div className="olion">
      {/* ================= Cabeçalho ================= */}
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/[0.07] bg-noite/90 backdrop-blur-xl">
        <div className={`${wrap} flex h-[4.5rem] items-center justify-between`}>
          <a href="#inicio" aria-label={`${EMPRESA.nome} — início`}><Marca /></a>
          <nav className="flex items-center gap-7 text-[0.8125rem] font-medium text-marfim/80">
            <a href="#espaco" className="hidden transition-colors hover:text-marfim md:inline">O espaço</a>
            <a href="#galeria" className="hidden transition-colors hover:text-marfim md:inline">Galeria</a>
            <a href="#contato" className="hidden transition-colors hover:text-marfim md:inline">Contato</a>
            <a href="#orcamento" className="inline-flex h-11 items-center rounded-full bg-ouro px-5 font-semibold text-noite transition-transform hover:-translate-y-0.5">Simular evento</a>
          </nav>
        </div>
      </header>

      <main id="conteudo">
        {/* ================= 1. HERO ================= */}
        <section id="inicio" data-progress className="relative h-[100svh] min-h-[38rem] overflow-hidden bg-noite text-marfim">
          <div className="absolute inset-0" style={{ transform: 'translate3d(0, calc(var(--p, 0) * 18%), 0)' }}>
            <Foto id="salao" alt="Salão envidraçado e piscina da Casa Olion ao entardecer" className="aproximar absolute inset-0" posicao="50% 50%" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-noite from-[6%] via-noite/70 via-[44%] to-noite/35 sm:via-noite/50 sm:to-noite/30" />
          <div className="absolute inset-0 hidden bg-gradient-to-r from-noite/75 via-noite/10 to-transparent sm:block" />

          <div className={`${wrap} relative z-10 flex h-full flex-col justify-end pb-16 sm:pb-20`}>
            <div className="max-w-3xl space-y-6">
              <Reveal delay={0.5}>
                <p className={`${rotulo} flex items-center gap-3 text-ouro`}>
                  <span className="h-px w-8 bg-ouro" aria-hidden />
                  Espaço para eventos · {EMPRESA.cidade}
                </p>
              </Reveal>
              <SplitHeading
                text="O cenário perfeito para os dias que você nunca vai esquecer."
                delay={0.6}
                className="font-serif text-[2.4rem] font-light leading-[1.02] tracking-[-0.02em] sm:text-7xl lg:text-[5.4rem]"
              />
              <Reveal as="p" delay={1.1} className="max-w-xl text-[0.9375rem] leading-relaxed text-marfim/80 sm:text-lg">
                Casamentos, aniversários e festas no salão envidraçado, ao lado da piscina e do jardim da Casa Olion.
              </Reveal>
              <Reveal delay={1.25} className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <Magnetic><Botao href="#orcamento" tamanho="lg">Simular meu evento <ArrowRight className="size-5" aria-hidden /></Botao></Magnetic>
                <a href={WHATSAPP_URL} target="_blank" rel="noopener" className="inline-flex h-12 items-center gap-2 text-sm font-medium text-marfim/85 transition-colors hover:text-ouro">
                  <IconeWhats className="size-4" /> ou chame no WhatsApp
                </a>
              </Reveal>
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-6 z-10 hidden justify-center text-marfim md:flex"><ScrollHint href="#manifesto" /></div>
        </section>

        {/* ================= 2. MANIFESTO ================= */}
        <StickySection id="manifesto" altura={220}>
          <div className="absolute inset-y-0 right-[5vw] hidden items-center lg:flex" aria-hidden>
            <Arco className="h-[70vh] w-auto text-ouro-esc/25" />
          </div>
          <div className={`${wrap} flex h-full flex-col justify-center`}>
            <p className={`${rotulo} mb-8 text-ouro-esc`}>Casa Olion</p>
            <p className="max-w-4xl font-serif text-[2.3rem] font-light leading-[1.08] tracking-tight sm:text-6xl lg:text-[4.8rem]" aria-label={MANIFESTO}>
              {palavras.map((w, i) => (
                <span key={i} aria-hidden className="palavra" style={{ ['--i' as string]: i, ['--n' as string]: palavras.length }}>{w}{' '}</span>
              ))}
            </p>
            <div className="mt-10 max-w-md"><span className="fio block h-[2px] bg-ouro-esc" /></div>
          </div>
        </StickySection>

        {/* ================= 3. O ESPAÇO (bento de fotos) ================= */}
        <section id="espaco" className="relative bg-areia/70 py-24 sm:py-32">
          <div className={wrap}>
            <Reveal className="mb-12 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
              <div>
                <p className={`${rotulo} text-ouro-esc`}>O espaço</p>
                <h2 className="mt-3 max-w-xl font-serif text-[2.6rem] font-light leading-[1.05] tracking-tight sm:text-6xl">Tudo o que o seu evento precisa de cenário.</h2>
              </div>
              <p className="max-w-xs text-sm leading-relaxed text-pedra">Fotos reais da Casa Olion. Cada ambiente pode ser combinado conforme a sua celebração.</p>
            </Reveal>
            <RevealGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6" stagger={0.08}>
              {DESTAQUES.map((d, i) => (
                <RevealItem key={d.t} className={['lg:col-span-3 lg:row-span-2', 'lg:col-span-3', 'lg:col-span-2', 'lg:col-span-2', 'lg:col-span-2', 'lg:col-span-6'][i]}>
                  <figure className={`group relative overflow-hidden rounded-[22px] ${i === 0 ? 'min-h-[22rem] lg:h-full' : i === 5 ? 'min-h-[14rem]' : 'min-h-[16rem]'}`}>
                    <Foto id={d.img} alt={d.t} posicao={d.pos} className="absolute inset-0 transition-transform duration-[1.2s] ease-[var(--ease-out-soft)] group-hover:scale-[1.05]" />
                    <div className="absolute inset-0 bg-gradient-to-t from-noite/85 via-noite/15 to-transparent" />
                    <figcaption className="absolute inset-x-0 bottom-0 p-6 text-marfim">
                      <p className="font-serif text-sm italic text-ouro">{String(i + 1).padStart(2, '0')}</p>
                      <p className="mt-1 font-serif text-2xl font-light sm:text-3xl">{d.t}</p>
                      <p className="mt-1 max-w-sm text-sm text-marfim/75">{d.d}</p>
                    </figcaption>
                  </figure>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* ================= 4. DIA → NOITE ================= */}
        <StickySection id="dia-noite" altura={320} className="hidden bg-noite text-marfim md:block">
          <Foto id="deck" alt="Deck e fachada de vidro da Casa Olion durante o dia" className="absolute inset-0" posicao="50% 55%" />
          <Foto id="noite" alt="Fachada e jardim da Casa Olion iluminados ao anoitecer" className="noite-cobre absolute inset-0" posicao="50% 55%" />
          <div className="absolute inset-0 bg-gradient-to-t from-noite/80 via-noite/10 to-noite/30" />
          <div className={`${wrap} relative h-full`}>
            <div className="dia-texto absolute inset-x-5 bottom-20 max-w-2xl sm:inset-x-10">
              <p className={`${rotulo} text-ouro`}>De dia</p>
              <h2 className="mt-4 font-serif text-5xl font-light leading-[1] tracking-tight lg:text-7xl">Luz natural, jardim e piscina.</h2>
            </div>
            <div className="noite-texto absolute inset-x-5 bottom-20 max-w-2xl sm:inset-x-10">
              <p className={`${rotulo} text-ouro`}>À noite</p>
              <h2 className="mt-4 font-serif text-5xl font-light leading-[1] tracking-tight lg:text-7xl">Luz de jardim e fachada iluminada.</h2>
              <p className="mt-5 max-w-md text-lg text-marfim/80">O mesmo lugar muda de clima quando a noite chega.</p>
            </div>
          </div>
        </StickySection>
        {/* celular: duas fotos empilhadas */}
        <section id="dia-noite-lista" className="bg-noite py-20 text-marfim md:hidden" aria-label="De dia e à noite">
          <div className={`${wrap} space-y-12`}>
            {[
              { img: 'deck', k: 'De dia', t: 'Luz natural, jardim e piscina.' },
              { img: 'noite', k: 'À noite', t: 'Luz de jardim e fachada iluminada.' },
            ].map((x) => (
              <figure key={x.img} data-progress>
                <div className="revela aspect-[4/5] overflow-hidden"><Foto id={x.img} alt={x.t} className="h-full w-full" /></div>
                <figcaption className="mt-5">
                  <p className={`${rotulo} text-ouro`}>{x.k}</p>
                  <h2 className="mt-2 font-serif text-3xl font-light leading-tight">{x.t}</h2>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* ================= 5. OCASIÕES ================= */}
        <section id="ocasioes" className="relative py-24 sm:py-32">
          <div className={wrap}>
            <Reveal className="mb-12 max-w-2xl">
              <p className={`${rotulo} text-ouro-esc`}>Para cada ocasião</p>
              <h2 className="mt-3 font-serif text-[2.6rem] font-light leading-[1.05] tracking-tight sm:text-6xl">Uma celebração, um cenário.</h2>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-pedra sm:text-lg">Toque em uma ocasião para começar a simular o seu evento.</p>
            </Reveal>
            <ListaOcasioes claro />
          </div>
        </section>

        {/* ================= 6. GALERIA (trilho horizontal no desktop) ================= */}
        <StickySection id="galeria" altura={560} className="hidden bg-floresta text-marfim md:block">
          <div className="flex h-full flex-col justify-center">
            <div className={`${wrap} mb-8 flex items-end justify-between`}>
              <div>
                <p className={`${rotulo} text-ouro`}>Galeria</p>
                <h2 className="mt-3 font-serif text-5xl font-light tracking-tight lg:text-6xl">Conheça a Casa Olion.</h2>
              </div>
              <div className="w-48"><span className="fio block h-[2px] bg-ouro" /></div>
            </div>
            <div className="trilho flex gap-[4vw] px-[8vw]">
              {GALERIA.map((p, i) => (
                <figure key={p.img} className="group relative h-[62vh] w-[56vw] shrink-0 overflow-hidden rounded-[22px]">
                  <Foto id={p.img} alt={p.titulo} posicao={p.pos} className="absolute inset-0 transition-transform duration-[1.2s] ease-[var(--ease-out-soft)] group-hover:scale-[1.04]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-noite/90 via-noite/10 to-transparent" />
                  <figcaption className="absolute inset-x-0 bottom-0 p-8">
                    <p className="font-serif text-sm italic text-ouro">{String(i + 1).padStart(2, '0')} / {String(GALERIA.length).padStart(2, '0')}</p>
                    <h3 className="mt-2 max-w-md font-serif text-3xl font-light lg:text-4xl">{p.titulo}</h3>
                    <p className="mt-2 max-w-md text-[0.9375rem] text-marfim/75">{p.texto}</p>
                    {p.credito && <p className="mt-3 text-xs text-marfim/50">{p.credito}</p>}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </StickySection>
        <section id="galeria-lista" className="bg-floresta py-20 text-marfim md:hidden" aria-labelledby="galeria-titulo">
          <div className={wrap}>
            <p className={`${rotulo} text-ouro`}>Galeria</p>
            <h2 id="galeria-titulo" className="mt-3 font-serif text-[2.6rem] font-light tracking-tight">Conheça a Casa Olion.</h2>
            <div className="mt-10 space-y-14">
              {GALERIA.map((p, i) => (
                <figure key={p.img} data-progress>
                  <div className="revela arco-s aspect-[4/5] overflow-hidden"><Foto id={p.img} alt={p.titulo} posicao={p.pos} className="h-full w-full" /></div>
                  <figcaption className="mt-5">
                    <p className="font-serif text-sm italic text-ouro">{String(i + 1).padStart(2, '0')}</p>
                    <h3 className="mt-1 font-serif text-2xl font-light">{p.titulo}</h3>
                    <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-marfim/70">{p.texto}</p>
                    {p.credito && <p className="mt-2 text-xs text-marfim/50">{p.credito}</p>}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* faixa */}
        <div className="relative overflow-hidden border-y border-noite/10 bg-marfim py-8" aria-hidden>
          <Marquee texto="CASAMENTOS  ·  ANIVERSÁRIOS  ·  FESTAS  ·  FORMATURAS  ·  CONFRATERNIZAÇÕES" className="k-outline font-sans text-[10vw] font-extrabold leading-none text-noite/45 sm:text-[5.2vw]" />
        </div>

        {/* ================= 7. PROCESSO ================= */}
        <section id="processo" className="relative py-24 sm:py-32">
          <div className={wrap}>
            <Reveal className="max-w-2xl">
              <p className={`${rotulo} text-ouro-esc`}>Como funciona</p>
              <h2 className="mt-3 font-serif text-[2.6rem] font-light leading-[1.05] tracking-tight sm:text-6xl">Do primeiro contato ao grande dia.</h2>
            </Reveal>
            <RevealGroup as="ol" className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-[24px] border border-noite/15 bg-noite/15 sm:grid-cols-2 lg:grid-cols-4" stagger={0.1}>
              {[
                ['Simule', 'Conte sobre o evento no orçamento online e envie pelo WhatsApp.'],
                ['Conheça', 'Combine uma visita para ver o espaço de perto, no horário de atendimento.'],
                ['Combine', 'Defina data, ambientes e serviços com a equipe da Casa Olion.'],
                ['Celebre', 'No grande dia, é só aproveitar o cenário.'],
              ].map(([t, d], i) => (
                <RevealItem as="li" key={t} className="group relative bg-marfim p-8 transition-colors duration-500 hover:bg-areia/60">
                  <span className="font-serif text-sm italic text-ouro-esc">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="mt-6 font-serif text-3xl font-light">{t}</h3>
                  <p className="mt-3 text-[0.9375rem] leading-relaxed text-pedra">{d}</p>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* ================= 8. ORÇAMENTO ================= */}
        <section id="orcamento" className="relative overflow-hidden bg-noite py-24 text-marfim sm:py-32">
          <div aria-hidden className="absolute -left-40 top-10 size-[34rem] rounded-full bg-ouro/10 blur-[130px]" />
          <div aria-hidden className="absolute right-[4vw] top-1/2 hidden -translate-y-1/2 lg:block"><Arco className="h-[60vh] w-auto text-ouro/12" /></div>
          <div className={`${wrap} relative`}>
            <Reveal className="mx-auto mb-12 max-w-2xl text-center">
              <p className={`${rotulo} text-ouro`}>Orçamento online</p>
              <h2 className="mt-4 font-serif text-[2.6rem] font-light leading-[1.05] tracking-tight sm:text-6xl">Simule o seu evento em 1 minuto.</h2>
              <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-marfim/70 sm:text-lg">Responda algumas perguntas e envie pelo WhatsApp. A equipe responde com os próximos passos.</p>
            </Reveal>
            <Reveal delay={0.1}><Orcamento /></Reveal>
          </div>
        </section>

        {/* ================= 9. CONTATO + FAQ ================= */}
        <section id="contato" className="relative bg-areia/60 py-24 sm:py-32">
          <div className={`${wrap} grid grid-cols-1 gap-14 lg:grid-cols-[1fr_1fr]`}>
            <div>
              <Reveal>
                <p className={`${rotulo} text-ouro-esc`}>Contato</p>
                <h2 className="mt-3 font-serif text-[2.6rem] font-light leading-[1.05] tracking-tight sm:text-6xl">Vamos conversar sobre o seu evento?</h2>
              </Reveal>
              <RevealGroup className="mt-10 space-y-3" stagger={0.1}>
                <RevealItem className="rounded-[20px] border border-noite/15 bg-marfim p-6">
                  <Phone className="size-5 text-ouro-esc" aria-hidden />
                  <p className="mt-4 text-xs uppercase tracking-[0.2em] text-pedra">Telefone e WhatsApp</p>
                  <a href={EMPRESA.telefoneLink} className="mt-1 block text-xl font-medium hover:text-ouro-esc">{EMPRESA.telefone}</a>
                  <div className="mt-4"><Botao href={WHATSAPP_URL} target="_blank" rel="noopener"><IconeWhats className="size-5" /> Chamar no WhatsApp</Botao></div>
                </RevealItem>
                <RevealItem className="rounded-[20px] border border-noite/15 bg-marfim p-6">
                  <MapPin className="size-5 text-ouro-esc" aria-hidden />
                  <p className="mt-4 text-xs uppercase tracking-[0.2em] text-pedra">Endereço</p>
                  <p className="mt-1 leading-relaxed">{EMPRESA.endereco}</p>
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                    <a href={ROTA_URL} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ouro-esc hover:underline">Como chegar <ArrowRight className="size-3.5" aria-hidden /></a>
                    <a href={MAPS_URL} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ouro-esc hover:underline">Ver no Google Maps <ArrowRight className="size-3.5" aria-hidden /></a>
                  </div>
                </RevealItem>
                <RevealItem className="rounded-[20px] border border-noite/15 bg-marfim p-6">
                  <Clock className="size-5 text-ouro-esc" aria-hidden />
                  <p className="mt-4 text-xs uppercase tracking-[0.2em] text-pedra">Horário de atendimento</p>
                  <div className="mt-1"><StatusAberto /></div>
                  <dl className="mt-3 space-y-1.5 text-sm">
                    {HORARIOS.map(([d, h]) => <div key={d} className="flex justify-between gap-4"><dt className="text-pedra">{d}</dt><dd>{h}</dd></div>)}
                  </dl>
                  <p className="mt-3 text-xs text-pedra">Em feriados os horários podem mudar.</p>
                </RevealItem>
              </RevealGroup>
            </div>
            <div>
              <Reveal><p className={`${rotulo} text-ouro-esc`}>Dúvidas frequentes</p></Reveal>
              <RevealGroup className="mt-6 divide-y divide-noite/15 border-y border-noite/15" stagger={0.06}>
                {FAQ.map(({ q, a }) => (
                  <RevealItem key={q}>
                    <details className="faq">
                      <summary className="flex min-h-16 cursor-pointer items-center justify-between gap-4 py-4 text-left font-serif text-xl font-light sm:text-2xl">
                        {q}
                        <Plus className="seta size-5 shrink-0 text-ouro-esc transition-transform duration-300" aria-hidden />
                      </summary>
                      <div className="corpo"><div><p className="max-w-xl pb-5 text-[0.9375rem] leading-relaxed text-pedra sm:text-base">{a}</p></div></div>
                    </details>
                  </RevealItem>
                ))}
              </RevealGroup>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-noite text-marfim">
        <div className={`${wrap} flex flex-col items-start justify-between gap-6 py-10 sm:flex-row sm:items-center`}>
          <Marca />
          <p className="text-xs leading-relaxed text-marfim/55">© {new Date().getFullYear()} {EMPRESA.nome} · {EMPRESA.cidade}</p>
        </div>
      </footer>
      <WhatsFlutuante />
    </div>
  );
}
