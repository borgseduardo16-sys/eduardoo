import type { Metadata } from 'next';
import Link from 'next/link';
import { BellRing, ChartColumn, Heart, MapPinned, Percent, Rocket, Sparkle, Star } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/dal';
import { loadFeePolicy } from '@/lib/bookings/fees';
import {
  getBenefitUsage,
  getPremiumCheckoutHints,
  getPremiumOverview,
  type PremiumOverview,
} from '@/lib/premium/queries';
import { cycleBenefitLimit, premiumMapReach, premiumMonthlyPriceCents } from '@/lib/premium/settings';
import { settingInt } from '@/lib/settings';
import { formatBRL, formatBRLShort, formatBps, ownerNetFor, type OwnerFeePolicy } from '@/lib/money';
import { formatBrDate } from '@/lib/time';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { SubscribeForm } from '@/components/premium/subscribe-form';
import { CancelPremiumForm, ResumePremiumForm } from '@/components/premium/manage-buttons';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Premium',
  description: 'Assinatura mensal com Destaques, Turbo e alcance ampliado no mapa para os seus anúncios.',
};

/** Os benefícios do Premium. Números (cota por ciclo, alcance) vêm do banco — nada fixo no texto. */
function beneficios(v: {
  destaques: number;
  turbos: number;
  extraKm: number;
  pinsFora: number;
  alertasFree: number;
  alertasPremium: number;
  horasFree: number;
  horasPremium: number;
  taxa: OwnerFeePolicy;
}) {
  const horas = (h: number) => (h === 1 ? '1 hora' : `${h} horas`);
  // Exemplo com o aluguel de R$ 300 (a conta é a mesma do repasse; o texto não digita valor nenhum).
  const exemploCents = 30000;
  const taxaReduzida = v.taxa.premiumBps < v.taxa.standardBps && exemploCents >= v.taxa.premiumMinRentCents;
  const liquidoPadrao = ownerNetFor(exemploCents, v.taxa.standardBps).netCents;
  const liquidoPremium = ownerNetFor(exemploCents, v.taxa.premiumBps).netCents;
  return [
    {
      icon: Star,
      titulo: `${v.destaques} Destaques por ciclo`,
      descricao:
        'Mais exposição para os seus espaços no marketplace e na busca. Cada período pago de um mês é um ciclo; o que não for usado não passa para o ciclo seguinte.',
      disponivel: true,
    },
    {
      icon: Rocket,
      titulo: `${v.turbos} Turbo por ciclo`,
      descricao: 'Prioridade mais forte para um anúncio, por um período curto. Também não acumula.',
      disponivel: true,
    },
    ...(v.taxa.premiumBps < v.taxa.standardBps
      ? [
          {
            icon: Percent,
            titulo: `Taxa de ${formatBps(v.taxa.premiumBps)} para quem anuncia`,
            descricao:
              `Nos aluguéis a partir de ${formatBRL(v.taxa.premiumMinRentCents)} por mês, a taxa de serviço do proprietário cai de ${formatBps(v.taxa.standardBps)} para ${formatBps(v.taxa.premiumBps)}.` +
              (taxaReduzida
                ? ` Em um aluguel de ${formatBRLShort(exemploCents)}, você recebe ${formatBRLShort(liquidoPremium)} em vez de ${formatBRLShort(liquidoPadrao)}.`
                : '') +
              ` Abaixo de ${formatBRL(v.taxa.premiumMinRentCents)} vale a taxa padrão. A taxa acompanha o seu Premium: se ele acabar, as próximas mensalidades das suas locações voltam a ${formatBps(v.taxa.standardBps)}. A taxa de quem aluga não muda.`,
            disponivel: true,
          },
        ]
      : []),
    {
      icon: MapPinned,
      titulo: 'Alcance ampliado no mapa',
      descricao: `Seus anúncios podem aparecer até ${v.extraKm} km além do raio normal da busca — no máximo ${v.pinsFora} anúncios seus individuais fora do raio, sempre atrás de Turbo e Destaque e como anúncios normais, sem rótulo de “Destaque”. Respeita os filtros, a categoria e a disponibilidade.`,
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
      descricao:
        'Ainda sem recurso exclusivo. Hoje todo mundo já recebe aviso de queda de preço e de volta da disponibilidade nos favoritos.',
      disponivel: false,
    },
    {
      icon: ChartColumn,
      titulo: 'Painel de desempenho completo',
      descricao:
        'Últimos 3 meses, período personalizado e histórico mensal completo dos seus anúncios. No plano gratuito: 7 e 30 dias, mês atual e anterior.',
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

export default async function PremiumPage({ searchParams }: { searchParams: Promise<{ assinatura?: string }> }) {
  const [user, sp] = await Promise.all([getCurrentUser(), searchParams]);
  const [
    visao,
    uso,
    dicas,
    preco,
    destaques,
    turbos,
    alcance,
    alertasFree,
    alertasPremium,
    horasFree,
    horasPremium,
    politicaTaxas,
  ] = await Promise.all([
    user ? getPremiumOverview(user.id) : Promise.resolve(null),
    user ? getBenefitUsage(user.id) : Promise.resolve(null),
    user ? getPremiumCheckoutHints(user.id) : Promise.resolve(null),
    premiumMonthlyPriceCents(),
    cycleBenefitLimit('destaque'),
    cycleBenefitLimit('turbo'),
    premiumMapReach(),
    settingInt('alerts.saved_search_max_free', 2),
    settingInt('alerts.saved_search_max_premium', 20),
    settingInt('alerts.digest_hours_free', 24),
    settingInt('alerts.digest_hours_premium', 1),
    loadFeePolicy(),
  ]);
  const lista = beneficios({
    destaques,
    turbos,
    extraKm: Math.round(alcance.extraRadiusM / 1000),
    pinsFora: alcance.maxOutsidePins,
    alertasFree,
    alertasPremium,
    horasFree,
    horasPremium,
    taxa: politicaTaxas.owner,
  });
  const precoTexto = preco ? formatBRL(preco) : null;
  const ativo = visao?.isActive === true;

  return (
    <>
      <SiteHeader />

      <main id="conteudo">
        <section className="px-4 sm:px-6 pt-12 pb-10 sm:pt-16">
          <div className="mx-auto max-w-2xl space-y-4">
            <p className="flex items-center gap-1.5 text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--accent)]">
              <Sparkle className="size-3.5 text-[var(--premium-star)]" aria-hidden fill="currentColor" />
              Premium
            </p>
            <h1 className="text-[2rem] sm:text-[2.5rem] leading-[1.1] font-semibold">
              {ativo
                ? 'Meu Premium'
                : visao?.state === 'pending_payment'
                  ? 'Falta só o pagamento'
                  : 'Aumente a exposição dos seus anúncios'}
            </h1>
            <p className="text-[1.0625rem] text-[var(--content-muted)] leading-relaxed">
              Destaques e Turbo a cada período pago, taxa de serviço menor para quem anuncia, alcance ampliado no
              mapa, mais alertas, o painel de desempenho completo e o selo Premium.
            </p>
            {precoTexto ? (
              <p className="text-[0.9375rem]">
                <span className="font-semibold">{precoTexto}</span> por mês, assinatura mensal recorrente.
              </p>
            ) : (
              <p className="text-[0.9375rem] text-[var(--content-muted)]">Preço ainda não definido.</p>
            )}
          </div>
        </section>

        <section className="px-4 sm:px-6 pb-12">
          <div className="mx-auto max-w-2xl space-y-6">
            {sp.assinatura === 'aguardando' && (
              <Alert tone="info" title="Aguardando a confirmação do pagamento">
                Assim que o pagamento for confirmado, seu Premium é ativado automaticamente. Atualize esta página em
                instantes.
              </Alert>
            )}

            {user && visao && uso ? (
              <PainelDaConta
                visao={visao}
                uso={uso}
                precoTexto={precoTexto}
                cpfSugerido={dicas?.cpfSuggested ?? null}
                pedirCpf={dicas?.needsCpf ?? true}
                taxa={politicaTaxas.owner}
              />
            ) : (
              <div className="rounded-[var(--radius-card)] border p-5 sm:p-6 space-y-3">
                <p className="font-medium">Entre na sua conta para assinar</p>
                <Link
                  href="/entrar?next=/premium"
                  className="inline-flex h-11 items-center rounded-[var(--radius-field)] bg-[var(--accent)] px-5 text-[0.9375rem] font-medium text-[var(--accent-content)]"
                >
                  Entrar
                </Link>
              </div>
            )}

            <h2 className="pt-2 font-semibold">O que o Premium inclui</h2>
            <ul className="divide-y border-y" aria-label="Benefícios do Premium">
              {lista.map((b) => (
                <li key={b.titulo} className="flex gap-3 py-4">
                  <b.icon className="size-5 shrink-0 mt-0.5 text-[var(--accent)]" aria-hidden />
                  <div className="min-w-0 space-y-1">
                    <h3 className="flex flex-wrap items-center gap-2 font-semibold text-[0.9375rem] leading-snug">
                      {b.titulo}
                      {!b.disponivel && (
                        <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-[var(--content-subtle)]">
                          Em preparação
                        </span>
                      )}
                    </h3>
                    <p className="text-[0.8125rem] text-[var(--content-muted)] leading-relaxed">{b.descricao}</p>
                  </div>
                </li>
              ))}
            </ul>

            <p className="text-[0.8125rem] text-[var(--content-subtle)] leading-relaxed">
              Os benefícios valem por ciclo pago, não acumulam — o que não for usado não passa para o ciclo seguinte — e
              não podem ser transferidos para outra conta. Cancelar a assinatura não encerra o Premium na hora: você
              continua Premium até o fim do período já pago. Não há reembolso proporcional.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

function PainelDaConta({
  visao,
  uso,
  precoTexto,
  pedirCpf,
  cpfSugerido,
  taxa,
}: {
  visao: PremiumOverview;
  uso: Awaited<ReturnType<typeof getBenefitUsage>>;
  precoTexto: string | null;
  pedirCpf: boolean;
  cpfSugerido: string | null;
  taxa: OwnerFeePolicy;
}) {
  // Pagar o que está em aberto: a primeira cobrança (ainda sem Premium) ou a renovação.
  const cobranca = visao.openCharge;

  if (visao.isActive && visao.cycle) {
    const fim = formatBrDate(visao.cycle.endsAt);
    const naoRenova = visao.cancelAtPeriodEnd;
    return (
      <div className="rounded-[var(--radius-card)] border p-5 sm:p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-[0.8125rem] text-[var(--content-muted)]">Situação</p>
            <p className="font-semibold">Premium ativo</p>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            {visao.adminTest && <Badge tone="caution">Modo teste/suporte</Badge>}
            {naoRenova ? <Badge tone="caution">Não renova</Badge> : <Badge tone="positive">Ativo</Badge>}
          </div>
        </div>

        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 text-[0.875rem]">
          <Dado rotulo="Período atual" valor={`${formatBrDate(visao.cycle.startsAt)} a ${fim}`} />
          <Dado
            rotulo={naoRenova || visao.adminTest ? 'Termina em' : 'Próxima renovação'}
            valor={fim}
          />
          {!visao.adminTest && (
            <>
              <Dado rotulo="Valor" valor={visao.planCents ? `${formatBRL(visao.planCents)} por mês` : (precoTexto ?? '—')} />
              <Dado
                rotulo="Pagamento"
                valor={visao.billingMethod === 'credit_card' ? 'Cartão — cobrança automática' : 'Pix — uma cobrança por mês'}
              />
            </>
          )}
        </dl>

        {visao.adminTest && (
          <Alert tone="warning" title="Premium liberado pela administração">
            Concessão de teste ou suporte, sem cobrança, até {fim}.{' '}
            {visao.financialEligible
              ? 'Os benefícios financeiros estão liberados para este teste.'
              : 'Os benefícios financeiros (como a taxa reduzida) não valem neste modo.'}
          </Alert>
        )}

        <div className="space-y-5 border-t pt-5">
          <h2 className="font-semibold">Seus benefícios neste ciclo</h2>
          <ConsumoBeneficio label="Destaques" usado={uso.destaque.used} limite={uso.destaque.limit} />
          <ConsumoBeneficio label="Turbo" usado={uso.turbo.used} limite={uso.turbo.limit} />
          {taxa.premiumBps < taxa.standardBps && (
            <p className="text-[0.875rem]">
              <span className="font-medium">Taxa de serviço do proprietário:</span>{' '}
              {visao.financialEligible ? (
                <span className="text-[var(--content-muted)]">
                  {formatBps(taxa.premiumBps)} nos aluguéis a partir de {formatBRL(taxa.premiumMinRentCents)} (em vez de{' '}
                  {formatBps(taxa.standardBps)}) enquanto o Premium estiver ativo. Se ele acabar, as próximas mensalidades voltam a {formatBps(taxa.standardBps)}.
                </span>
              ) : (
                <span className="text-[var(--content-muted)]">
                  {formatBps(taxa.standardBps)} — a taxa reduzida não vale neste modo.
                </span>
              )}
            </p>
          )}
          <p className="text-[0.75rem] text-[var(--content-subtle)]">
            Novos benefícios quando o próximo ciclo for pago. Ative em{' '}
            <Link href="/meus-espacos" className="underline underline-offset-2">
              Meus espaços
            </Link>
            .
          </p>
        </div>

        {!visao.adminTest && cobranca && !naoRenova && (
          <Alert tone="info" title="Renovação para pagar">
            A cobrança da renovação vence em {formatBrDate(new Date(`${cobranca.dueDate}T12:00:00`))} ({formatBRL(cobranca.amountCents)}).{' '}
            {cobranca.invoiceUrl && (
              <a href={cobranca.invoiceUrl} className="font-medium underline underline-offset-2">
                Pagar agora
              </a>
            )}
          </Alert>
        )}

        {!visao.adminTest && (
          <div className="border-t pt-5">
            {naoRenova ? (
              <div className="space-y-3">
                <Alert tone="warning" title="A renovação está cancelada">
                  Você continua Premium até {fim}. Depois disso, o Premium termina e não há nova cobrança.
                </Alert>
                <ResumePremiumForm fimTexto={fim} />
              </div>
            ) : (
              <CancelPremiumForm pendente={false} fimTexto={fim} />
            )}
          </div>
        )}
      </div>
    );
  }

  if (visao.state === 'pending_payment') {
    return (
      <div className="rounded-[var(--radius-card)] border p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-[0.8125rem] text-[var(--content-muted)]">Situação</p>
            <p className="font-semibold">Aguardando o pagamento</p>
          </div>
          <Badge tone="caution">Ainda não é Premium</Badge>
        </div>
        <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
          Seu Premium só começa quando o pagamento for confirmado. Se você já pagou, aguarde alguns instantes e
          atualize a página.
        </p>
        {cobranca?.invoiceUrl && (
          <a
            href={cobranca.invoiceUrl}
            className="inline-flex h-11 items-center rounded-[var(--radius-field)] bg-[var(--accent)] px-5 text-[0.9375rem] font-medium text-[var(--accent-content)]"
          >
            Pagar agora ({formatBRL(cobranca.amountCents)})
          </a>
        )}
        <CancelPremiumForm pendente fimTexto={null} />
      </div>
    );
  }

  // Nunca assinou, ou o período pago já acabou.
  return (
    <div className="rounded-[var(--radius-card)] border p-5 sm:p-6 space-y-5">
      {visao.state === 'ended' && visao.lastEndedAt && (
        <Alert tone="info" title="Seu Premium terminou">
          O período pago terminou em {formatBrDate(visao.lastEndedAt)}. Seus anúncios continuam no ar; os benefícios
          deixaram de valer. Você pode assinar de novo quando quiser.
        </Alert>
      )}
      {precoTexto ? (
        <>
          <h2 className="font-semibold">Assinar o Premium</h2>
          <SubscribeForm precoTexto={precoTexto} pedirCpf={pedirCpf} cpfSugerido={cpfSugerido} />
        </>
      ) : (
        <p className="text-[0.875rem] text-[var(--content-muted)]">
          A assinatura ainda não está disponível: o preço do plano não foi definido.
        </p>
      )}
    </div>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-[0.75rem] text-[var(--content-subtle)]">{rotulo}</dt>
      <dd className="font-medium">{valor}</dd>
    </div>
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
        <div className={cn('h-full rounded-full bg-[var(--accent)] transition-[width]')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
