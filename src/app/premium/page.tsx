import type { Metadata } from 'next';
import { Rocket, Sparkle, Star } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/dal';
import { getMonthlyBenefitUsage } from '@/lib/promotions/queries';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Premium',
  description: 'Destaques e Turbo gratuitos todo mês para aumentar a exposição dos seus anúncios.',
};

const BENEFICIOS = [
  {
    icon: Star,
    titulo: '2 Destaques gratuitos/mês',
    descricao: 'Aumente a exposição dos seus espaços no marketplace e na busca.',
  },
  {
    icon: Rocket,
    titulo: '1 Turbo gratuito/mês',
    descricao: 'Dê ainda mais prioridade a um anúncio, por um período mais curto e intenso.',
  },
  {
    icon: Sparkle,
    titulo: 'Selo de Membro Premium',
    descricao: 'Mostre que você faz parte do programa no seu perfil e nos seus anúncios.',
  },
];

export default async function PremiumPage() {
  const user = await getCurrentUser();
  const uso = user ? await getMonthlyBenefitUsage(user.id) : null;

  return (
    <>
      <SiteHeader />

      <main id="conteudo">
        <section className="px-4 sm:px-6 pt-12 pb-10 sm:pt-16">
          <div className="mx-auto max-w-2xl space-y-4">
            <p className="flex items-center gap-1.5 text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--accent)]">
              <Sparkle className="size-3.5" aria-hidden fill="currentColor" />
              Premium
            </p>
            <h1 className="text-[2rem] sm:text-[2.5rem] leading-[1.1] font-semibold">
              {uso?.premium ? 'Seu Premium' : 'Aumente a exposição dos seus anúncios'}
            </h1>
            <p className="text-[1.0625rem] text-[var(--content-muted)] leading-relaxed">
              Quem tem espaço para anunciar recebe, todo mês, Destaques e Turbo gratuitos para
              aparecer mais dentro do marketplace.
            </p>
          </div>
        </section>

        <section className="px-4 sm:px-6 pb-12">
          <div className="mx-auto max-w-2xl space-y-6">
            <ul className="grid gap-4 sm:grid-cols-3">
              {BENEFICIOS.map((b) => (
                <li key={b.titulo} className="rounded-[var(--radius-card)] border p-5 space-y-2">
                  <b.icon className="size-5 text-[var(--accent)]" aria-hidden />
                  <h2 className="font-semibold text-[0.9375rem] leading-snug">{b.titulo}</h2>
                  <p className="text-[0.8125rem] text-[var(--content-muted)] leading-relaxed">
                    {b.descricao}
                  </p>
                </li>
              ))}
            </ul>

            <p className="text-[0.8125rem] text-[var(--content-subtle)] leading-relaxed">
              Os benefícios são renovados todo mês, não acumulam — o que não for usado não passa
              para o mês seguinte — e não podem ser transferidos para outra conta.
            </p>

            {uso?.premium ? (
              <div className="rounded-[var(--radius-card)] border p-5 sm:p-6 space-y-5">
                <h2 className="font-semibold">Seus benefícios deste mês</h2>
                <ConsumoBeneficio label="Destaques" usado={uso.destaque.used} limite={uso.destaque.limit} />
                <ConsumoBeneficio label="Turbo" usado={uso.turbo.used} limite={uso.turbo.limit} />
                <p className="text-[0.75rem] text-[var(--content-subtle)]">
                  Renova em {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' }).format(uso.periodEnd)}.
                  Ative em <a href="/meus-espacos" className="underline underline-offset-2">Meus espaços</a>.
                </p>
              </div>
            ) : (
              <div className="rounded-[var(--radius-card)] border border-dashed p-5 sm:p-6 space-y-2">
                <p className="font-medium text-[0.9375rem]">Assinatura ainda não disponível</p>
                <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
                  O plano pago do Premium está em preparação. Quando estiver pronto, esta página
                  passa a mostrar como assinar — sem precisar caçar informação em outro lugar.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

function ConsumoBeneficio({ label, usado, limite }: { label: string; usado: number; limite: number }) {
  const pct = limite > 0 ? Math.min(100, (usado / limite) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <p className="text-[0.875rem] font-medium">{label}</p>
        <p className="text-[0.8125rem] tabular-nums text-[var(--content-muted)]">
          {usado} de {limite} utilizado{limite === 1 ? '' : 's'}
        </p>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
        <div
          className={cn('h-full rounded-full bg-[var(--accent)] transition-[width]')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
