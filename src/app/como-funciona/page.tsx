import type { Metadata } from 'next';
import Link from 'next/link';
import { Search, MessageCircle, ShieldCheck, Wallet, Camera, Rocket, CircleCheck } from 'lucide-react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';

export const metadata: Metadata = {
  title: 'Como funciona',
  description: 'O passo a passo de quem procura espaço e de quem tem espaço sobrando, na MyPlace.',
};

const PASSOS_PROCURA = [
  { icon: Search, titulo: 'Busque perto de você', texto: 'Por cidade, bairro, endereço ou sua localização atual. Filtre por tipo, preço e características.' },
  { icon: MessageCircle, titulo: 'Solicite e converse', texto: 'Envie uma solicitação com a data que precisa. Combine detalhes com o anunciante pelo chat da plataforma.' },
  { icon: ShieldCheck, titulo: 'Visite antes de fechar', texto: 'O endereço completo só aparece depois que o proprietário aceita — mas você sempre pode (e deve) visitar antes de pagar.' },
  { icon: Wallet, titulo: 'Pague pela plataforma', texto: 'Assinatura mensal recorrente, cobrada automaticamente. Nada de dinheiro na mão ou combinar "por fora".' },
];

const PASSOS_ANUNCIA = [
  { icon: Camera, titulo: 'Publique em poucos minutos', texto: 'Tipo, localização, fotos (mínimo de 3), preço e regras de uso. Sem burocracia.' },
  { icon: MessageCircle, titulo: 'Responda solicitações', texto: 'Quem se interessar te manda uma solicitação. Você aceita ou recusa, sem compromisso até aceitar.' },
  { icon: Rocket, titulo: 'Ganhe mais visibilidade (opcional)', texto: 'Destaque ou Turbo aumentam a posição do seu anúncio nos resultados — sempre respeitando a relevância pra quem busca.' },
  { icon: Wallet, titulo: 'Receba todo mês', texto: 'O pagamento cai automaticamente, já com a taxa da plataforma descontada. Sem precisar cobrar ninguém.' },
];

export default function ComoFuncionaPage() {
  return (
    <>
      <SiteHeader />

      <main id="conteudo">
        <section className="px-4 sm:px-6 pt-12 pb-10 sm:pt-16">
          <div className="mx-auto max-w-2xl space-y-4">
            <h1 className="text-[2rem] sm:text-[2.5rem] leading-[1.1] font-semibold">
              Como funciona a MyPlace
            </h1>
            <p className="text-[1.0625rem] text-[var(--content-muted)] leading-relaxed">
              Conectamos quem tem espaço sobrando — garagem, depósito, galpão, sala, quarto —
              a quem precisa de espaço perto de casa. Tudo combinado e pago pela plataforma,
              nunca por fora.
            </p>
          </div>
        </section>

        <section className="px-4 sm:px-6 pb-12 sm:pb-16">
          <div className="mx-auto max-w-4xl space-y-3">
            <h2 className="text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--content-subtle)]">
              Se você procura um espaço
            </h2>
            <ol className="grid gap-4 sm:grid-cols-2">
              {PASSOS_PROCURA.map((p, i) => (
                <li key={p.titulo} className="rounded-[var(--radius-card)] border p-5 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center size-6 rounded-full bg-[var(--surface-sunken)] text-[0.75rem] font-semibold shrink-0">
                      {i + 1}
                    </span>
                    <p.icon className="size-4 text-[var(--accent)]" aria-hidden />
                  </div>
                  <h3 className="font-semibold text-[0.9375rem]">{p.titulo}</h3>
                  <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">{p.texto}</p>
                </li>
              ))}
            </ol>
            <Link href="/espacos" className="inline-block text-[0.875rem] text-[var(--accent)] underline underline-offset-4">
              Ver espaços disponíveis
            </Link>
          </div>
        </section>

        <section className="px-4 sm:px-6 pb-12 sm:pb-16 bg-[var(--surface-sunken)] border-y py-12 sm:py-16">
          <div className="mx-auto max-w-4xl space-y-3">
            <h2 className="text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--content-subtle)]">
              Se você tem um espaço parado
            </h2>
            <ol className="grid gap-4 sm:grid-cols-2">
              {PASSOS_ANUNCIA.map((p, i) => (
                <li key={p.titulo} className="rounded-[var(--radius-card)] border bg-[var(--surface)] p-5 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center size-6 rounded-full bg-[var(--surface-sunken)] text-[0.75rem] font-semibold shrink-0">
                      {i + 1}
                    </span>
                    <p.icon className="size-4 text-[var(--accent)]" aria-hidden />
                  </div>
                  <h3 className="font-semibold text-[0.9375rem]">{p.titulo}</h3>
                  <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">{p.texto}</p>
                </li>
              ))}
            </ol>
            <Link href="/anunciar" className="inline-block text-[0.875rem] text-[var(--accent)] underline underline-offset-4">
              Anunciar meu espaço
            </Link>
          </div>
        </section>

        <section className="px-4 sm:px-6 py-12 sm:py-16">
          <div className="mx-auto max-w-2xl space-y-4">
            <h2 className="text-[1.375rem] font-semibold">Por que fechar pela plataforma</h2>
            <ul className="space-y-3">
              {[
                'Conversa registrada — em caso de problema, existe histórico.',
                'Pagamento rastreável, sem dinheiro em espécie ou combinado por fora.',
                'Localização exata do espaço só é revelada depois que a reserva é aceita.',
                'Denúncia e suspensão de conta para quem descumpre as regras.',
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-[0.9375rem] text-[var(--content-muted)]">
                  <CircleCheck className="size-4 mt-0.5 shrink-0 text-[var(--color-positive)]" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
            <Link href="/protecao" className="inline-block text-[0.875rem] text-[var(--accent)] underline underline-offset-4">
              Ver como protegemos você em detalhe
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
