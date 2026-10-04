'use client';

import { useActionState, useId, useState } from 'react';
import { saveStepAction, type SpaceActionState } from '@/lib/spaces/actions';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { InvalidAmountError, computeBookingAmounts, formatBRL, formatBps, parseBRLToCents } from '@/lib/money';
import { ownerReceivesPhrase } from '@/lib/spaces/price';
import { unitNounFor } from '@/lib/spaces/types';
import { StepActions } from './step-actions';
import { useAdvanceOnSave } from './use-advance';
import { keepTypedValues } from './keep-values';

type Initial = {
  priceMonthlyCents: number | null;
  quantityOffered: number;
  quantityTotal: number | null;
  availableFrom: string | null;
};

/** "300,00" para o campo, a partir de centavos inteiros (sem passar por float). */
function centsToField(cents: number | null): string {
  if (cents == null) return '';
  const reais = Math.trunc(cents / 100);
  const resto = String(cents % 100).padStart(2, '0');
  return `${reais},${resto}`;
}

/**
 * Etapa "Como alugar": preço mensal, quantas unidades você oferece e a partir
 * de quando. Só aluguel MENSAL, com renovação todo mês — não existe hora, dia
 * ou semana, nem unidade individual (A1, B17…): a organização física é sua e
 * vai nas instruções de acesso quando você aceitar uma solicitação.
 *
 * A frase "Você receberá R$ 291 por mês" sai da MESMA conta do repasse
 * (src/lib/money.ts): é aritmética sem segredo, com a taxa vigente que o
 * servidor leu do banco. O que vale é o que o servidor recalcula ao salvar.
 */
export function PriceForm({
  spaceId,
  spaceType,
  initial,
  today,
  minRentCents,
  ownerFeeBps,
  renterFeeBps,
  occupied,
}: {
  spaceId: string;
  spaceType: string;
  initial: Initial;
  /** Hoje em Brasília (`YYYY-MM-DD`), calculado no servidor. */
  today: string;
  minRentCents: number;
  ownerFeeBps: number;
  renterFeeBps: number;
  /** Quantas unidades já estão ocupadas por locação: a quantidade oferecida não pode ficar abaixo. */
  occupied: number;
}) {
  const id = useId();
  const noun = unitNounFor(spaceType);
  const [state, action] = useActionState<SpaceActionState | undefined, FormData>(saveStepAction, undefined);
  useAdvanceOnSave(state?.ok, `/anunciar/${spaceId}/regras`);

  const [preco, setPreco] = useState(centsToField(initial.priceMonthlyCents));
  const [quantidade, setQuantidade] = useState(String(initial.quantityOffered));
  const [total, setTotal] = useState(initial.quantityTotal != null ? String(initial.quantityTotal) : '');
  const [disponivel, setDisponivel] = useState(initial.availableFrom ?? today);

  const err = (k: string) => state?.fieldErrors?.[k]?.[0];

  // Conta ao vivo, com a mesma função do servidor. Valor ilegível = sem frase (nunca um número inventado).
  let cents: number | null = null;
  try {
    cents = preco.trim() === '' ? null : parseBRLToCents(preco);
  } catch (e) {
    if (!(e instanceof InvalidAmountError)) throw e;
  }
  const valido = cents != null && cents >= minRentCents;
  let frase: string | null = null;
  let locatarioPaga: number | null = null;
  if (cents != null && valido) {
    try {
      frase = ownerReceivesPhrase(cents, ownerFeeBps);
      locatarioPaga = computeBookingAmounts(cents, { renterFeeBps, ownerFeeBps }).totalChargedCents;
    } catch (e) {
      if (!(e instanceof InvalidAmountError)) throw e;
    }
  }

  return (
    <form action={action} onReset={keepTypedValues} noValidate>
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="step" value="preco" />

      {state?.message && !state.ok && <Alert tone="critical" className="mb-5">{state.message}</Alert>}

      <div className="space-y-6">
        <div className="space-y-2">
          <Field
            label="Valor mensal" htmlFor={`${id}-preco`} error={err('priceMonthly')}
            hint={`Por unidade, por mês. O mínimo é ${formatBRL(minRentCents)}.`}
          >
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--content-muted)]" aria-hidden>R$</span>
              <Input
                name="priceMonthly" inputMode="decimal" autoComplete="off" placeholder="300,00"
                className="pl-10 tabular-nums" value={preco} onChange={(e) => setPreco(e.target.value)}
              />
            </div>
          </Field>
          {frase && (
            <div className="rounded-[var(--radius-field)] bg-[var(--surface-sunken)] px-3.5 py-3 space-y-1" data-testid="frase-liquido">
              <p className="font-medium">{frase}</p>
              {locatarioPaga != null && (
                <p className="text-[0.8125rem] text-[var(--content-muted)]">
                  Quem alugar paga {formatBRL(locatarioPaga)} por mês: o aluguel mais uma taxa de serviço de {formatBps(renterFeeBps)}.
                </p>
              )}
            </div>
          )}
          {cents != null && !valido && (
            <p className="text-[0.8125rem] text-[var(--color-critical)]" role="alert">
              O valor mensal mínimo é {formatBRL(minRentCents)}.
            </p>
          )}
        </div>

        <Field
          label={`Quantas ${noun.plural} você oferece?`} htmlFor={`${id}-qtd`} error={err('quantityOffered')}
          hint={
            occupied > 0
              ? `${occupied} ${occupied === 1 ? 'está ocupada' : 'estão ocupadas'} por locações em andamento: não dá para oferecer menos que isso.`
              : `Uma garagem é 1. Um estacionamento com 80 ${noun.plural} na plataforma é 80. Cada locação aceita ocupa uma e, quando termina, ela volta.`
          }
        >
          <Input
            name="quantityOffered" type="number" inputMode="numeric" min={Math.max(1, occupied)} max={10000} step={1}
            className="w-32 tabular-nums" value={quantidade} onChange={(e) => setQuantidade(e.target.value)}
          />
        </Field>

        <Field
          label={`Quantas ${noun.plural} o local tem no total?`} htmlFor={`${id}-total`} optional error={err('quantityTotal')}
          hint={`Só informe se o local tem mais do que você oferece aqui (ex.: 100 ${noun.plural}, 80 na plataforma). Aparece no anúncio como informação.`}
        >
          <Input
            name="quantityTotal" type="number" inputMode="numeric" min={1} max={10000} step={1}
            className="w-32 tabular-nums" value={total} onChange={(e) => setTotal(e.target.value)}
          />
        </Field>

        <Field
          label="Disponível a partir de" htmlFor={`${id}-data`} error={err('availableFrom')}
          hint="A primeira data em que uma locação pode começar. Dá para fechar dias específicos depois, no calendário do anúncio."
        >
          <Input
            name="availableFrom" type="date" min={initial.availableFrom && initial.availableFrom < today ? initial.availableFrom : today}
            value={disponivel} onChange={(e) => setDisponivel(e.target.value)} className="w-48"
          />
        </Field>

        <div className="rounded-[var(--radius-card)] border p-4 space-y-2 text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
          <p className="font-medium text-[var(--content)]">Como funciona a locação</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Você tem 24 horas para aceitar ou recusar cada solicitação. Sem resposta, ela expira.</li>
            <li>Ao aceitar, você explica como a pessoa encontra e usa o espaço (texto ou áudio) — ela só vê isso depois de pagar.</li>
            <li>A mensalidade é cobrada todo mês na mesma data. Cada locação ativa ocupa uma unidade até terminar.</li>
            <li>Se quiser encerrar uma locação, você registra o pedido com data e a pessoa é avisada.</li>
          </ul>
        </div>
      </div>

      <StepActions backHref={`/anunciar/${spaceId}/descricao`} submitLabel="Continuar" />
    </form>
  );
}
