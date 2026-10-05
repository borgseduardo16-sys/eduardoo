import type { Metadata, Viewport } from 'next';
import {
  ArrowDown,
  Bot,
  Briefcase,
  Check,
  Headset,
  LayoutGrid,
  LockKeyhole,
  MessageCircle,
  MessagesSquare,
  Play,
  Rocket,
  ShoppingBag,
  Sparkles,
  Store,
  TrendingUp,
  UserRound,
  Wrench,
  Zap,
  ChevronDown,
  Users,
} from 'lucide-react';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { SplitHeading } from '@/components/motion/split-heading';
import { Magnetic } from '@/components/motion/magnetic';
import { Parallax } from '@/components/motion/parallax';
import { BuyButton } from '@/components/vendas/buy-button';
import { StickyCta } from '@/components/vendas/sticky-cta';
import { HeroScene } from '@/components/vendas/scene';
import { PhoneStage } from '@/components/vendas/phone';
import { Inbox } from '@/components/vendas/inbox';
import { BeforeAfterScrub } from '@/components/vendas/before-after';
import { CompareChart } from '@/components/vendas/compare-chart';
import { AiChat } from '@/components/vendas/ai-chat';
import { Timeline } from '@/components/vendas/timeline';
import { TiltCard } from '@/components/vendas/tilt-card';
import { Spotlight } from '@/components/vendas/spotlight';
import { CountUp } from '@/components/vendas/count-up';
import { PRECO_CENTAVOS, PRECO_TEXTO, PRODUTO } from '@/components/vendas/config';
import './vendas.css';

export const metadata: Metadata = {
  title: { absolute: `${PRODUTO} — aprenda a atender e vender melhor pelo WhatsApp` },
  description:
    'Aulas em vídeo e assistência de IA para você usar o WhatsApp Business de forma profissional: atendimento organizado, respostas melhores e mais oportunidades de venda.',
  applicationName: PRODUTO,
  openGraph: { siteName: PRODUTO, locale: 'pt_BR', type: 'website' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#04060b',
};

/* ------------------------------------------------------------------ helpers */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--v-blue-soft)]">
      <span className="h-px w-6 bg-[var(--v-blue-soft)]/60" aria-hidden />
      {children}
    </p>
  );
}

function H2({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`text-[1.75rem] font-semibold leading-[1.12] tracking-tight sm:text-4xl lg:text-[2.75rem] ${className}`}>
      {children}
    </h2>
  );
}

const lead = 'text-base leading-relaxed text-[var(--v-muted)] sm:text-lg';
const wrap = 'mx-auto w-full max-w-6xl px-5 sm:px-8';

/* -------------------------------------------------------------------- dados */

const APRENDER = [
  { icon: LayoutGrid, t: 'Organização do WhatsApp Business', d: 'Deixe o aplicativo estruturado para o seu dia a dia de atendimento.', span: 'lg:col-span-4' },
  { icon: Headset, t: 'Atendimento profissional', d: 'Converse com clientes de forma clara, educada e consistente.', span: 'lg:col-span-2' },
  { icon: Zap, t: 'Respostas mais eficientes', d: 'Responda com mais agilidade, sem perder a qualidade da conversa.', span: 'lg:col-span-2' },
  { icon: Wrench, t: 'Recursos do WhatsApp Business', d: 'Conheça as ferramentas do aplicativo e saiba quando usar cada uma.', span: 'lg:col-span-2' },
  { icon: MessagesSquare, t: 'Organização da comunicação', d: 'Mantenha conversas, clientes e combinados no lugar certo.', span: 'lg:col-span-2' },
  { icon: Rocket, t: 'Estratégias para aproveitar melhor o WhatsApp', d: 'Ideias práticas para tirar mais proveito do canal no seu negócio.', span: 'lg:col-span-3' },
  { icon: ShoppingBag, t: 'O WhatsApp como ferramenta de vendas', d: 'Use as conversas para gerar oportunidades de venda para o seu negócio.', span: 'lg:col-span-3', destaque: true },
];

const PUBLICO = [
  { icon: Store, t: 'Pequenos empreendedores', d: 'Quem toca o próprio negócio e atende pelo WhatsApp.' },
  { icon: UserRound, t: 'Profissionais autônomos', d: 'Quem trabalha por conta própria e fala com clientes todos os dias.' },
  { icon: Briefcase, t: 'Prestadores de serviço', d: 'Quem recebe pedidos, orçamentos e agendamentos por mensagem.' },
  { icon: Users, t: 'Quem atende clientes pelo WhatsApp', d: 'Qualquer pessoa que usa o aplicativo para atender, vender ou responder.' },
  { icon: TrendingUp, t: 'Negócios que querem profissionalizar o atendimento', d: 'Quem quer organizar a comunicação e passar mais confiança.' },
];

const PAREADOS = [
  ['Desorganização', 'Atendimento organizado'],
  ['Respostas demoradas', 'Respostas mais eficientes'],
  ['Mensagens espalhadas', 'Processos melhores'],
  ['Atendimento improvisado', 'Comunicação profissional'],
];

const INCLUSO = ['Aulas em vídeo', 'Conteúdo prático', 'Assistência de IA para dúvidas'];

const FAQ = [
  { q: 'O que eu recebo ao comprar?', a: 'Aulas em vídeo, conteúdo prático sobre o uso profissional do WhatsApp Business e assistência de IA para tirar dúvidas durante o aprendizado.' },
  { q: 'Como funciona o acesso?', a: 'A compra é feita no checkout da Kiwify. Depois do pagamento, você recebe o acesso ao produto.' },
  { q: 'Preciso saber usar o WhatsApp Business?', a: 'O produto ensina, na prática, a usar o WhatsApp Business de forma mais profissional e organizada. E, se surgir dúvida pelo caminho, a assistência de IA está incluída para ajudar.' },
  { q: 'A assistência de IA está incluída?', a: 'Sim. A assistência de IA faz parte do produto e serve para ajudar você a tirar dúvidas durante o aprendizado.' },
  { q: 'Como o produto pode me ajudar?', a: 'Ele ajuda a organizar o atendimento, responder melhor aos clientes, usar os recursos do WhatsApp Business de forma mais profissional e aproveitar o WhatsApp para gerar oportunidades de venda. Os resultados dependem de como você aplica o que aprende.' },
  { q: 'Quanto custa?', a: `O preço atual é ${PRECO_TEXTO}.` },
];

/* ------------------------------------------------------------------- página */

export default function PaginaDeVendas() {
  return (
    <div className="vendas">
      {/* Barra superior mínima: identifica o produto, sem competir com o CTA. */}
      <header className="absolute inset-x-0 top-0 z-30">
        <div className={`${wrap} flex h-16 items-center`}>
          <p className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
            <span className="grid size-8 place-items-center rounded-lg bg-[var(--v-blue)]/15 text-[var(--v-blue-soft)] ring-1 ring-white/10">
              <MessageCircle className="size-4" aria-hidden />
            </span>
            {PRODUTO}
          </p>
        </div>
      </header>

      <main id="conteudo">
        {/* ============================== 1. HERO ============================== */}
        <section id="topo" className="v-grain relative isolate overflow-hidden">
          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_90%_60%_at_70%_0%,rgb(10_42_107/0.75),transparent_70%),radial-gradient(ellipse_60%_50%_at_0%_100%,rgb(10_42_107/0.35),transparent_70%)]" />
          <div aria-hidden className="v-grid absolute inset-0 -z-10" />
          <HeroScene />

          <div className={`${wrap} grid min-h-[100svh] grid-cols-1 items-center gap-12 pb-24 pt-28 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:pb-16`}>
            <div className="space-y-7">
              <Reveal>
                <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-2 pr-3.5 text-xs text-[var(--v-muted)]">
                  <span className="grid size-5 place-items-center rounded-full bg-[var(--v-green)]/15">
                    <span className="size-1.5 rounded-full bg-[var(--v-green)]" />
                  </span>
                  Aulas em vídeo + assistência de IA
                </p>
              </Reveal>

              <SplitHeading
                text="Seu WhatsApp pode ser muito mais do que um aplicativo de mensagens."
                className="text-[2.2rem] font-semibold leading-[1.06] tracking-tight sm:text-5xl lg:text-[3.6rem]"
              />

              <Reveal as="p" delay={0.5} className={`${lead} max-w-xl`}>
                Aprenda a organizar seu atendimento, responder melhor e aproveitar o WhatsApp
                Business para gerar mais oportunidades — com aulas em vídeo e uma assistência de
                IA para tirar suas dúvidas.
              </Reveal>

              <Reveal delay={0.65} className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Magnetic>
                  <BuyButton location="hero" className="v-halo w-full sm:w-auto">
                    QUERO APRENDER AGORA
                  </BuyButton>
                </Magnetic>
                <a
                  href="#produto"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium text-[var(--v-muted)] transition-colors hover:text-white"
                >
                  VER COMO FUNCIONA
                  <ArrowDown className="size-4" aria-hidden />
                </a>
              </Reveal>

              <Reveal delay={0.8}>
                <p className="text-sm text-[var(--v-muted)]">
                  Comece hoje por <strong className="font-semibold text-white">{PRECO_TEXTO}</strong>
                </p>
              </Reveal>
            </div>

            <Reveal delay={0.3} className="relative pb-6 sm:pb-0">
              <PhoneStage />
            </Reveal>
          </div>

          {/* Indicação de rolagem */}
          <a
            href="#problema"
            aria-label="Rolar para a próxima seção"
            className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[0.6875rem] uppercase tracking-[0.2em] text-[var(--v-muted)] transition-colors hover:text-white md:flex"
          >
            Role
            <span className="relative h-9 w-px overflow-hidden bg-white/15">
              <span className="v-scroll-hint absolute inset-x-0 top-0 h-3 bg-[var(--v-blue-soft)]" />
            </span>
          </a>
        </section>

        {/* ============================= 2. PROBLEMA ============================ */}
        <section id="problema" className="relative py-20 sm:py-28">
          <div className={`${wrap} grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20`}>
            <div>
              <Reveal>
                <Eyebrow>O cenário</Eyebrow>
                <H2>Enquanto você se organiza, seu cliente pode estar esperando.</H2>
              </Reveal>
              <RevealGroup className="mt-8 space-y-5" stagger={0.1}>
                {[
                  'Clientes esperando por uma resposta.',
                  'Mensagens que se perdem no meio de outras conversas.',
                  'Atendimento desorganizado, que muda a cada dia.',
                  'Respostas que demoram mais do que deveriam.',
                  'Oportunidades que ficam esquecidas pelo caminho.',
                ].map((t) => (
                  <RevealItem key={t} className="flex gap-3.5">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--v-blue-soft)]" aria-hidden />
                    <p className="text-base leading-relaxed text-white/85 sm:text-[1.0625rem]">{t}</p>
                  </RevealItem>
                ))}
              </RevealGroup>
            </div>
            <Inbox />
          </div>
        </section>

        {/* ========================== 3. TRANSFORMAÇÃO ========================== */}
        <section id="transformacao" className="relative overflow-hidden py-20 sm:py-28">
          <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,transparent,rgb(7_16_36)_18%,rgb(7_16_36)_82%,transparent)]" />
          <div className={`${wrap} grid grid-cols-1 items-center gap-14 lg:grid-cols-2 lg:gap-20`}>
            <BeforeAfterScrub />
            <div>
              <Reveal>
                <Eyebrow>A diferença</Eyebrow>
                <H2>Do improviso ao atendimento profissional.</H2>
                <p className={`${lead} mt-5`}>
                  É o mesmo WhatsApp. O que muda é a forma de usar.
                </p>
              </Reveal>
              <RevealGroup as="ul" className="mt-9 space-y-3" stagger={0.12}>
                {PAREADOS.map(([antes, depois]) => (
                  <RevealItem as="li" key={antes}>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5 sm:gap-5 sm:px-5">
                      <span className="text-sm text-[var(--v-muted)] line-through decoration-white/20 sm:text-[0.9375rem]">{antes}</span>
                      <span className="text-[var(--v-blue-soft)]" aria-hidden>→</span>
                      <span className="text-sm font-medium sm:text-[0.9375rem]">
                        <span className="sr-only">Depois: </span>
                        {depois}
                      </span>
                    </div>
                  </RevealItem>
                ))}
              </RevealGroup>
            </div>
          </div>
        </section>

        {/* ============================== 4. GRÁFICO ============================ */}
        <section id="grafico" className="relative py-20 sm:py-28">
          <div className={`${wrap} grid grid-cols-1 items-center gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16`}>
            <Reveal>
              <Eyebrow>Em perspectiva</Eyebrow>
              <H2>Organização muda o ritmo do seu atendimento.</H2>
              <p className={`${lead} mt-5`}>
                Quando o atendimento tem método, a evolução deixa de depender da sorte do dia.
                Veja a ideia, de forma conceitual.
              </p>
            </Reveal>
            <Reveal delay={0.1}>
              <CompareChart />
            </Reveal>
          </div>
        </section>

        {/* ============================== 5. PRODUTO ============================ */}
        <section id="produto" className="relative overflow-hidden py-20 sm:py-28">
          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgb(10_42_107/0.55),transparent_70%)]" />
          <div className={wrap}>
            <Reveal className="mx-auto max-w-3xl text-center">
              <div className="flex justify-center"><Eyebrow>A solução</Eyebrow></div>
              <H2>{PRODUTO}</H2>
              <p className={`${lead} mx-auto mt-5 max-w-2xl`}>
                Uma forma prática de transformar o WhatsApp em uma ferramenta profissional de
                atendimento e vendas — com a assistência de IA acompanhando o seu aprendizado.
              </p>
            </Reveal>

            <div className="mt-14 grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.25fr_0.75fr] lg:gap-14">
              <Parallax distance={18}>
                <TiltCard className="rounded-3xl" max={4}>
                  {/* Mockup do player de aulas (ilustrativo) */}
                  <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#070d1b] shadow-[0_40px_90px_-30px_rgb(0_0_0/0.95)]">
                    <div className="flex items-center gap-1.5 border-b border-white/[0.08] px-4 py-3">
                      <span className="size-2.5 rounded-full bg-white/15" />
                      <span className="size-2.5 rounded-full bg-white/15" />
                      <span className="size-2.5 rounded-full bg-white/15" />
                      <span className="ml-3 truncate text-xs text-[var(--v-muted)]">{PRODUTO}</span>
                    </div>
                    <div className="relative aspect-video bg-[radial-gradient(ellipse_at_30%_20%,rgb(47_123_255/0.35),transparent_60%),linear-gradient(135deg,#0a1a3d,#050912)]">
                      <div aria-hidden className="v-grid absolute inset-0 opacity-60" />
                      <div className="absolute inset-0 grid place-items-center">
                        <span className="relative grid size-16 place-items-center rounded-full bg-white/10 ring-1 ring-white/25 backdrop-blur-md sm:size-20">
                          <span className="v-ping absolute inset-0 rounded-full bg-white/20" aria-hidden />
                          <Play className="size-6 translate-x-0.5 fill-white text-white sm:size-7" aria-hidden />
                        </span>
                      </div>
                      <div className="absolute inset-x-4 bottom-4 sm:inset-x-6">
                        <div className="h-1 overflow-hidden rounded-full bg-white/15">
                          <div className="h-full w-[38%] rounded-full bg-[var(--v-blue)]" />
                        </div>
                        <p className="mt-2 text-xs text-white/60">Aula em vídeo</p>
                      </div>
                      {/* Balão flutuante da IA sobre o player */}
                      <div className="v-float absolute right-3 top-3 max-w-[11rem] rounded-2xl rounded-tr-md border border-white/10 bg-[#0b1630]/85 p-2.5 text-[0.6875rem] leading-snug shadow-xl backdrop-blur-md sm:right-5 sm:top-5 sm:max-w-[14rem] sm:p-3 sm:text-xs" style={{ ['--dur' as string]: '6s' }}>
                        <span className="mb-1 flex items-center gap-1.5 font-semibold text-[var(--v-blue-soft)]">
                          <Sparkles className="size-3" aria-hidden /> Assistência de IA
                        </span>
                        Ficou com dúvida? Pergunte sem sair da aula.
                      </div>
                    </div>
                  </div>
                </TiltCard>
              </Parallax>

              <div>
                <Reveal>
                  <p className="mb-5 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--v-muted)]">O que você recebe</p>
                </Reveal>
                <RevealGroup as="ul" className="space-y-3" stagger={0.12}>
                  {[
                    { icon: Play, t: 'Aulas em vídeo', d: 'Para aprender vendo como se faz.' },
                    { icon: Wrench, t: 'Conteúdo prático', d: 'Foco em usar o WhatsApp Business no dia a dia.' },
                    { icon: Bot, t: 'Assistência de IA', d: 'Para tirar dúvidas durante o aprendizado.' },
                  ].map(({ icon: Icon, t, d }) => (
                    <RevealItem as="li" key={t}>
                      <Spotlight className="flex items-start gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 transition-colors hover:border-white/20">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--v-blue)]/15 text-[var(--v-blue-soft)]">
                          <Icon className="size-5" aria-hidden />
                        </span>
                        <div>
                          <h3 className="font-semibold">{t}</h3>
                          <p className="mt-0.5 text-sm text-[var(--v-muted)]">{d}</p>
                        </div>
                      </Spotlight>
                    </RevealItem>
                  ))}
                </RevealGroup>
              </div>
            </div>
          </div>
        </section>

        {/* ============================= 6. APRENDER ============================ */}
        <section id="aprender" className="relative py-20 sm:py-28">
          <div className={wrap}>
            <Reveal className="max-w-2xl">
              <Eyebrow>O que você vai aprender</Eyebrow>
              <H2>Do básico organizado ao WhatsApp como ferramenta de vendas.</H2>
            </Reveal>

            <RevealGroup className="mt-12 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-6" stagger={0.07}>
              {APRENDER.map(({ icon: Icon, t, d, span, destaque }, i) => (
                <RevealItem key={t} className={span}>
                  <Spotlight
                    className={`group h-full overflow-hidden rounded-3xl border p-6 transition-colors duration-300 sm:p-7 ${
                      destaque
                        ? 'border-[var(--v-green)]/25 bg-gradient-to-br from-[var(--v-green)]/[0.07] to-white/[0.02] hover:border-[var(--v-green)]/45'
                        : 'border-white/[0.08] bg-white/[0.03] hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <span className={`grid size-11 place-items-center rounded-xl transition-transform duration-500 ease-[var(--ease-out-soft)] group-hover:-translate-y-0.5 group-hover:scale-105 ${destaque ? 'bg-[var(--v-green)]/15 text-[var(--v-green)]' : 'bg-[var(--v-blue)]/15 text-[var(--v-blue-soft)]'}`}>
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <span className="text-xs font-semibold tabular-nums text-white/25">{String(i + 1).padStart(2, '0')}</span>
                    </div>
                    <h3 className="mt-6 text-lg font-semibold leading-snug sm:text-xl">{t}</h3>
                    <p className="mt-2 max-w-sm text-[0.9375rem] leading-relaxed text-[var(--v-muted)]">{d}</p>
                    {i === 0 && (
                      <div className="mt-6 flex flex-wrap gap-2" aria-hidden>
                        {['Novo cliente', 'Orçamento', 'Em conversa', 'Finalizado'].map((e, k) => (
                          <span key={e} className={`rounded-full border px-2.5 py-1 text-[0.6875rem] font-medium ${k === 3 ? 'border-[var(--v-green)]/30 text-[var(--v-green)]' : 'border-white/10 text-[var(--v-muted)]'}`}>{e}</span>
                        ))}
                      </div>
                    )}
                  </Spotlight>
                </RevealItem>
              ))}
            </RevealGroup>

            {/* CTA intermediário: depois do valor, antes da prova da IA. */}
            <Reveal className="mt-12 flex justify-center">
              <BuyButton location="meio" variant="ghost">QUERO APRENDER AGORA</BuyButton>
            </Reveal>
          </div>
        </section>

        {/* ============================ 7. ASSISTÊNCIA IA ======================== */}
        <section id="ia" className="relative overflow-hidden py-20 sm:py-28">
          <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,transparent,rgb(7_16_36)_15%,rgb(7_16_36)_85%,transparent)]" />
          <div className={`${wrap} grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20`}>
            <div>
              <Reveal>
                <Eyebrow>Assistência de IA</Eyebrow>
                <H2>Você não precisa aprender sozinho.</H2>
                <p className={`${lead} mt-5`}>
                  Junto com as aulas, você conta com uma assistência de IA para ajudar nas dúvidas
                  que surgirem durante o aprendizado — no seu ritmo, quando precisar.
                </p>
              </Reveal>
              <RevealGroup as="ul" className="mt-8 space-y-3" stagger={0.1}>
                {[
                  ['Dúvidas durante o aprendizado', 'Travou em algum ponto das aulas? Pergunte.'],
                  ['Conversa simples', 'Você escreve como falaria com uma pessoa.'],
                  ['Incluída no produto', 'Faz parte do que você recebe ao comprar.'],
                ].map(([t, d]) => (
                  <RevealItem as="li" key={t} className="flex gap-3.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[var(--v-blue)]/20 text-[var(--v-blue-soft)]">
                      <Check className="size-3.5" aria-hidden />
                    </span>
                    <div>
                      <h3 className="text-[0.9375rem] font-semibold">{t}</h3>
                      <p className="text-sm text-[var(--v-muted)]">{d}</p>
                    </div>
                  </RevealItem>
                ))}
              </RevealGroup>
            </div>
            <AiChat />
          </div>
        </section>

        {/* ============================= 8. EXPERIÊNCIA ========================= */}
        <section id="como-funciona" className="relative py-20 sm:py-28">
          <div className={`${wrap} grid grid-cols-1 gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20`}>
            <Reveal className="lg:sticky lg:top-28 lg:self-start">
              <Eyebrow>Na prática</Eyebrow>
              <H2>Como funciona a experiência.</H2>
              <p className={`${lead} mt-5 max-w-md`}>Quatro passos, do primeiro acesso até a aplicação no seu atendimento.</p>
            </Reveal>
            <Timeline />
          </div>
        </section>

        {/* ============================== 9. PARA QUEM ========================== */}
        <section id="publico" className="relative py-20 sm:py-28">
          <div className={wrap}>
            <Reveal className="max-w-2xl">
              <Eyebrow>Para quem é</Eyebrow>
              <H2>Feito para quem atende clientes pelo WhatsApp.</H2>
            </Reveal>
            <RevealGroup as="ul" className="mt-12 divide-y divide-white/[0.08] border-y border-white/[0.08]" stagger={0.08}>
              {PUBLICO.map(({ icon: Icon, t, d }) => (
                <RevealItem as="li" key={t}>
                  <div className="group flex items-center gap-4 py-5 transition-colors sm:gap-6 sm:py-6">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-[var(--v-muted)] transition-colors duration-300 group-hover:bg-[var(--v-blue)]/20 group-hover:text-[var(--v-blue-soft)]">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <h3 className="min-w-0 flex-1 text-base font-semibold leading-snug transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:translate-x-1 sm:text-xl lg:flex-none lg:basis-[26rem]">
                      {t}
                    </h3>
                    <p className="hidden flex-1 text-[0.9375rem] text-[var(--v-muted)] lg:block">{d}</p>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>
            <Reveal as="p" className="mt-6 max-w-2xl text-sm leading-relaxed text-[var(--v-muted)]">
              Se você não atende clientes pelo WhatsApp, este conteúdo provavelmente não é para
              você.
            </Reveal>
          </div>
        </section>

        {/* ============================== 10. OFERTA ============================ */}
        <section id="oferta" className="relative overflow-hidden py-20 sm:py-28">
          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_60%_at_50%_50%,rgb(10_42_107/0.6),transparent_70%)]" />
          <div className={wrap}>
            <Reveal className="mx-auto max-w-2xl text-center">
              <div className="flex justify-center"><Eyebrow>A oferta</Eyebrow></div>
              <H2>Comece hoje por {PRECO_TEXTO}</H2>
            </Reveal>

            <Reveal delay={0.1} className="mx-auto mt-12 max-w-lg">
              <TiltCard className="rounded-[2rem]" max={5}>
                <div className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-[linear-gradient(160deg,#0c1d44_0%,#070d1b_55%)] p-7 shadow-[0_50px_100px_-30px_rgb(47_123_255/0.35),inset_0_1px_0_rgb(255_255_255/0.12)] sm:p-9">
                  <div aria-hidden className="absolute -right-16 -top-16 size-56 rounded-full bg-[var(--v-blue)]/20 blur-3xl" />
                  <p className="relative text-sm font-medium text-[var(--v-blue-soft)]">{PRODUTO}</p>
                  <p className="relative mt-5 text-sm text-[var(--v-muted)]">Preço atual</p>
                  <p className="relative mt-1 flex items-baseline gap-1 text-[3.5rem] font-semibold leading-none tracking-tight tabular-nums sm:text-[4.25rem]">
                    <CountUp to={PRECO_CENTAVOS} tipo="brl" />
                  </p>

                  <ul className="relative mt-8 space-y-3.5 border-t border-white/10 pt-8">
                    {INCLUSO.map((i) => (
                      <li key={i} className="flex items-center gap-3 text-[0.9375rem] sm:text-base">
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--v-green)]/15 text-[var(--v-green)]">
                          <Check className="size-3.5" strokeWidth={3} aria-hidden />
                        </span>
                        {i}
                      </li>
                    ))}
                  </ul>

                  <BuyButton location="oferta" className="v-halo relative mt-9 w-full">
                    QUERO COMEÇAR AGORA
                  </BuyButton>
                  <p className="relative mt-4 flex items-center justify-center gap-2 text-xs text-[var(--v-muted)]">
                    <LockKeyhole className="size-3.5" aria-hidden />
                    Você finaliza a compra no checkout da Kiwify.
                  </p>
                </div>
              </TiltCard>
            </Reveal>
          </div>
        </section>

        {/* ===================== 11. SEGURANÇA / COMO COMPRAR =================== */}
        <section id="compra" className="relative py-16 sm:py-24">
          <div className={wrap}>
            <Reveal className="mx-auto max-w-2xl text-center">
              <div className="flex justify-center"><Eyebrow>Como comprar</Eyebrow></div>
              <H2 className="!text-2xl sm:!text-3xl">Simples e direto, em três passos.</H2>
            </Reveal>
            <RevealGroup className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-3.5 sm:grid-cols-3" stagger={0.12}>
              {[
                ['1', 'Clique no botão de compra', 'Você é levado ao checkout.'],
                ['2', 'Finalize o pagamento', 'O pagamento é feito na página de checkout da Kiwify.'],
                ['3', 'Receba o acesso', 'Depois do pagamento, você recebe o acesso ao produto.'],
              ].map(([n, t, d]) => (
                <RevealItem key={n} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
                  <span className="grid size-8 place-items-center rounded-full bg-[var(--v-blue)]/20 text-sm font-semibold text-[var(--v-blue-soft)]">{n}</span>
                  <h3 className="mt-4 font-semibold">{t}</h3>
                  <p className="mt-1 text-sm text-[var(--v-muted)]">{d}</p>
                </RevealItem>
              ))}
            </RevealGroup>
            <Reveal as="p" className="mx-auto mt-6 flex max-w-2xl items-start justify-center gap-2 text-center text-xs leading-relaxed text-[var(--v-muted)]">
              <LockKeyhole className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>Esta página não coleta dados de pagamento: tudo acontece no checkout da Kiwify.</span>
            </Reveal>
          </div>
        </section>

        {/* ================================ 12. FAQ ============================= */}
        <section id="faq" className="relative py-20 sm:py-28">
          <div className={`${wrap} grid grid-cols-1 gap-10 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20`}>
            <Reveal>
              <Eyebrow>Dúvidas frequentes</Eyebrow>
              <H2>Perguntas e respostas.</H2>
            </Reveal>
            <RevealGroup className="divide-y divide-white/[0.08] border-y border-white/[0.08]" stagger={0.06}>
              {FAQ.map(({ q, a }) => (
                <RevealItem key={q}>
                  <details className="v-faq group">
                    <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 py-4 text-left text-base font-medium sm:text-lg">
                      {q}
                      <ChevronDown className="v-chev size-5 shrink-0 text-[var(--v-muted)] transition-transform duration-300" aria-hidden />
                    </summary>
                    <div className="v-faq-body">
                      <div>
                        <p className="max-w-2xl pb-5 text-[0.9375rem] leading-relaxed text-[var(--v-muted)] sm:text-base">{a}</p>
                      </div>
                    </div>
                  </details>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* ============================== 13. CTA FINAL ========================= */}
        <section id="final" className="v-grain relative isolate overflow-hidden py-24 sm:py-36">
          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_70%_at_50%_100%,rgb(10_42_107/0.9),transparent_70%)]" />
          <div aria-hidden className="v-grid absolute inset-0 -z-10 opacity-70 [mask-image:radial-gradient(ellipse_70%_70%_at_50%_100%,#000_10%,transparent_75%)]" />
          <div className={`${wrap} text-center`}>
            <Reveal>
              <h2 className="mx-auto max-w-3xl text-[2rem] font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
                Seu WhatsApp já faz parte do seu negócio.
              </h2>
              <p className={`${lead} mx-auto mt-6 max-w-xl`}>
                O próximo passo é aprender a usá-lo de maneira mais profissional — com aulas em
                vídeo e uma assistência de IA ao seu lado.
              </p>
              <div className="mt-10 flex justify-center">
                <Magnetic>
                  <BuyButton location="final" className="v-halo h-auto min-h-14 w-full whitespace-normal py-3 text-center sm:w-auto">
                    QUERO COMEÇAR AGORA — {PRECO_TEXTO}
                  </BuyButton>
                </Magnetic>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.08] px-5 py-10 pb-28 text-center sm:pb-10">
        <p className="mx-auto max-w-2xl text-xs leading-relaxed text-[var(--v-muted)]">
          © {new Date().getFullYear()} {PRODUTO}. WhatsApp é marca de seus respectivos titulares;
          este produto é independente e não tem vínculo com o WhatsApp ou com a Meta.
        </p>
      </footer>

      <StickyCta />
    </div>
  );
}
