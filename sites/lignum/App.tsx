import { ArrowRight, Clock, MapPin, Phone, Plus } from 'lucide-react';
import { Foto, Marquee, ScrollHint, StickySection } from '../_kit/ui';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { SplitHeading } from '@/components/motion/split-heading';
import { Magnetic } from '@/components/motion/magnetic';
import { DESTAQUES, EMPRESA, FAQ, HORARIOS, MAPS_URL, PROJETOS, ROTA_URL, WHATSAPP_URL } from './dados';
import { Acabamentos, IconeWhats, ListaAmbientes, MarcaChevrons, StatusAberto, WhatsFlutuante } from './partes';
import { Orcamento } from './orcamento';

/*
 * Lignum Móveis Planejados — site cinematográfico com as FOTOS REAIS dos projetos do cliente.
 * Luz do dia (papel + madeira) alternando com seções escuras; a marca (dois chevrons) e o ripado são os motivos.
 */

const wrap = 'mx-auto w-full max-w-7xl px-5 sm:px-10';
const MANIFESTO = 'Acabamento impecável, atendimento atencioso e móveis de alto padrão.';
const rotulo = 'text-[0.6875rem] font-semibold uppercase tracking-[0.26em]';

function Logo({ escuro = true }: { escuro?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3">
      <Foto id="logo" alt="" className="size-10 rounded-full sm:size-11" />
      <span className="leading-none">
        <span className={`block font-serif text-xl font-medium tracking-[0.04em] ${escuro ? 'text-paper' : 'text-ink'}`}>Lignum</span>
        <span className={`mt-1 block text-[0.5rem] font-semibold tracking-[0.34em] ${escuro ? 'text-ouro' : 'text-ouro-esc'}`}>MÓVEIS PLANEJADOS</span>
      </span>
    </span>
  );
}

const BtnPrim = ({ href, children, tamanho = 'md', ...r }: { href: string; children: React.ReactNode; tamanho?: 'md' | 'lg' } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
  <a
    href={href}
    {...r}
    className={`k-shine group inline-flex items-center justify-center gap-3 rounded-full bg-ouro font-semibold text-ink shadow-[0_18px_50px_-14px_rgb(232_200_103/0.6)] transition-[transform,box-shadow] duration-300 ease-[var(--ease-out-soft)] hover:-translate-y-0.5 active:scale-[0.98] ${tamanho === 'lg' ? 'h-16 px-9 text-base' : 'h-14 px-7 text-[0.9375rem]'}`}
  >
    <span className="relative z-10 inline-flex items-center gap-3">{children}</span>
  </a>
);

export default function App() {
  const palavras = MANIFESTO.split(' ');
  return (
    <div className="lig">
      {/* ================= Cabeçalho ================= */}
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/[0.07] bg-ink/90 backdrop-blur-xl">
        <div className={`${wrap} flex h-[4.5rem] items-center justify-between`}>
          <a href="#inicio" aria-label={`${EMPRESA.nome} — início`}><Logo /></a>
          <nav className="flex items-center gap-7 text-[0.8125rem] font-medium text-paper/80">
            <a href="#projetos" className="hidden transition-colors hover:text-paper md:inline">Projetos</a>
            <a href="#acabamentos" className="hidden transition-colors hover:text-paper md:inline">Acabamentos</a>
            <a href="#contato" className="hidden transition-colors hover:text-paper md:inline">Contato</a>
            <a href="#orcamento" className="inline-flex h-11 items-center rounded-full bg-ouro px-5 font-semibold text-ink transition-transform hover:-translate-y-0.5">Orçamento online</a>
          </nav>
        </div>
      </header>

      <main id="conteudo">
        {/* ================= 1. HERO ================= */}
        <section id="inicio" data-progress className="relative h-[100svh] min-h-[38rem] overflow-hidden bg-ink text-paper">
          <div className="absolute inset-0" style={{ transform: 'translate3d(0, calc(var(--p, 0) * 18%), 0)' }}>
            <Foto id="cozinha" alt="Cozinha planejada em L com armários brancos e em madeira e fitas de LED, projeto Lignum" className="aproximar absolute inset-0" posicao="50% 44%" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-ink from-[8%] via-ink/55 via-[48%] to-ink/35" />
          <div className="absolute inset-0 hidden bg-gradient-to-r from-ink/70 via-transparent to-transparent sm:block" />
          <div className="cortina pointer-events-none absolute inset-0" aria-hidden>
            {Array.from({ length: 10 }).map((_, i) => (
              <i key={i} style={{ left: `${i * 10}%`, width: '10.1%', animationDelay: `${0.25 + i * 0.07}s` }} />
            ))}
          </div>

          <div className={`${wrap} relative z-10 flex h-full flex-col justify-end pb-16 sm:pb-20`}>
            <MarcaChevrons className="mb-6 size-14 text-ouro sm:size-16" />
            <div className="max-w-3xl space-y-6">
              <Reveal delay={0.9}>
                <p className={`${rotulo} flex items-center gap-3 text-ouro`}>
                  <span className="h-px w-8 bg-ouro" aria-hidden />
                  Móveis planejados · {EMPRESA.cidade}
                </p>
              </Reveal>
              <SplitHeading
                text="Móveis planejados com acabamento de alto padrão."
                delay={1.0}
                className="font-serif text-[2.4rem] font-light leading-[1.02] tracking-[-0.02em] sm:text-7xl lg:text-[5.4rem]"
              />
              <Reveal as="p" delay={1.5} className="max-w-xl text-[0.9375rem] leading-relaxed text-paper/80 sm:text-lg">
                Cozinhas, painéis ripados, racks e lavatórios feitos sob medida, com iluminação e detalhes pensados para o seu ambiente.
              </Reveal>
              <Reveal delay={1.65} className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <Magnetic><BtnPrim href="#orcamento" tamanho="lg">Montar meu orçamento <ArrowRight className="size-5" aria-hidden /></BtnPrim></Magnetic>
                <a href={WHATSAPP_URL} target="_blank" rel="noopener" className="inline-flex h-12 items-center gap-2 text-sm font-medium text-paper/85 transition-colors hover:text-ouro">
                  <IconeWhats className="size-4" /> ou chame no WhatsApp
                </a>
              </Reveal>
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-6 z-10 hidden justify-center text-paper md:flex"><ScrollHint href="#manifesto" /></div>
        </section>

        {/* ================= 2. MANIFESTO ================= */}
        <StickySection id="manifesto" altura={220}>
          <div className="ripado absolute inset-y-0 right-0 w-[16vw] [mask-image:linear-gradient(to_left,#000,transparent)]" aria-hidden />
          <div className={`${wrap} flex h-full flex-col justify-center`}>
            <p className={`${rotulo} mb-8 text-ouro-esc`}>O que dizem sobre a Lignum</p>
            <p className="max-w-5xl font-serif text-[2.3rem] font-light leading-[1.08] tracking-tight sm:text-6xl lg:text-[5.2rem]" aria-label={MANIFESTO}>
              {palavras.map((w, i) => (
                <span key={i} aria-hidden className="palavra" style={{ ['--i' as string]: i, ['--n' as string]: palavras.length }}>{w}{' '}</span>
              ))}
            </p>
            <div className="mt-10 max-w-md">
              <span className="fio block h-[2px] bg-ouro-esc" />
              <p className="mt-4 text-sm text-pedra">Resumo das avaliações dos clientes no Google.</p>
            </div>
          </div>
        </StickySection>

        {/* ================= 3. AMBIENTES ================= */}
        <section id="ambientes" className="relative bg-areia/60 py-24 sm:py-32">
          <div className={wrap}>
            <Reveal className="mb-12 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
              <div>
                <p className={`${rotulo} text-ouro-esc`}>O que fazemos</p>
                <h2 className="mt-3 max-w-xl font-serif text-[2.6rem] font-light leading-[1.05] tracking-tight sm:text-6xl">Cada ambiente, planejado para o seu espaço.</h2>
              </div>
              <p className="max-w-xs text-sm leading-relaxed text-pedra">Toque em um ambiente para começar o seu orçamento.</p>
            </Reveal>
            <ListaAmbientes />
          </div>
        </section>

        {/* ================= 4. PROJETOS (trilho horizontal no desktop) ================= */}
        <StickySection id="projetos" altura={480} className="hidden bg-ink text-paper md:block">
          <div className="flex h-full flex-col justify-center">
            <div className={`${wrap} mb-8 flex items-end justify-between`}>
              <div>
                <p className={`${rotulo} text-ouro`}>Projetos entregues</p>
                <h2 className="mt-3 font-serif text-5xl font-light tracking-tight lg:text-6xl">Feito pela Lignum.</h2>
              </div>
              <div className="w-48"><span className="fio block h-[2px] bg-ouro" /></div>
            </div>
            <div className="trilho flex gap-[4vw] px-[8vw]">
              {PROJETOS.map((p, i) => (
                <figure key={p.img} className="group relative h-[62vh] w-[62vw] shrink-0 overflow-hidden rounded-[22px]">
                  <Foto id={p.img} alt={p.titulo} posicao={p.pos} className="absolute inset-0 transition-transform duration-[1.2s] ease-[var(--ease-out-soft)] group-hover:scale-[1.04]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/10 to-transparent" />
                  <figcaption className="absolute inset-x-0 bottom-0 p-8">
                    <p className="font-serif text-sm italic text-ouro">{String(i + 1).padStart(2, '0')} / {String(PROJETOS.length).padStart(2, '0')}</p>
                    <h3 className="mt-2 max-w-md font-serif text-3xl font-light lg:text-4xl">{p.titulo}</h3>
                    <p className="mt-2 max-w-md text-[0.9375rem] text-paper/75">{p.texto}</p>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </StickySection>

        {/* Celular: lista vertical */}
        <section id="projetos-lista" className="bg-ink py-20 text-paper md:hidden" aria-labelledby="projetos-titulo">
          <div className={wrap}>
            <p className={`${rotulo} text-ouro`}>Projetos entregues</p>
            <h2 id="projetos-titulo" className="mt-3 font-serif text-[2.6rem] font-light tracking-tight">Feito pela Lignum.</h2>
            <div className="mt-10 space-y-14">
              {PROJETOS.map((p, i) => (
                <figure key={p.img} data-progress>
                  <div className="revela aspect-[4/5] overflow-hidden"><Foto id={p.img} alt={p.titulo} posicao={p.pos} className="h-full w-full" /></div>
                  <figcaption className="mt-5">
                    <p className="font-serif text-sm italic text-ouro">{String(i + 1).padStart(2, '0')}</p>
                    <h3 className="mt-1 font-serif text-2xl font-light">{p.titulo}</h3>
                    <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-paper/70">{p.texto}</p>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* ================= 5. ACABAMENTOS ================= */}
        <section id="acabamentos" className="relative py-24 sm:py-32">
          <div className={wrap}>
            <Reveal className="mb-12 max-w-2xl">
              <p className={`${rotulo} text-ouro-esc`}>Acabamentos</p>
              <h2 className="mt-3 font-serif text-[2.6rem] font-light leading-[1.05] tracking-tight sm:text-6xl">O detalhe que se vê e se sente.</h2>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-pedra sm:text-lg">Amostras ampliadas dos próprios projetos. Escolha um acabamento para ver de perto.</p>
            </Reveal>
            <Acabamentos />
          </div>
        </section>

        {/* ================= 6. DETALHE (a foto cresce) ================= */}
        <StickySection id="detalhe" altura={260} className="bg-ink text-paper">
          <div className="zoom-foto absolute inset-0 overflow-hidden">
            <Foto id="rack" alt="Rack suspenso com frente ripada e painel amadeirado iluminado, projeto Lignum" className="absolute inset-0" posicao="50% 60%" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/20 to-transparent" />
          </div>
          <div className={`${wrap} zoom-texto relative flex h-full items-end pb-20`}>
            <div className="max-w-2xl">
              <p className={`${rotulo} text-ouro`}>Detalhe</p>
              <h2 className="mt-4 font-serif text-5xl font-light leading-[1] tracking-tight sm:text-7xl">Cada ripa no seu lugar.</h2>
              <p className="mt-5 max-w-md text-base leading-relaxed text-paper/80 sm:text-lg">Alinhamento, vãos e iluminação pensados juntos: é o que dá o acabamento que os clientes elogiam.</p>
            </div>
          </div>
        </StickySection>

        {/* faixa */}
        <div className="relative overflow-hidden border-y border-ink/10 bg-paper py-8" aria-hidden>
          <Marquee texto="COZINHAS  ·  PAINÉIS  ·  RACKS  ·  LAVATÓRIOS  ·  SOB MEDIDA" className="k-outline font-sans text-[10vw] font-extrabold leading-none text-ink/55 sm:text-[5.5vw]" />
        </div>

        {/* ================= 7. PROCESSO ================= */}
        <section id="processo" className="relative py-24 sm:py-32">
          <div className={wrap}>
            <Reveal className="max-w-2xl">
              <p className={`${rotulo} text-ouro-esc`}>Como funciona</p>
              <h2 className="mt-3 font-serif text-[2.6rem] font-light leading-[1.05] tracking-tight sm:text-6xl">Da primeira conversa à instalação.</h2>
            </Reveal>
            <RevealGroup as="ol" className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-[24px] border border-ink/15 bg-ink/15 sm:grid-cols-2 lg:grid-cols-4" stagger={0.1}>
              {[
                ['Conversa', 'Você monta o pedido no site e envia pelo WhatsApp. A equipe retorna por lá.'],
                ['Medição e projeto', 'Definimos medidas, acabamentos e iluminação do seu ambiente.'],
                ['Produção', 'O móvel é produzido sob medida, com o acabamento que você escolheu.'],
                ['Instalação', 'Montagem cuidadosa no local, deixando tudo no lugar.'],
              ].map(([t, d], i) => (
                <RevealItem as="li" key={t} className="group relative bg-paper p-8 transition-colors duration-500 hover:bg-areia/50">
                  <span className="font-serif text-sm italic text-ouro-esc">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="mt-6 font-serif text-3xl font-light">{t}</h3>
                  <p className="mt-3 text-[0.9375rem] leading-relaxed text-pedra">{d}</p>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* ================= 8. ORÇAMENTO ONLINE ================= */}
        <section id="orcamento" className="relative overflow-hidden bg-ink py-24 text-paper sm:py-32">
          <div aria-hidden className="ripado-esc absolute inset-y-0 left-0 w-[14vw] [mask-image:linear-gradient(to_right,#000,transparent)]" />
          <div aria-hidden className="absolute -right-40 top-10 size-[34rem] rounded-full bg-ouro/10 blur-[130px]" />
          <div className={`${wrap} relative`}>
            <Reveal className="mx-auto mb-12 max-w-2xl text-center">
              <p className={`${rotulo} text-ouro`}>Orçamento online</p>
              <h2 className="mt-4 font-serif text-[2.6rem] font-light leading-[1.05] tracking-tight sm:text-6xl">Monte seu pedido em 1 minuto.</h2>
              <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-paper/70 sm:text-lg">Responda algumas perguntas e envie pelo WhatsApp. A equipe retorna com o próximo passo.</p>
            </Reveal>
            <Reveal delay={0.1}><Orcamento /></Reveal>
          </div>
        </section>

        {/* ================= 9. AVALIAÇÕES ================= */}
        <section id="avaliacoes" className="relative py-24 sm:py-32">
          <div className={`${wrap} grid grid-cols-1 gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center`}>
            <Reveal>
              <p className={`${rotulo} text-ouro-esc`}>Avaliações no Google</p>
              <h2 className="mt-3 font-serif text-[2.6rem] font-light leading-[1.05] tracking-tight sm:text-6xl">O que os clientes destacam.</h2>
              <a href={MAPS_URL} target="_blank" rel="noopener" className="mt-8 inline-flex items-center gap-2 text-sm font-medium underline-offset-8 hover:text-ouro-esc hover:underline">
                Ver avaliações no Google <ArrowRight className="size-4" aria-hidden />
              </a>
            </Reveal>
            <RevealGroup as="ul" className="grid grid-cols-1 gap-4" stagger={0.12}>
              {DESTAQUES.map((d, i) => (
                <RevealItem as="li" key={d} className="flex items-center gap-5 rounded-[22px] border border-ink/15 bg-areia/40 p-6 sm:p-7">
                  <span className="font-serif text-4xl font-light italic text-ouro-esc">{String(i + 1).padStart(2, '0')}</span>
                  <span className="font-serif text-2xl font-light leading-snug sm:text-3xl">{d}</span>
                </RevealItem>
              ))}
              <li className="px-1 text-xs text-pedra">Resumo gerado pelo Google a partir das avaliações dos clientes.</li>
            </RevealGroup>
          </div>
        </section>

        {/* ================= 10. FAQ + CONTATO ================= */}
        <section id="contato" className="relative border-t border-ink/10 bg-areia/40 py-24 sm:py-32">
          <div className={`${wrap} grid grid-cols-1 gap-14 lg:grid-cols-[1fr_1fr]`}>
            <div>
              <Reveal>
                <p className={`${rotulo} text-ouro-esc`}>Contato</p>
                <h2 className="mt-3 font-serif text-[2.6rem] font-light leading-[1.05] tracking-tight sm:text-6xl">Vamos conversar sobre o seu projeto?</h2>
              </Reveal>
              <RevealGroup className="mt-10 space-y-3" stagger={0.1}>
                <RevealItem className="rounded-[20px] border border-ink/15 bg-paper p-6">
                  <Phone className="size-5 text-ouro-esc" aria-hidden />
                  <p className="mt-4 text-xs uppercase tracking-[0.2em] text-pedra">Telefone e WhatsApp</p>
                  <a href={EMPRESA.telefoneLink} className="mt-1 block text-xl font-medium hover:text-ouro-esc">{EMPRESA.telefone}</a>
                  <div className="mt-4"><BtnPrim href={WHATSAPP_URL} target="_blank" rel="noopener"><IconeWhats className="size-5" /> Chamar no WhatsApp</BtnPrim></div>
                </RevealItem>
                <RevealItem className="rounded-[20px] border border-ink/15 bg-paper p-6">
                  <MapPin className="size-5 text-ouro-esc" aria-hidden />
                  <p className="mt-4 text-xs uppercase tracking-[0.2em] text-pedra">Endereço</p>
                  <p className="mt-1 leading-relaxed">{EMPRESA.endereco}</p>
                  <a href={ROTA_URL} target="_blank" rel="noopener" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ouro-esc hover:underline">Como chegar <ArrowRight className="size-3.5" aria-hidden /></a>
                </RevealItem>
                <RevealItem className="rounded-[20px] border border-ink/15 bg-paper p-6">
                  <Clock className="size-5 text-ouro-esc" aria-hidden />
                  <p className="mt-4 text-xs uppercase tracking-[0.2em] text-pedra">Horário</p>
                  <div className="mt-1"><StatusAberto /></div>
                  <dl className="mt-3 space-y-1.5 text-sm">
                    {HORARIOS.map(([d, h]) => <div key={d} className="flex justify-between gap-4"><dt className="text-pedra">{d}</dt><dd>{h}</dd></div>)}
                  </dl>
                </RevealItem>
              </RevealGroup>
            </div>
            <div>
              <Reveal><p className={`${rotulo} text-ouro-esc`}>Dúvidas frequentes</p></Reveal>
              <RevealGroup className="mt-6 divide-y divide-ink/15 border-y border-ink/15" stagger={0.06}>
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

      <footer className="bg-ink text-paper">
        <div className={`${wrap} flex flex-col items-start justify-between gap-6 py-10 sm:flex-row sm:items-center`}>
          <Logo />
          <p className="text-xs leading-relaxed text-paper/55">© {new Date().getFullYear()} {EMPRESA.nome} · {EMPRESA.cidade}</p>
        </div>
      </footer>
      <WhatsFlutuante />
    </div>
  );
}
