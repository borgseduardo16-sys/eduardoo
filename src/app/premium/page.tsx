import type { Metadata } from 'next';
import { BellRing, ChartColumn, Heart, Rocket, Sparkle, Star } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/dal';
import { getMonthlyBenefitUsage } from '@/lib/promotions/queries';
import { monthlyBenefitLimit, premiumPlanPrices } from '@/lib/promotions/settings';
import { settingInt } from '@/lib/settings';
import { formatBRL } from '@/lib/money';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Premium',
  description: 'Destaques e Turbo gratuitos todo mês para aumentar a exposição dos seus anúncios.',
};

/** Os 6 benefícios definidos para o Premium (Fase 13 e Fase 23). Valores de cota vêm do banco. */
function beneficios(v: {
  destaques: number; turbos: number;
  alertasFree: number; alertasPremium: number; horasFree: number; horasPremium: number;
}) {
  const horas = (h: number) => (h === 1 ? '1 hora' : `${h} horas`);
  return [
    {
      icon: Star,
      titulo: `${v.destaques} Destaques gratuitos por mês`,
      descricao: 'Mais exposição para os seus espaços no marketplace e na busca.',
      disponivel: true,
    },
    {
      icon: Rocket,
      titulo: `${v.turbos} Turbo gratuito por mês`,
      descricao: 'Prioridade mais forte para um anúncio, por um período curto.',
      disponivel: true,
    },
    {
      icon: BellRing,
      titulo: 'Alertas de novos espaços',
      descricao: `Até ${v.alertasPremium} alertas de busca ativos, com aviso em até ${horas(v.horasPremium)}. No plano gratuito: ${v.alertasFree} alertas e um resumo a cada ${horas(v.horasFree)}.`,
      disponivel: true,
    },
    {
      icon: Heart,
      titulo: 'Favoritos avançados',
      descricao: 'Ainda sem recurso exclusivo. Hoje todo mundo já recebe aviso de queda de preço e de volta da disponibilidade nos favoritos.',
      disponivel: false,
    },
    {
      icon: ChartColumn,
      titulo: 'Painel de desempenho completo',
      descricao: 'Últimos 3 meses, período personalizado e histórico mensal completo dos seus anúncios. No plano gratuito: 7 e 30 dias, mês atual e anterior.',
      disponivel: true,
    },
    {
      icon: Sparkle,
      titulo: 'Selo Premium',
      descricao: 'Aparece no seu perfil e nos seus anúncios.',
      disponivel: true,
    },
  ];
}

export default async function PremiumPage() {
  const user = await getCurrentUser();
  const [uso, precos, destaques, turbos, alertasFree, alertasPremium, horasFree, horasPremium] = await Promise.all([
    user ? getMonthlyBenefitUsage(user.id) : Promise.resolve(null),
    premiumPlanPrices(),
    monthlyBenefitLimit('destaque'),
    monthlyBenefitLimit('turbo'),
    settingInt('alerts.saved_search_max_free', 2),
    settingInt('alerts.saved_search_max_premium', 20),
    settingInt('alerts.digest_hours_free', 24),
    settingInt('alerts.digest_hours_premium', 1),
  ]);
  const lista = beneficios({ destaques, turbos, alertasFree, alertasPremium, horasFree, horasPremium });

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
              Destaques e Turbo gratuitos todo mês, mais alertas, o painel de desempenho completo e o
              selo Premium.
            </p>
            {precos && (
              <p className="text-[0.9375rem]">
                <span className="font-semibold">{formatBRL(precos.monthlyCents)}</span> por mês ou{' '}
                <span className="font-semibold">{formatBRL(precos.yearlyCents)}</span> por ano.
              </p>
            )}
          </div>
        </section>

        <section className="px-4 sm:px-6 pb-12">
          <div className="mx-auto max-w-2xl space-y-6">
            <ul className="divide-y border-y" aria-label="Benefícios do Premium">
              {lista.map((b) => (
                <li key={b.titulo} className="flex gap-3 py-4">
                  <b.icon className="size-5 shrink-0 mt-0.5 text-[var(--accent)]" aria-hidden />
                  <div className="min-w-0 space-y-1">
                    <h2 className="flex flex-wrap items-center gap-2 font-semibold text-[0.9375rem] leading-snug">
                      {b.titulo}
                      {!b.disponivel && (
                        <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-[var(--content-subtle)]">
                          Em preparação
                        </span>
                      )}
                    </h2>
                    <p className="text-[0.8125rem] text-[var(--content-muted)] leading-relaxed">{b.descricao}</p>
                  </div>
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
                  O plano pago do Premium está em preparação: nenhuma cobrança é feita por esta página.
                  Quando a assinatura estiver pronta, ela aparece aqui.
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
