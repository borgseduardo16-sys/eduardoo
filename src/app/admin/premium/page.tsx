import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth/dal';
import { getModerationQueueCount } from '@/lib/admin/queries';
import { getPremiumExposure, isBenefitEnabled } from '@/lib/premium/benefit';
import { formatBRL } from '@/lib/money';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { AdminSubnav } from '@/components/layout/admin-subnav';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'Premium — admin' };
export const dynamic = 'force-dynamic';

/**
 * Exposição do benefício do primeiro mês: Premium com direito financeiro × teto
 * (máximo teórico) comparado ao saldo da conta principal do Asaas. O saldo é
 * lido NO SERVIDOR; se o Asaas não responder, a tela diz isso em vez de inventar um número.
 */
export default async function AdminPremiumPage() {
  await requireAdmin();
  const [filaCount, ligado, exp] = await Promise.all([getModerationQueueCount(), isBenefitEnabled(), getPremiumExposure()]);
  const saldoCobre = exp.balanceCents != null ? exp.balanceCents >= exp.maxExposureCents : null;

  return (
    <>
      <SiteHeader />
      <main id="conteudo" className="mx-auto max-w-3xl px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <AdminSubnav active="premium" queueCount={filaCount} />
        <header className="space-y-1">
          <h1 className="text-[1.75rem] font-semibold">Premium — exposição financeira</h1>
          <p className="text-[var(--content-muted)]">
            Benefício do primeiro mês (até R$ 100 por ciclo). Não existe carteira por pessoa: o dinheiro é da plataforma e o direito é controlado pelo banco.
          </p>
        </header>

        <div className="flex items-center gap-2 text-[0.9375rem]">
          Benefício financeiro: {ligado ? <Badge tone="caution">Ligado</Badge> : <Badge tone="neutral">Desligado (feature flag)</Badge>}
        </div>
        {!ligado && (
          <Alert tone="info" title="Nada financeiro está sendo liberado">
            A transferência da conta principal para o proprietário ainda não foi validada no Asaas. Enquanto a flag
            <code> premium.first_month_benefit_enabled</code> estiver desligada, o benefício não é aplicado a ninguém.
          </Alert>
        )}

        <dl className="grid gap-3 sm:grid-cols-2 text-[0.9375rem]">
          <Item rotulo="Premium com direito financeiro vigente" valor={String(exp.eligibleCycles)} />
          <Item rotulo="Ainda sem usar o benefício no ciclo" valor={String(exp.unusedCycles)} />
          <Item rotulo="Exposição máxima teórica (sem uso × teto)" valor={formatBRL(exp.maxExposureCents)} />
          <Item rotulo="Já comprometido (reservado ou consumido)" valor={formatBRL(exp.committedCents)} />
          <Item rotulo="Transferências pendentes ao proprietário" valor={formatBRL(exp.pendingTransferCents)} />
          <Item
            rotulo="Saldo da conta principal no Asaas"
            valor={exp.balanceCents != null ? formatBRL(exp.balanceCents) : 'indisponível'}
          />
        </dl>

        {exp.balanceCents != null ? (
          <Alert tone={saldoCobre ? 'success' : 'warning'} title={saldoCobre ? 'Saldo cobre a exposição máxima' : 'Saldo MENOR que a exposição máxima'}>
            {saldoCobre
              ? 'Se todos os Premium elegíveis usassem o benefício hoje, o saldo da conta principal cobriria.'
              : 'Se todos os Premium elegíveis usassem o benefício hoje, o saldo da conta principal não cobriria. Reponha saldo antes de ligar o benefício.'}
          </Alert>
        ) : (
          <Alert tone="warning" title="Saldo indisponível">
            {exp.balanceError ?? 'Não foi possível consultar o saldo.'} Sem o saldo, a comparação não pode ser feita.
          </Alert>
        )}
      </main>
      <SiteFooter />
    </>
  );
}

function Item({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border p-4 space-y-0.5">
      <dt className="text-[0.8125rem] text-[var(--content-subtle)]">{rotulo}</dt>
      <dd className="font-semibold tabular-nums">{valor}</dd>
    </div>
  );
}
