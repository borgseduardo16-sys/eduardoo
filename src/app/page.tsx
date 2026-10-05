import Link from 'next/link';
import {
  ArrowRight,
  Banknote,
  Eye,
  MapPin,
  MessagesSquare,
  OctagonAlert,
  ShieldCheck,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/dal';
import { listFeaturedSpaces } from '@/lib/promotions/queries';
import { listUserFavoriteIds } from '@/lib/favorites/queries';
import { signImagePaths } from '@/lib/storage/signed-urls';
import { SearchBar } from '@/components/search/search-bar';
import { ResultCard } from '@/components/espacos/result-card';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { HeroScene } from '@/components/motion/hero-scene';
import { SplitHeading } from '@/components/motion/split-heading';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { Magnetic } from '@/components/motion/magnetic';
import { Parallax } from '@/components/motion/parallax';

const TIPOS_POPULARES = [
  { label: 'Garagem', value: 'garagem' },
  { label: 'Vaga de carro', value: 'vaga_carro' },
  { label: 'Depósito', value: 'deposito' },
  { label: 'Galpão', value: 'galpao' },
  { label: 'Sala', value: 'sala' },
  { label: 'Terreno', value: 'terreno' },
];

export default async function Home() {
  const [viewer, destaques] = await Promise.all([getCurrentUser(), listFeaturedSpaces()]);

  const [urls, favoritosIds] = await Promise.all([
    signImagePaths(destaques.map((d) => d.coverPath).filter(Boolean) as string[]),
    viewer ? listUserFavoriteIds(viewer.id) : Promise.resolve(new Set<string>()),
  ]);

  return (
    <>
      <SiteHeader />

      <main id="conteudo">
        {/* Hero: uma pergunta, um campo, um botão. Nada compete com a busca. */}
        <section className="relative isolate px-4 sm:px-6 pt-14 pb-16 sm:pt-20 sm:pb-24 lg:pb-72">
          <HeroScene />
          <div className="mx-auto max-w-3xl space-y-8 text-center">
            <SplitHeading
              text="Encontre um espaço perto de você"
              className="text-[2.25rem] sm:text-[3.25rem] leading-[1.05] font-semibold"
            />
            <Reveal as="p" delay={0.45}
              className="text-[1.0625rem] sm:text-[1.125rem] text-[var(--content-muted)] max-w-xl mx-auto leading-relaxed">
              Garagens, depósitos, galpões e salas de quem tem espaço sobrando — no seu
              bairro, por mês, sem burocracia de imobiliária.
            </Reveal>

            <Reveal delay={0.6}>
              <SearchBar className="text-left pt-2" />
            </Reveal>

            <RevealGroup className="flex flex-wrap justify-center gap-2 pt-2" stagger={0.05}>
              {TIPOS_POPULARES.map((t) => (
                <RevealItem key={t.value}>
                  <Link
                    href={`/espacos?tipo=${t.value}`}
                    className="inline-block px-3.5 py-1.5 text-[0.8125rem] rounded-[var(--radius-pill)] border text-[var(--content-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)] transition-[color,border-color,transform,box-shadow] duration-200"
                  >
                    {t.label}
                  </Link>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/*
          Espaços em destaque: só existe quando há promoção ativa de verdade
          — nada de seção vazia nem anúncio fictício. Reusa ResultCard, o
          mesmo card da busca, para não duplicar a montagem visual.
        */}
        {destaques.length > 0 && (
          <section className="px-4 sm:px-6 pb-16 sm:pb-20">
            <div className="mx-auto max-w-6xl space-y-6">
              <Reveal>
                <h2 className="text-[1.375rem] sm:text-[1.625rem] font-semibold">Espaços em destaque</h2>
              </Reveal>
              <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {destaques.map((d) => (
                  <ResultCard
                    key={d.id}
                    space={d}
                    coverUrl={d.coverPath ? (urls.get(d.coverPath) ?? null) : null}
                    favorited={favoritosIds.has(d.id)}
                    loggedIn={Boolean(viewer)}
                  />
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Faixa do proprietário: o outro lado do marketplace. */}
        <section className="px-4 sm:px-6 py-16 sm:py-20 bg-[var(--surface-sunken)] border-y">
          <div className="mx-auto max-w-6xl grid gap-12 lg:grid-cols-2 lg:items-center">
            <RevealGroup className="space-y-6">
              <RevealItem>
                <p className="text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--accent)]">
                  Para quem tem espaço
                </p>
              </RevealItem>
              <RevealItem>
                <h2 className="text-[1.875rem] sm:text-[2.25rem] leading-[1.15] font-semibold">
                  Aquele espaço parado pode virar renda todo mês
                </h2>
              </RevealItem>
              <RevealItem>
                <p className="text-[var(--content-muted)] leading-relaxed text-[1.0625rem]">
                  Uma garagem que ninguém usa, um cômodo vazio, um galpão ocioso. Você define o
                  preço e as regras, decide quem aceita, e recebe todo mês direto na sua conta.
                </p>
              </RevealItem>
              <RevealItem>
                <Magnetic>
                  <Link
                    href="/anunciar"
                    className="group inline-flex items-center gap-2 h-12 px-6 font-medium rounded-[var(--radius-field)] bg-[var(--accent)] text-[var(--accent-content)] hover:bg-[var(--accent-hover)] hover:shadow-[var(--shadow-overlay)] transition-[background-color,box-shadow] duration-200"
                  >
                    Anunciar meu espaço
                    <ArrowRight
                      className="size-4 transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:translate-x-1"
                      aria-hidden
                    />
                  </Link>
                </Magnetic>
              </RevealItem>
              <RevealItem>
                <p className="text-[0.875rem] text-[var(--content-subtle)]">
                  Anunciar é gratuito. A plataforma só cobra quando você recebe.
                </p>
              </RevealItem>
            </RevealGroup>

            <RevealGroup as="ol" className="space-y-6" stagger={0.14}>
              {[
                {
                  n: '1',
                  t: 'Descreva o espaço',
                  d: 'Tipo, localização, tamanho, fotos e as regras que você quiser definir.',
                },
                {
                  n: '2',
                  t: 'Converse e aprove',
                  d: 'Quem se interessa manda mensagem. Você decide se aceita antes de qualquer cobrança.',
                },
                {
                  n: '3',
                  t: 'Receba todo mês',
                  d: 'O pagamento é cobrado automaticamente e repassado para a sua conta.',
                },
              ].map((step) => (
                <RevealItem as="li" key={step.n} className="flex gap-4">
                  <span className="shrink-0 size-9 rounded-full grid place-items-center text-[0.875rem] font-semibold bg-[var(--accent-subtle)] text-[var(--accent)]">
                    {step.n}
                  </span>
                  <div className="space-y-1 pt-1">
                    <h3 className="font-semibold">{step.t}</h3>
                    <p className="text-[0.9375rem] text-[var(--content-muted)] leading-relaxed">
                      {step.d}
                    </p>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>

        <section className="px-4 sm:px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <RevealGroup className="rounded-[var(--radius-card)] border p-8 sm:p-10 grid gap-10 sm:grid-cols-3" stagger={0.12}>
              {[
                {
                  icon: MapPin,
                  t: 'Perto de verdade',
                  d: 'A busca usa distância real a partir de onde você está — não uma lista genérica por cidade.',
                },
                {
                  icon: ShieldCheck,
                  t: 'Endereço protegido',
                  d: 'O endereço exato só aparece depois que a locação é confirmada com o primeiro pagamento. No mapa fica só a região.',
                },
                {
                  icon: Banknote,
                  t: 'Pagamento pela plataforma',
                  d: 'A cobrança mensal e o repasse passam por uma instituição de pagamento regulada.',
                },
              ].map((item) => (
                <RevealItem key={item.t} className="group space-y-3">
                  <item.icon
                    className="size-5 text-[var(--accent)] transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:-translate-y-0.5 group-hover:scale-110"
                    aria-hidden
                  />
                  <h3 className="font-semibold">{item.t}</h3>
                  <p className="text-[0.9375rem] text-[var(--content-muted)] leading-relaxed">
                    {item.d}
                  </p>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* Combinar pela plataforma: dito uma vez, com peso, e não repetido
            em toda tela — aviso que aparece demais deixa de ser lido. */}
        <section className="px-4 sm:px-6 pb-16 sm:pb-24">
          <div className="mx-auto max-w-6xl">
            <Reveal className="rounded-[var(--radius-card)] border p-6 sm:p-10 grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
              <div className="space-y-4">
                <p className="text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--accent)]">
                  Antes de fechar
                </p>
                <h2 className="text-[1.625rem] sm:text-[1.875rem] leading-[1.15] font-semibold">
                  Visite o espaço. E combine tudo por aqui.
                </h2>
                <p className="text-[var(--content-muted)] leading-relaxed">
                  Vá ver o lugar antes de fechar — é a única verificação que nenhum sistema
                  substitui. E mantenha a conversa e o pagamento na plataforma: é o que deixa
                  registro de tudo que foi combinado.
                </p>
                <p className="text-[var(--content-muted)] leading-relaxed">
                  Pix direto para um desconhecido não volta, e combinação feita por fora não
                  deixa rastro nenhum no nosso sistema.
                </p>
                <Link
                  href="/protecao"
                  className="group inline-flex items-center gap-2 h-11 px-5 font-medium rounded-[var(--radius-field)] border hover:bg-[var(--surface-sunken)] hover:border-[var(--border-strong)] transition-colors"
                >
                  Como protegemos você
                  <ArrowRight
                    className="size-4 transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:translate-x-1"
                    aria-hidden
                  />
                </Link>
              </div>

              <Parallax distance={14}>
              <ul className="space-y-4">
                {[
                  {
                    icon: Eye,
                    t: 'Visite antes de pagar',
                    d: 'Confira se o espaço é o das fotos e se quem atende é quem anunciou.',
                  },
                  {
                    icon: MessagesSquare,
                    t: 'Combine no chat',
                    d: 'O que for acertado pessoalmente, escreva aqui. Fica com data e hora.',
                  },
                  {
                    icon: OctagonAlert,
                    t: 'Nunca pague adiantado por fora',
                    d: 'Pedido de sinal antes da visita é o golpe mais comum neste tipo de anúncio.',
                  },
                ].map((item) => (
                  <li key={item.t} className="flex gap-3">
                    <item.icon
                      className="size-4 mt-1 shrink-0 text-[var(--accent)]"
                      aria-hidden
                    />
                    <div className="space-y-0.5">
                      <h3 className="text-[0.9375rem] font-medium">{item.t}</h3>
                      <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
                        {item.d}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              </Parallax>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
