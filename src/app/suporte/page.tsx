import type { Metadata } from 'next';
import Link from 'next/link';
import { LifeBuoy, MessageCircle, Flag } from 'lucide-react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = {
  title: 'Suporte',
  description: 'Perguntas frequentes e onde resolver cada tipo de problema na MyPlace.',
};

const PERGUNTAS = [
  {
    p: 'Como funciona o pagamento do aluguel?',
    r: 'É uma assinatura mensal, cobrada automaticamente pela plataforma via Pix, boleto ou cartão. Você confirma uma vez no checkout, e as cobranças seguintes acontecem sozinhas.',
  },
  {
    p: 'Posso conhecer o espaço antes de fechar?',
    r: 'Sim — e recomendamos fortemente. Combine a visita pelo chat da plataforma antes de aceitar ou pagar qualquer coisa.',
  },
  {
    p: 'O que acontece se eu não conseguir mais usar o espaço?',
    r: 'Você pode encerrar o aluguel a qualquer momento. O histórico continua disponível para os dois lados; valores já cobrados não são estornados automaticamente.',
  },
  {
    p: 'Como sei que o proprietário é confiável?',
    r: 'O perfil mostra selo de verificação (quando existir) e o histórico de avaliações de locações anteriores. Ainda assim, sempre visite antes de fechar.',
  },
  {
    p: 'Quanto custa anunciar um espaço?',
    r: 'Publicar é grátis. A taxa só existe quando um aluguel de verdade acontece — detalhes em /taxas.',
  },
];

export default function SuportePage() {
  return (
    <>
      <SiteHeader />

      <main id="conteudo">
        <section className="px-4 sm:px-6 pt-12 pb-10 sm:pt-16">
          <div className="mx-auto max-w-2xl space-y-4">
            <p className="flex items-center gap-1.5 text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--accent)]">
              <LifeBuoy className="size-3.5" aria-hidden />
              Suporte
            </p>
            <h1 className="text-[2rem] sm:text-[2.5rem] leading-[1.1] font-semibold">
              Como podemos ajudar
            </h1>
          </div>
        </section>

        <section className="px-4 sm:px-6 pb-12">
          <div className="mx-auto max-w-2xl space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                href="/mensagens"
                className="rounded-[var(--radius-card)] border p-5 space-y-2 hover:bg-[var(--surface-sunken)] transition-colors"
              >
                <MessageCircle className="size-5 text-[var(--accent)]" aria-hidden />
                <p className="font-semibold text-[0.9375rem]">Problema com uma reserva ou conversa</p>
                <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
                  Fale primeiro com a outra parte pelo chat — a maioria dos casos se resolve ali.
                </p>
              </Link>
              <Link
                href="/minha-conta/seguranca"
                className="rounded-[var(--radius-card)] border p-5 space-y-2 hover:bg-[var(--surface-sunken)] transition-colors"
              >
                <Flag className="size-5 text-[var(--accent)]" aria-hidden />
                <p className="font-semibold text-[0.9375rem]">Denunciar um anúncio, usuário ou mensagem</p>
                <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
                  Toda denúncia é analisada por um moderador — não é resolvida por robô.
                </p>
              </Link>
            </div>

            <Alert tone="info" title="Ainda sem um canal dedicado de suporte">
              A MyPlace ainda não tem uma central de atendimento própria (e-mail ou chat com um
              humano da equipe) fora dos canais acima. Para o que essas duas opções não
              resolverem, essa é a próxima peça a ser construída — dito aqui com honestidade,
              em vez de simular um botão que não leva a lugar nenhum.
            </Alert>
          </div>
        </section>

        <section className="px-4 sm:px-6 pb-16">
          <div className="mx-auto max-w-2xl space-y-4">
            <h2 className="text-[1.125rem] font-semibold">Perguntas frequentes</h2>
            <div className="divide-y rounded-[var(--radius-card)] border">
              {PERGUNTAS.map((f) => (
                <details key={f.p} className="group p-4 sm:p-5">
                  <summary className="font-medium text-[0.9375rem] cursor-pointer list-none flex items-center justify-between gap-3">
                    {f.p}
                    <span className="text-[var(--content-subtle)] transition-transform group-open:rotate-45 shrink-0">+</span>
                  </summary>
                  <p className="mt-2 text-[0.875rem] text-[var(--content-muted)] leading-relaxed">{f.r}</p>
                </details>
              ))}
            </div>
            <p className="text-[0.8125rem] text-[var(--content-subtle)]">
              Veja também <Link href="/como-funciona" className="underline underline-offset-2">Como funciona</Link>{' '}
              e <Link href="/protecao" className="underline underline-offset-2">Como protegemos você</Link>.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
