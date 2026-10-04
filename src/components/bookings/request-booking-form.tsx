'use client';

import { useActionState, useId, useState } from 'react';
import { requestBookingAction, type BookingActionState } from '@/lib/bookings/actions';
import { computeBookingAmounts, formatBRL, formatBps } from '@/lib/money';
import { blockCoveringStart, type SpaceBlockPublic } from '@/lib/spaces/start-dates';
import { formatBookingDate } from '@/lib/bookings/format';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/auth/form-shell';

/**
 * Formulário de SOLICITAÇÃO de locação mensal.
 *
 * Os valores mostrados (taxa, total) saem da MESMA função pura que o servidor
 * usa (`computeBookingAmounts`) — não há segredo nisso, só aritmética. O que
 * decide de verdade, quando o formulário é enviado, é o servidor, que
 * recalcula tudo com a taxa vigente naquele instante: o resumo é uma
 * estimativa honesta, não uma promessa. O navegador NUNCA envia preço: só o
 * id do anúncio, a data e a mensagem.
 *
 * O sucesso NÃO é tratado aqui com `useEffect` + `router.push`: a action
 * redireciona ela mesma (`redirect()`) para a página da locação. Depois de
 * qualquer Server Action o Next atualiza a rota atual sozinho, e esta mesma
 * página decide o que mostrar consultando se já existe uma solicitação — se o
 * redirecionamento dependesse de um efeito deste componente, essa atualização
 * poderia trocar o componente por baixo antes do efeito rodar.
 */
export function RequestBookingForm({
  spaceId,
  spaceTitle,
  priceMonthlyCents,
  renterFeeBps,
  ownerFeeBps,
  depositEnabled,
  minStartDate,
  maxStartDate,
  blocks,
}: {
  spaceId: string;
  spaceTitle: string;
  priceMonthlyCents: number;
  renterFeeBps: number;
  ownerFeeBps: number;
  depositEnabled: boolean;
  /** Primeira data possível (hoje em Brasília, "disponível a partir de" e bloqueios) — calculada no servidor. */
  minStartDate: string;
  /** Última data aceita (limite de antecedência). */
  maxStartDate: string;
  /** Dias em que o proprietário não inicia locações (sem motivo). */
  blocks: SpaceBlockPublic[];
}) {
  const id = useId();
  const [startDate, setStartDate] = useState(minStartDate);
  const [state, action] = useActionState<BookingActionState | undefined, FormData>(requestBookingAction, undefined);

  const amounts = computeBookingAmounts(priceMonthlyCents, { renterFeeBps, ownerFeeBps });
  const bloqueio = startDate ? blockCoveringStart(startDate, blocks) : null;
  const foraDoLimite = startDate !== '' && (startDate < minStartDate || startDate > maxStartDate);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="spaceId" value={spaceId} />

      {state?.message && !state.ok && <Alert tone="critical">{state.message}</Alert>}

      <Field
        label="A partir de quando?"
        htmlFor={`${id}-data`}
        hint={
          blocks.length > 0
            ? `O proprietário não inicia locações em: ${blocks.map((b) => (b.startsOn === b.endsOn ? formatBookingDate(b.startsOn) : `${formatBookingDate(b.startsOn)} a ${formatBookingDate(b.endsOn)}`)).join('; ')}.`
            : 'A locação é mensal e se renova todo mês, sem data para acabar.'
        }
        error={bloqueio ? 'O proprietário não inicia locações nesta data. Escolha outra.' : foraDoLimite ? `Escolha uma data entre ${formatBookingDate(minStartDate)} e ${formatBookingDate(maxStartDate)}.` : undefined}
      >
        <Input
          id={`${id}-data`}
          name="startDate"
          type="date"
          min={minStartDate}
          max={maxStartDate}
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          required
        />
      </Field>

      <Field
        label="Mensagem para o proprietário"
        htmlFor={`${id}-msg`}
        optional
        hint="Conte rapidamente o que você pretende guardar ou fazer no espaço."
      >
        <Textarea
          id={`${id}-msg`}
          name="renterMessage"
          maxLength={600}
          placeholder="Ex.: preciso para guardar uma moto, uso diário."
        />
      </Field>

      <div data-testid="resumo-solicitacao" className="rounded-[var(--radius-card)] border p-4 sm:p-5 space-y-3 bg-[var(--surface-sunken)]">
        <p className="text-[0.75rem] font-medium uppercase tracking-wide text-[var(--content-subtle)]">Resumo</p>
        <dl className="space-y-2 text-[0.9375rem]">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[var(--content-muted)]">Espaço</dt>
            <dd className="font-medium text-right">{spaceTitle}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[var(--content-muted)]">Aluguel mensal</dt>
            <dd className="tabular-nums">{formatBRL(amounts.monthlyRentCents)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[var(--content-muted)]">Taxa de serviço ({formatBps(amounts.renterFeeBps)})</dt>
            <dd className="tabular-nums">{formatBRL(amounts.renterFeeCents)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 pt-2 border-t font-semibold">
            <dt>Total por mês, se aceito</dt>
            <dd className="tabular-nums">{formatBRL(amounts.totalChargedCents)}</dd>
          </div>
          {depositEnabled && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[var(--content-muted)]">Caução (devolvida ao final, sem dano)</dt>
              <dd className="tabular-nums">{formatBRL(amounts.monthlyRentCents)}</dd>
            </div>
          )}
        </dl>
        <ul className="space-y-1 text-[0.8125rem] text-[var(--content-subtle)] leading-relaxed list-disc pl-4">
          <li>Nada é cobrado nem bloqueado no seu cartão ao enviar a solicitação.</li>
          <li>O proprietário tem 24 horas para aceitar ou recusar.</li>
          <li>Se aceitar, você tem 24 horas para pagar; depois disso a vaga é liberada.</li>
          <li>Este valor usa a taxa de hoje; o valor final é confirmado no aceite.</li>
        </ul>
      </div>

      <SubmitButton disabled={Boolean(bloqueio) || foraDoLimite}>Enviar solicitação</SubmitButton>
    </form>
  );
}
