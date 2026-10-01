import Link from 'next/link';
import { formatBRL } from '@/lib/money';
import { operatingHoursLabel, temporaryRuleLines, type GroupRules } from '@/lib/rentals/pricing';
import type { UnitNoun } from '@/lib/spaces/types';
import { buttonVariants } from '@/components/ui/button';
import { TemporaryBookingForm, type BookableGroup } from './temporary-booking-form';

export type PanelGroup = {
  id: string;
  name: string;
  rules: GroupRules;
  totalUnits: number;
  occupiedNow: number;
  freeForMonthly: number;
};

/** "10 vagas · 7 disponíveis · 3 ocupadas" */
export function unitsSummaryText(noun: UnitNoun, total: number, occupied: number): string {
  const livres = total - occupied;
  const ocupadas = noun.feminino ? (occupied === 1 ? 'ocupada' : 'ocupadas') : (occupied === 1 ? 'ocupado' : 'ocupados');
  return `${total} ${total === 1 ? noun.singular : noun.plural} · ${livres} ${livres === 1 ? 'disponível' : 'disponíveis'} · ${occupied} ${ocupadas}`;
}

/**
 * "Como alugar" na página do anúncio (Parte 12): quantas unidades há e
 * quantas estão livres AGORA (pelo relógio do banco), as regras de cada
 * grupo em linguagem simples, a reserva por tempo e o pedido de aluguel
 * mensal. Nada aqui inventa disponibilidade: os números vêm das reservas.
 */
export function RentalPanel({
  slug, spaceId, noun, groups, loggedIn, temporaryBookable, temporaryBlockedReason, monthlyOpen, temporaryFormProps,
  ownerView = false, depositNote = null,
}: {
  /** O dono vê as regras e a ocupação, sem formulário. */
  ownerView?: boolean;
  depositNote?: string | null;
  slug: string;
  spaceId: string;
  noun: UnitNoun;
  groups: PanelGroup[];
  loggedIn: boolean;
  /** Grupos temporários com pelo menos uma duração válida. */
  temporaryBookable: BookableGroup[];
  /** Por que a reserva por tempo não está disponível agora (pagamentos, recebimento do dono). */
  temporaryBlockedReason: string | null;
  monthlyOpen: boolean;
  temporaryFormProps: {
    needsCpf: boolean;
    renterFeeBps: number;
    today: string;
    maxDate: string;
    holdMinutes: number;
    idempotencyKey: string;
  };
}) {
  const total = groups.reduce((s, g) => s + g.totalUnits, 0);
  const ocupadas = groups.reduce((s, g) => s + g.occupiedNow, 0);
  const mensais = groups.filter((g) => g.rules.allowsContinuous && g.rules.monthlyPriceCents != null);
  const temTemporario = groups.some((g) => g.rules.allowsTemporary);
  const varios = groups.length > 1;
  const voltar = `/entrar?next=${encodeURIComponent(`/espacos/${slug}#alugar`)}`;

  return (
    <section id="alugar" aria-labelledby="alugar-titulo" className="rounded-[var(--radius-card)] border-2 p-5 sm:p-6 space-y-6 scroll-mt-20">
      <header className="space-y-1">
        <h2 id="alugar-titulo" className="font-semibold text-[1.0625rem]">Como alugar</h2>
        {total > 1 && (
          <p className="text-[0.9375rem] text-[var(--content-muted)]" data-testid="resumo-unidades">
            {unitsSummaryText(noun, total, ocupadas)}
          </p>
        )}
      </header>

      {varios && (
        <ul className="divide-y border-y">
          {groups.map((g) => (
            <li key={g.id} className="py-3 space-y-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium">{g.name}</p>
                <p className="text-[0.8125rem] text-[var(--content-muted)] shrink-0">
                  {g.totalUnits - g.occupiedNow} de {g.totalUnits} {g.totalUnits - g.occupiedNow === 1 ? 'disponível' : 'disponíveis'}
                </p>
              </div>
              <GroupRulesText rules={g.rules} />
            </li>
          ))}
        </ul>
      )}
      {!varios && groups[0] && <GroupRulesText rules={groups[0].rules} />}

      {!ownerView && temTemporario && (
        <div className="space-y-3">
          {mensais.length > 0 && <h3 className="font-medium">Por hora, dia ou semana</h3>}
          {temporaryBlockedReason ? (
            <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">{temporaryBlockedReason}</p>
          ) : !loggedIn ? (
            <Link href={voltar} className={buttonVariants({ size: 'lg' })}>Entrar para reservar</Link>
          ) : temporaryBookable.length === 0 ? (
            <p className="text-[0.875rem] text-[var(--content-muted)]">Nenhuma duração disponível agora.</p>
          ) : (
            <TemporaryBookingForm spaceId={spaceId} groups={temporaryBookable} unitNoun={noun} {...temporaryFormProps} />
          )}
        </div>
      )}

      {!ownerView && mensais.length > 0 && (
        <div className="space-y-3">
          {temTemporario && <h3 className="font-medium">Por mês</h3>}
          <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
            Aluguel mensal, com renovação automática e sem data para acabar. Você envia a solicitação; o
            proprietário aceita antes de qualquer cobrança, e você pode cancelar quando quiser.
          </p>
          {depositNote && <p className="text-[0.8125rem] text-[var(--content-subtle)]">{depositNote}</p>}
          {monthlyOpen && mensais.some((g) => g.freeForMonthly > 0) ? (
            <div className="flex flex-wrap gap-2">
              <Link href={`/espacos/${slug}/solicitar`} className={buttonVariants({ size: 'lg', variant: temTemporario ? 'secondary' : 'primary' })}>
                Solicitar aluguel mensal
              </Link>
            </div>
          ) : (
            <p className="text-[0.875rem] text-[var(--content-muted)]">
              Todas as {noun.plural} para aluguel mensal estão ocupadas no momento.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function GroupRulesText({ rules }: { rules: GroupRules }) {
  const linhas: string[] = [];
  if (rules.allowsContinuous && rules.monthlyPriceCents != null) linhas.push(`${formatBRL(rules.monthlyPriceCents)} por mês`);
  linhas.push(...temporaryRuleLines(rules));
  if (rules.allowsTemporary) {
    linhas.push(operatingHoursLabel(rules));
    if (rules.renewalAllowed) linhas.push('Dá para renovar logo depois do fim');
  }
  return (
    <ul className="text-[0.875rem] text-[var(--content-muted)] space-y-0.5">
      {linhas.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}
