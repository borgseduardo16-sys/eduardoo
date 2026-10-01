'use client';

import { useActionState, useId, useState } from 'react';
import { requestBookingAction, type BookingActionState } from '@/lib/bookings/actions';
import { computeBookingAmounts, formatBRL } from '@/lib/money';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/auth/form-shell';
import { cn } from '@/lib/utils';

/** Grupo de aluguel mensal do anúncio (Parte 12), como o servidor calculou. */
export type MonthlyGroupOption = {
  id: string;
  name: string;
  monthlyRentCents: number;
  /** Unidades sem nenhuma reserva daqui em diante. */
  freeForMonthly: number;
  total: number;
};

/**
 * Formulario de solicitacao de aluguel.
 *
 * Os valores mostrados aqui (taxa, total) sao calculados com a MESMA funcao
 * pura que o servidor usa (`computeBookingAmounts`) — nao ha segredo nisso,
 * so aritmetica. O que decide de verdade quando o formulario e enviado e o
 * servidor, que recalcula tudo de novo com a taxa vigente naquele instante
 * (ver src/lib/bookings/actions.ts) — o que aparece aqui e prevhappy-path
 * honesto, nao uma promessa vinculante.
 *
 * O sucesso NAO e tratado aqui com `useEffect` + `router.push`: a action
 * redireciona ela mesma (`redirect()`) para /reservas. Depois de qualquer
 * Server Action o Next atualiza a rota atual sozinho, e esta mesma pagina
 * decide o que mostrar consultando se ja existe uma solicitacao — se o
 * redirecionamento dependesse de um efeito deste componente, essa
 * atualizacao automatica poderia trocar o componente por baixo antes do
 * efeito rodar, e o redirecionamento simplesmente nunca aconteceria.
 */
export function RequestBookingForm({
  spaceId,
  spaceTitle,
  groups,
  initialGroupId,
  unitPlural,
  renterFeeBps,
  ownerFeeBps,
  minStartDate,
}: {
  spaceId: string;
  spaceTitle: string;
  /** Grupos que aceitam aluguel mensal (Parte 12). Um só = escolha invisível. */
  groups: MonthlyGroupOption[];
  initialGroupId: string;
  unitPlural: string;
  renterFeeBps: number;
  ownerFeeBps: number;
  /** ISO yyyy-mm-dd — hoje, calculado no servidor (nao confia no relogio do navegador). */
  minStartDate: string;
}) {
  const id = useId();
  const [startDate, setStartDate] = useState(minStartDate);
  const [groupId, setGroupId] = useState(initialGroupId);
  const grupo = groups.find((g) => g.id === groupId) ?? groups[0]!;
  const monthlyRentCents = grupo.monthlyRentCents;
  const [state, action] = useActionState<BookingActionState | undefined, FormData>(
    requestBookingAction,
    undefined,
  );

  const amounts = computeBookingAmounts(monthlyRentCents, { renterFeeBps, ownerFeeBps });
  const dataFormatada = startDate
    ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(
        new Date(`${startDate}T00:00:00`),
      )
    : '—';

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="groupId" value={grupo.id} />

      {state?.message && !state.ok && <Alert tone="critical">{state.message}</Alert>}

      {groups.length > 1 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium mb-1">Qual opção?</legend>
          {groups.map((g) => {
            const ativo = g.id === grupo.id;
            const lotado = g.freeForMonthly === 0;
            return (
              <label
                key={g.id}
                className={cn(
                  'flex items-start justify-between gap-3 rounded-[var(--radius-field)] border px-3.5 py-2.5',
                  lotado ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
                  ativo ? 'border-[var(--accent)] bg-[var(--accent-subtle)] ring-1 ring-[var(--accent)]' : !lotado && 'hover:border-[var(--content-subtle)]',
                )}
              >
                <input
                  type="radio" name="grupo" value={g.id} checked={ativo} disabled={lotado}
                  onChange={() => setGroupId(g.id)} className="sr-only"
                />
                <span className="space-y-0.5">
                  <span className="block font-medium">{g.name}</span>
                  <span className="block text-[0.8125rem] text-[var(--content-muted)] tabular-nums">{formatBRL(g.monthlyRentCents)} por mês</span>
                </span>
                <span className="text-[0.8125rem] text-[var(--content-muted)] text-right shrink-0">
                  {lotado ? 'Todas ocupadas' : `${g.freeForMonthly} de ${g.total} ${unitPlural} livres`}
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      <Field label="A partir de quando?" htmlFor={`${id}-data`}>
        <Input
          name="startDate"
          type="date"
          min={minStartDate}
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          required
        />
      </Field>

      <Field label="Mensagem para o proprietário" htmlFor={`${id}-msg`} optional
        hint="Conte rapidamente o que você pretende guardar ou usar o espaço, e por quanto tempo.">
        <Textarea
          id={`${id}-msg`}
          name="renterMessage"
          maxLength={600}
          placeholder="Ex.: preciso para guardar uma moto, uso diário."
        />
      </Field>

      <div data-testid="resumo-solicitacao" className="rounded-[var(--radius-card)] border p-4 sm:p-5 space-y-3 bg-[var(--surface-sunken)]">
        <p className="text-[0.75rem] font-medium uppercase tracking-wide text-[var(--content-subtle)]">
          Resumo
        </p>
        <dl className="space-y-2 text-[0.9375rem]">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[var(--content-muted)]">Espaço</dt>
            <dd className="font-medium text-right">{spaceTitle}{groups.length > 1 ? ` — ${grupo.name}` : ''}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[var(--content-muted)]">Aluguel mensal</dt>
            <dd className="tabular-nums">{formatBRL(amounts.monthlyRentCents)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[var(--content-muted)]">Taxa da plataforma ({(amounts.renterFeeBps / 100).toFixed(0)}%)</dt>
            <dd className="tabular-nums">{formatBRL(amounts.renterFeeCents)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 pt-2 border-t font-semibold">
            <dt>Total mensal, se aceito</dt>
            <dd className="tabular-nums">{formatBRL(amounts.totalChargedCents)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[var(--content-muted)]">Período</dt>
            <dd className="text-right">A partir de {dataFormatada}, renovação automática todo mês</dd>
          </div>
        </dl>
        <p className="text-[0.75rem] text-[var(--content-subtle)] leading-relaxed">
          Este valor é uma estimativa com a taxa de hoje. Nada é cobrado ao enviar a
          solicitação — a cobrança só existe depois que o proprietário aceitar e você
          confirmar o pagamento.
        </p>
      </div>

      <SubmitButton>Enviar solicitação</SubmitButton>
    </form>
  );
}
