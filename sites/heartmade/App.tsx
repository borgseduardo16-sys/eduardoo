import { ArrowRight, MapPin, Phone, Plus } from 'lucide-react';
import { Foto, Marquee } from '../_kit/ui';
import { Reveal } from '@/components/motion/reveal';
import { Magnetic } from '@/components/motion/magnetic';
import { EMPRESA, ROTA_URL, urlWhats } from './textos';
import { LinguaProvider, useT } from './lingua';
import { Coracao, DiaNoite, Estilos, IconeWhats, Logo, Palavras, Rolo, Servicos, TrocaLingua, WhatsFlutuante } from './partes';
import { Proposta } from './proposta';

/*
 * Heartmade | Weddings & Events (Funchal, Madeira). Modelo "álbum de película", bilingue PT/EN: marfim, veludo
 * verde-oliva, dourado do letreiro e noite de jardim; Bodoni Moda + Cormorant. Hero com provas fotográficas sobre a
 * mesa e o coração a desenhar-se; o mesmo jardim de dia → noite com a rolagem; rolo de filme horizontal; serviços com
 * foto fixa que troca; estilos em separadores; pedido de proposta bilingue por WhatsApp.
 */

const wrap = 'mx-auto w-full max-w-[88rem] px-5 sm:px-10 lg:px-16';
const rotulo = 'text-[0.6875rem] font-semibold uppercase tracking-[0.3em]';
const B = 'font-[family-name:var(--font-bd)]';
const C = 'font-[family-name:var(--font-cg)]';

function Cabecalho() {
  const t = useT().nav;
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-tinta/[0.07] bg-marfim/85 backdrop-blur-xl">
      <div className={`${wrap} flex h-[4.5rem] items-center justify-between gap-3`}>
        <a href="#inicio" aria-label="Heartmade — início"><Logo /></a>
        <nav className="flex items-center gap-2 text-[0.8125rem] text-tinta/75 sm:gap-3 lg:gap-8">
          <a href="#historias" className="hidden transition-colors hover:text-tinta lg:inline">{t.historias}</a>
          <a href="#servicos" className="hidden transition-colors hover:text-tinta lg:inline">{t.servicos}</a>
          <a href="#estilos" className="hidden transition-colors hover:text-tinta lg:inline">{t.estilos}</a>
          <a href="#contacto" className="hidden transition-colors hover:text-tinta lg:inline">{t.contacto}</a>
          <TrocaLingua />
          <a href="#proposta" className="inline-flex h-11 items-center whitespace-nowrap rounded-full bg-oliva px-4 font-medium text-marfim transition-transform hover:-translate-y-0.5 sm:px-6"><span className="sm:hidden">{t.ctaCurto}</span><span className="hidden sm:inline">{t.cta}</span></a>
        </nav>
      </div>
    </header>
  );
}

function Botao({ children, href = '#proposta', claro = false }: { children: React.ReactNode; href?: string; claro?: boolean }) {
  return (
    <a href={href}
      className={`k-shine group inline-flex h-14 items-center justify-center gap-3 rounded-full px-8 text-[0.9375rem] font-medium transition-[transform,box-shadow] duration-300 ease-[var(--ease-out-soft)] hover:-translate-y-0.5 active:scale-[0.98] ${
        claro ? 'bg-marfim text-tinta' : 'bg-oliva text-marfim shadow-[0_18px_40px_-18px_rgb(61_69_40/0.9)]'}`}>
      <span className="relative z-10">{children}</span>
      <ArrowRight className="relative z-10 size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
    </a>
  );
}

function Pagina() {
  const t = useT();
  return (
    <div className="hm">
      <Cabecalho />
      <main id="conteudo">
        {/* ================= HERO: provas sobre a mesa ================= */}
        <section id="inicio" data-progress className="relative overflow-hidden bg-marfim pt-[4.5rem]">
          <Coracao desenhar className="pointer-events-none absolute -right-24 top-16 hidden h-[52rem] w-auto opacity-30 lg:block" espessura={1.4} />
          <div className={`${wrap} grid min-h-[calc(100svh-4.5rem)] grid-cols-1 items-center gap-10 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-6`}>
            <div className="relative z-10">
              <Reveal delay={0.15}>
                <p className={`${rotulo} flex items-center gap-3 text-pedra`}><span className="h-px w-10 bg-ouro" aria-hidden />{t.hero.kicker}</p>
              </Reveal>
              <Reveal delay={0.25}>
                <h1 className={`${B} mt-7 text-[2.9rem] leading-[1.02] tracking-[-0.01em] sm:text-[4.2rem] lg:text-[4.1rem] xl:text-[4.7rem]`}>
                  {t.hero.l1}<br /><em className="text-ouro">{t.hero.l2}</em><br />{t.hero.l3}
                </h1>
              </Reveal>
              <Reveal as="p" delay={0.4} className="mt-8 max-w-md text-[1.0625rem] leading-relaxed text-pedra">{t.hero.sub}</Reveal>
              <Reveal delay={0.55} className="mt-10 flex flex-wrap items-center gap-6">
                <Magnetic><Botao>{t.hero.cta}</Botao></Magnetic>
                <a href="#historias" className="text-sm font-medium underline-offset-8 hover:underline">{t.hero.ver}</a>
              </Reveal>
            </div>
            <div className="relative mx-auto h-[27rem] w-full max-w-[30rem] sm:h-[36rem] lg:h-[40rem] lg:max-w-none" aria-label={t.rolo.fotos.pergola} role="img">
              <div className="cai absolute right-[4%] top-[4%] w-[62%]" style={{ animationDelay: '.3s' }}>
                <div className="prova prova-1 bg-[#fbf8f1] p-3 pb-14 sm:p-4 sm:pb-16">
                  <Foto id="pergola" alt="" posicao="50% 50%" className="filme aspect-[3/4] w-full" />
                  <span className={`${C} absolute bottom-4 left-5 text-xl italic text-tinta/70 sm:text-2xl`}>Funchal · Madeira</span>
                </div>
              </div>
              <div className="cai absolute left-0 top-[16%] w-[38%]" style={{ animationDelay: '.6s' }}>
                <div className="prova prova-2 bg-[#fbf8f1] p-2.5 pb-9">
                  <Foto id="boasvindas" alt="" posicao="50% 55%" className="filme aspect-[3/4] w-full" />
                </div>
              </div>
              <div className="cai absolute bottom-[2%] left-[12%] w-[36%]" style={{ animationDelay: '.9s' }}>
                <div className="prova prova-3 bg-[#fbf8f1] p-2.5 pb-9">
                  <Foto id="noite" alt="" posicao="50% 60%" className="filme aspect-square w-full" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="border-y border-tinta/10 bg-linho py-5 text-oliva">
          <Marquee texto={t.faixa} className={`${B} text-3xl italic sm:text-4xl`} />
        </div>

        {/* ================= MANIFESTO ================= */}
        <section id="manifesto" className="py-28 sm:py-44">
          <div className={`${wrap} grid gap-10 lg:grid-cols-[14rem_1fr]`}>
            <div className="flex items-center gap-4 lg:flex-col lg:items-start">
              <Coracao className="h-14 w-auto" espessura={1.6} />
              <p className={`${rotulo} text-pedra`}>{t.manifesto.kicker}</p>
            </div>
            <Palavras texto={t.manifesto.texto} destaque={t.manifesto.destaque} />
          </div>
        </section>

        <DiaNoite />
        <Rolo />

        {/* ================= SERVIÇOS ================= */}
        <section id="servicos" className="py-28 sm:py-40">
          <div className={wrap}>
            <div className="mb-14 max-w-3xl lg:mb-6">
              <p className={`${rotulo} text-pedra`}>{t.servicos.kicker}</p>
              <Reveal>
                <h2 className={`${B} mt-5 text-[2.7rem] leading-[1] sm:text-[4.4rem]`}>{t.servicos.titulo} <em className="text-ouro">{t.servicos.em}</em></h2>
              </Reveal>
            </div>
            <Servicos />
          </div>
        </section>

        {/* ================= ESTILOS ================= */}
        <section id="estilos" className="bg-linho py-28 sm:py-40">
          <div className={wrap}>
            <div className="mb-14 max-w-3xl">
              <p className={`${rotulo} text-pedra`}>{t.estilos.kicker}</p>
              <Reveal>
                <h2 className={`${B} mt-5 text-[2.7rem] leading-[1] sm:text-[4.4rem]`}>{t.estilos.titulo} <em className="text-ouro">{t.estilos.em}</em></h2>
              </Reveal>
            </div>
            <Estilos />
          </div>
        </section>

        {/* ================= PROPOSTA ================= */}
        <section id="proposta" className="relative overflow-hidden bg-oliva py-28 text-marfim sm:py-40">
          <Coracao className="pointer-events-none absolute -left-40 bottom-0 h-[44rem] w-auto opacity-20" cor="#dcc796" espessura={1.2} />
          <div className={`${wrap} relative`}>
            <div className="mx-auto mb-14 max-w-4xl">
              <p className={`${rotulo} text-ouro-claro`}>{t.proposta.kicker}</p>
              <Reveal>
                <h2 className={`${B} mt-5 text-[2.7rem] leading-[1] sm:text-[4.4rem]`}>{t.proposta.titulo} <em className="text-ouro-claro">{t.proposta.em}</em></h2>
              </Reveal>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-marfim/75 sm:text-lg">{t.proposta.sub}</p>
            </div>
            <div className="text-tinta"><Proposta /></div>
          </div>
        </section>

        {/* ================= VISITA + FAQ ================= */}
        <section id="contacto" className="py-28 sm:py-36">
          <div className={`${wrap} grid gap-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20`}>
            <div>
              <Reveal>
                <Foto id="loja" alt={t.visita.fotoAlt} posicao="45% 50%" className="filme aspect-[4/3] w-full" />
              </Reveal>
              <div className="mt-10 grid gap-10 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <p className={`${rotulo} text-pedra`}>{t.visita.kicker}</p>
                  <h2 className={`${B} mt-5 text-[2.5rem] leading-[1] sm:text-[3.6rem]`}>{t.visita.titulo} <em className="text-ouro">{t.visita.em}</em></h2>
                  <p className="mt-5 max-w-md text-base leading-relaxed text-pedra">{t.visita.sub}</p>
                </div>
              </div>
              <dl className="mt-8 divide-y divide-tinta/10 border-y border-tinta/10 text-[0.9375rem]">
                <div className="flex items-start gap-4 py-5"><MapPin className="mt-0.5 size-5 shrink-0 text-ouro" aria-hidden /><dt className="sr-only">Morada</dt><dd>{EMPRESA.morada}<br />{EMPRESA.codigo}, Madeira, Portugal</dd></div>
                <div className="flex items-center gap-4 py-5"><Phone className="size-5 shrink-0 text-ouro" aria-hidden /><dt className="sr-only">Telefone</dt><dd><a href={EMPRESA.telefoneLink} className="hover:text-oliva">{EMPRESA.telefone}</a></dd></div>
              </dl>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href={urlWhats(t.whatsOla)} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center gap-2 rounded-full bg-oliva px-6 text-sm font-medium text-marfim transition-transform hover:-translate-y-0.5"><IconeWhats className="size-5" />{t.visita.whats}</a>
                <a href={EMPRESA.telefoneLink} className="inline-flex h-12 items-center gap-2 rounded-full border border-tinta/25 px-6 text-sm font-medium transition-colors hover:border-oliva"><Phone className="size-4" aria-hidden />{t.visita.ligar}</a>
                <a href={ROTA_URL} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center gap-2 rounded-full border border-tinta/25 px-6 text-sm font-medium transition-colors hover:border-oliva"><MapPin className="size-4" aria-hidden />{t.visita.rota}</a>
              </div>
            </div>
            <Reveal delay={0.1} className="lg:pt-6">
              <p className={`${rotulo} text-pedra`}>{t.faqTitulo}</p>
              <div className="mt-8 divide-y divide-tinta/10 border-y border-tinta/10">
                {t.faq.map((f) => (
                  <details key={f.q} className="faq group py-6">
                    <summary className={`${B} flex cursor-pointer list-none items-center justify-between gap-4 text-[1.4rem] leading-snug`}>
                      {f.q}<Plus className="size-5 shrink-0 text-ouro transition-transform duration-300 group-open:rotate-45" aria-hidden />
                    </summary>
                    <p className="mt-3 max-w-lg text-[0.9375rem] leading-relaxed text-pedra">{f.a}</p>
                  </details>
                ))}
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="relative overflow-hidden bg-noite pt-24 text-marfim/75">
        <div className={`${wrap} relative flex flex-col items-center text-center`}>
          <Coracao className="vela h-28 w-auto" cor="#dcc796" espessura={1.6} />
          <p className={`${B} mt-8 text-[3.6rem] italic leading-none text-marfim sm:text-[6rem]`}>heartmade</p>
          <p className={`${C} mt-4 text-2xl italic text-ouro-claro`}>{t.rodape.frase}</p>
          <p className="mt-6 text-sm">{EMPRESA.completo} · {EMPRESA.morada}, {EMPRESA.codigo}</p>
          <div className="mt-10"><Botao claro>{t.nav.cta}</Botao></div>
        </div>
        <p className="mt-20 border-t border-marfim/10 py-6 text-center text-xs text-marfim/45">© {new Date().getFullYear()} {EMPRESA.completo}. {t.rodape.direitos}</p>
      </footer>
      <WhatsFlutuante />
    </div>
  );
}

export default function App() {
  return (
    <LinguaProvider>
      <Pagina />
    </LinguaProvider>
  );
}
