'use client';

import { useActionState, useMemo, useState } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { saveStepAction, type SpaceActionState } from '@/lib/spaces/actions';
import type { RawGroup, RentalMode } from '@/lib/rentals/config';
import { MAX_GROUPS, MAX_PACKAGES, MAX_UNITS_PER_GROUP } from '@/lib/rentals/config';
import { formatDuration, unitWord, type RentalTimeUnit } from '@/lib/rentals/pricing';
import type { UnitNoun } from '@/lib/spaces/types';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { StepActions } from './step-actions';
import { useAdvanceOnSave } from './use-advance';
import { keepTypedValues } from './keep-values';

/** Formata o que a pessoa digita como moeda, mantendo só os dígitos. */
function maskBRL(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  return (Number(digits) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const centsOf = (masked: string | undefined) => Number((masked ?? '').replace(/\D/g, '')) || 0;

type GroupState = Required<Omit<RawGroup, 'id'>> & { id: string | null; key: string; liveUnits: number };

function novoGrupo(nome: string, unidades: number): GroupState {
  return {
    id: null,
    key: Math.random().toString(36).slice(2),
    liveUnits: 0,
    name: nome,
    unitCount: unidades,
    mode: 'continuous',
    monthlyPrice: '',
    tempUnit: 'hour',
    tempPricingMode: 'per_period',
    tempPrice: '',
    tempMaxUnits: '',
    tempAllowFraction: false,
    packages: [{ units: '', price: '' }],
    renewalAllowed: true,
    hoursMode: 'always',
    opensAt: '07:00',
    closesAt: '21:00',
  };
}

function Choice<T extends string>({
  name, value, options, onChange, ariaLabel,
}: {
  name: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid gap-2 sm:grid-flow-col sm:auto-cols-fr">
      {options.map((o) => {
        const ativo = value === o.value;
        return (
          <label
            key={o.value}
            className={cn(
              'flex flex-col gap-0.5 rounded-[var(--radius-field)] border px-3.5 py-2.5 cursor-pointer transition-colors',
              ativo
                ? 'border-[var(--accent)] bg-[var(--accent-subtle)] ring-1 ring-[var(--accent)]'
                : 'hover:border-[var(--content-subtle)]',
            )}
          >
            <input
              type="radio" name={name} value={o.value} checked={ativo}
              onChange={() => onChange(o.value)} className="sr-only"
            />
            <span className="text-[0.9375rem] font-medium">{o.label}</span>
            {o.hint && <span className="text-[0.75rem] text-[var(--content-muted)] leading-snug">{o.hint}</span>}
          </label>
        );
      })}
    </div>
  );
}

function MoneyInput({
  id, value, onChange, placeholder, invalid,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  invalid?: boolean;
}) {
  return (
    <div className="relative">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--content-muted)] pointer-events-none">R$</span>
      <Input
        id={id} value={value} onChange={(e) => onChange(maskBRL(e.target.value))}
        inputMode="numeric" placeholder={placeholder} className="pl-10 tabular-nums"
        aria-invalid={invalid ? true : undefined}
      />
    </div>
  );
}

function Counter({
  id, value, min, max, onChange, label,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <div className="inline-flex items-center rounded-[var(--radius-field)] border border-[var(--border-strong)]">
      <button
        type="button" onClick={() => set(value - 1)} disabled={value <= min}
        className="size-11 grid place-items-center disabled:opacity-40" aria-label={`Menos ${label}`}
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <input
        id={id} value={value} inputMode="numeric"
        onChange={(e) => set(Number(e.target.value.replace(/\D/g, '')) || min)}
        className="w-14 h-11 text-center tabular-nums bg-transparent border-x border-[var(--border-strong)] focus:outline-none"
        aria-label={label}
      />
      <button
        type="button" onClick={() => set(value + 1)} disabled={value >= max}
        className="size-11 grid place-items-center disabled:opacity-40" aria-label={`Mais ${label}`}
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/**
 * "Como alugar" (Parte 12) — substitui a antiga etapa de preço único.
 *
 * Configuração progressiva: primeiro quantas unidades e se seguem as mesmas
 * regras; depois, para cada grupo, o modo (por mês, por tempo ou os dois)
 * e SÓ os campos desse modo. O que vai para o servidor é o que foi
 * digitado; centavos, mínimos e regras são conferidos lá (e no banco).
 */
export function RentalConfigForm({
  spaceId, unitNoun, initialGroups, availableFrom, minRentCents, feeOwnerBps, feeRenterBps,
}: {
  spaceId: string;
  unitNoun: UnitNoun;
  initialGroups: (RawGroup & { id: string; liveUnits: number })[];
  availableFrom: string | null;
  minRentCents: number;
  feeOwnerBps: number;
  feeRenterBps: number;
}) {
  const [state, action] = useActionState<SpaceActionState | undefined, FormData>(saveStepAction, undefined);
  useAdvanceOnSave(state?.ok, `/anunciar/${spaceId}/regras`);

  const [grupos, setGrupos] = useState<GroupState[]>(() =>
    initialGroups.length > 0
      ? initialGroups.map((g) => ({
          ...novoGrupo(g.name ?? '', Number(g.unitCount) || 1),
          ...g,
          id: g.id,
          tempMaxUnits: g.tempMaxUnits ?? '',
          packages: g.packages && g.packages.length > 0 ? g.packages : [{ units: '', price: '' }],
          liveUnits: g.liveUnits,
        }) as GroupState)
      : [novoGrupo('', 1)],
  );
  const hoje = new Date().toISOString().slice(0, 10);
  const [disponivel, setDisponivel] = useState(availableFrom ?? hoje);

  const varios = grupos.length > 1;
  const err = (k: string) => state?.fieldErrors?.[k]?.[0];
  const singular = unitNoun.singular;
  const plural = unitNoun.plural;

  const atualizar = (i: number, patch: Partial<GroupState>) =>
    setGrupos((gs) => gs.map((g, j) => (j === i ? { ...g, ...patch } : g)));

  const separarEmGrupos = () =>
    setGrupos((gs) => {
      const [primeiro] = gs;
      if (!primeiro) return gs;
      return [
        { ...primeiro, name: primeiro.name && primeiro.name !== 'Padrão' ? primeiro.name : `${capital(plural)} — grupo 1` },
        novoGrupo(`${capital(plural)} — grupo 2`, 1),
      ];
    });
  const juntarEmUm = () => setGrupos((gs) => [{ ...gs[0]!, name: '' }]);

  const payload = useMemo(
    () =>
      JSON.stringify({
        availableFrom: disponivel,
        // Só os campos do formulário: a chave de tela e a contagem de unidades vivas ficam de fora.
        groups: grupos.map((grupo) => {
          const g: Partial<typeof grupo> = { ...grupo };
          delete g.key;
          delete g.liveUnits;
          return { ...g, packages: grupo.tempPricingMode === 'packages' ? grupo.packages : [] };
        }),
      }),
    [grupos, disponivel],
  );

  return (
    <form action={action} onReset={keepTypedValues} noValidate>
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="step" value="preco" />
      <input type="hidden" name="rentalConfig" value={payload} />

      {state?.message && !state.ok && <Alert tone="critical" className="mb-5">{state.message}</Alert>}

      <div className="space-y-8">
        {!varios && (
          <section className="space-y-3">
            <h2 className="font-medium">Quantas {plural} você tem para alugar?</h2>
            <Counter
              id="unitCount-0" value={Number(grupos[0]!.unitCount) || 1} min={Math.max(1, grupos[0]!.liveUnits)}
              max={MAX_UNITS_PER_GROUP} label={plural}
              onChange={(v) => atualizar(0, { unitCount: v })}
            />
            {err('groups.0.unitCount') && <p role="alert" className="text-[0.8125rem] text-[var(--color-critical)]">{err('groups.0.unitCount')}</p>}
            {grupos[0]!.liveUnits > 0 && (
              <p className="text-[0.8125rem] text-[var(--content-muted)]">
                {grupos[0]!.liveUnits} {grupos[0]!.liveUnits === 1 ? `${singular} está` : `${plural} estão`} com aluguel em andamento ou marcado.
              </p>
            )}
          </section>
        )}

        {(varios || Number(grupos[0]!.unitCount) > 1) && (
          <section className="space-y-3">
            <h2 className="font-medium">Todas as {plural} seguem as mesmas regras?</h2>
            <Choice
              name="mesmasRegras" ariaLabel="Mesmas regras para todas"
              value={varios ? 'nao' : 'sim'}
              onChange={(v) => (v === 'sim' ? juntarEmUm() : separarEmGrupos())}
              options={[
                { value: 'sim', label: 'Sim, as mesmas regras' },
                { value: 'nao', label: 'Não, tenho grupos diferentes', hint: `Ex.: ${plural} rápidas de até 1 hora e ${plural} para o dia todo` },
              ]}
            />
          </section>
        )}

        {grupos.map((g, i) => (
          <GroupEditor
            key={g.key}
            index={i}
            group={g}
            multiple={varios}
            unitNoun={unitNoun}
            minRentCents={minRentCents}
            feeOwnerBps={feeOwnerBps}
            feeRenterBps={feeRenterBps}
            err={(campo) => err(`groups.${i}.${campo}`)}
            errPrefix={`groups.${i}.packages`}
            allErrors={state?.fieldErrors}
            onChange={(patch) => atualizar(i, patch)}
            onRemove={varios && g.liveUnits === 0 ? () => setGrupos((gs) => gs.filter((_, j) => j !== i)) : undefined}
          />
        ))}

        {varios && grupos.length < MAX_GROUPS && (
          <button
            type="button"
            onClick={() => setGrupos((gs) => [...gs, novoGrupo(`${capital(plural)} — grupo ${gs.length + 1}`, 1)])}
            className="inline-flex items-center gap-2 text-[0.9375rem] font-medium text-[var(--accent)] hover:underline"
          >
            <Plus className="size-4" aria-hidden /> Adicionar grupo
          </button>
        )}

        <Field
          label="Disponível a partir de" htmlFor="availableFrom" error={err('availableFrom')}
          hint="Se já está livre, deixe a data de hoje."
        >
          <Input name="availableFrom" type="date" value={disponivel} min={hoje} onChange={(e) => setDisponivel(e.target.value)} />
        </Field>
      </div>

      <StepActions backHref={`/anunciar/${spaceId}/descricao`} />
    </form>
  );
}

function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function GroupEditor({
  index, group: g, multiple, unitNoun, minRentCents, feeOwnerBps, feeRenterBps, err, errPrefix, allErrors, onChange, onRemove,
}: {
  index: number;
  group: GroupState;
  multiple: boolean;
  unitNoun: UnitNoun;
  minRentCents: number;
  feeOwnerBps: number;
  feeRenterBps: number;
  err: (campo: string) => string | undefined;
  errPrefix: string;
  allErrors?: Record<string, string[]>;
  onChange: (patch: Partial<GroupState>) => void;
  onRemove?: () => void;
}) {
  const id = (campo: string) => `g${index}-${campo}`;
  const continuo = g.mode !== 'temporary';
  const temporario = g.mode !== 'continuous';
  const un = g.tempUnit as RentalTimeUnit;
  const mensal = centsOf(g.monthlyPrice);
  const recebeMensal = mensal - Math.round((mensal * feeOwnerBps) / 10_000);

  return (
    <section
      className={cn('space-y-5', multiple && 'rounded-[var(--radius-card)] border p-4 sm:p-5')}
      aria-label={multiple ? `Grupo ${index + 1}` : undefined}
    >
      {multiple && (
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Nome do grupo" htmlFor={id('name')} error={err('name')} hint={`Aparece no anúncio. Ex.: "${capital(unitNoun.plural)} rápidas"`}>
            <Input id={id('name')} value={g.name} maxLength={60} onChange={(e) => onChange({ name: e.target.value })} />
          </Field>
          <div className="space-y-1.5">
            <span className="text-sm font-medium block">Quantidade</span>
            <Counter
              id={id('unitCount')} value={Number(g.unitCount) || 1} min={Math.max(1, g.liveUnits)}
              max={MAX_UNITS_PER_GROUP} label={unitNoun.plural}
              onChange={(v) => onChange({ unitCount: v })}
            />
          </div>
          {err('unitCount') && <p role="alert" className="text-[0.8125rem] text-[var(--color-critical)] sm:col-span-2">{err('unitCount')}</p>}
        </div>
      )}

      <div className="space-y-3">
        <h3 className="font-medium">Como você quer alugar{multiple ? ' este grupo' : ''}?</h3>
        <Choice<RentalMode>
          name={id('mode')} ariaLabel="Forma de aluguel" value={g.mode}
          onChange={(v) => onChange({ mode: v })}
          options={[
            { value: 'continuous', label: 'Por mês', hint: 'Renova todo mês, sem data para acabar' },
            { value: 'temporary', label: 'Por hora, dia ou semana', hint: 'Com duração máxima' },
            { value: 'both', label: 'Os dois' },
          ]}
        />
      </div>

      {continuo && (
        <div className="space-y-2">
          <Field label="Valor por mês" htmlFor={id('monthlyPrice')} error={err('monthlyPrice')} hint={`Mínimo ${brl(minRentCents)} por mês, por ${unitNoun.singular}.`}>
            <MoneyInput id={id('monthlyPrice')} value={g.monthlyPrice} onChange={(v) => onChange({ monthlyPrice: v })} placeholder="300,00" invalid={!!err('monthlyPrice')} />
          </Field>
          {mensal > 0 && (
            <p className="text-[0.8125rem] text-[var(--content-muted)]">
              Você recebe {brl(recebeMensal)} por mês ({(feeOwnerBps / 100).toFixed(0)}% de taxa). Quem aluga paga{' '}
              {brl(mensal + Math.round((mensal * feeRenterBps) / 10_000))}.
            </p>
          )}
        </div>
      )}

      {temporario && (
        <div className="space-y-5">
          <div className="space-y-2">
            <span className="text-sm font-medium block">Cobrar por</span>
            <Choice<RentalTimeUnit>
              name={id('tempUnit')} ariaLabel="Unidade de tempo" value={un}
              onChange={(v) => onChange({
                tempUnit: v,
                tempAllowFraction: v === 'hour' ? false : g.tempAllowFraction,
                hoursMode: v === 'hour' ? g.hoursMode : 'always',
              })}
              options={[
                { value: 'hour', label: 'Hora' },
                { value: 'day', label: 'Dia' },
                { value: 'week', label: 'Semana' },
              ]}
            />
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium block">Como cobrar</span>
            <Choice<'per_period' | 'packages'>
              name={id('tempPricingMode')} ariaLabel="Forma de cobrança" value={g.tempPricingMode}
              onChange={(v) => onChange({ tempPricingMode: v, tempAllowFraction: v === 'packages' ? false : g.tempAllowFraction })}
              options={[
                { value: 'per_period', label: `Valor por ${unitWord(un)}`, hint: `Ex.: R$ 50 por ${unitWord(un)}, máximo 5 ${unitWord(un, true)}` },
                { value: 'packages', label: 'Pacotes', hint: `Ex.: até 1 ${unitWord(un)} R$ 50, até 5 ${unitWord(un, true)} R$ 120` },
              ]}
            />
          </div>

          {g.tempPricingMode === 'per_period' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`Valor por ${unitWord(un)}`} htmlFor={id('tempPrice')} error={err('tempPrice')}>
                <MoneyInput id={id('tempPrice')} value={g.tempPrice} onChange={(v) => onChange({ tempPrice: v })} placeholder="50,00" invalid={!!err('tempPrice')} />
              </Field>
              <Field label={`Máximo de ${unitWord(un, true)} por aluguel`} htmlFor={id('tempMaxUnits')} error={err('tempMaxUnits')}>
                <Input
                  id={id('tempMaxUnits')} value={String(g.tempMaxUnits)} inputMode="numeric" placeholder="5"
                  onChange={(e) => onChange({ tempMaxUnits: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                />
              </Field>
              {un !== 'hour' && (
                <label className="flex items-start gap-3 sm:col-span-2 cursor-pointer">
                  <input
                    type="checkbox" checked={g.tempAllowFraction}
                    onChange={(e) => onChange({ tempAllowFraction: e.target.checked })}
                    className="mt-0.5 size-4 shrink-0 rounded accent-[var(--accent)]"
                  />
                  <span className="text-[0.875rem]">
                    Aceitar {un === 'day' ? 'algumas horas' : 'alguns dias'}, com preço proporcional
                    {centsOf(g.tempPrice) > 0 && (
                      <span className="block text-[0.8125rem] text-[var(--content-muted)]">
                        Ex.: {un === 'day'
                          ? `6 horas = ${brl(Math.floor((centsOf(g.tempPrice) * 6 * 2 + 24) / 48))}`
                          : `2 dias = ${brl(Math.floor((centsOf(g.tempPrice) * 2 * 2 + 7) / 14))}`}
                      </span>
                    )}
                  </span>
                </label>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              <span className="text-sm font-medium block">Pacotes</span>
              {err('packages') && <p role="alert" className="text-[0.8125rem] text-[var(--color-critical)]">{err('packages')}</p>}
              <ul className="space-y-2">
                {g.packages.map((p, j) => (
                  <li key={j} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[0.875rem] text-[var(--content-muted)] shrink-0">Até</span>
                      <Input
                        aria-label={`Duração do pacote ${j + 1}`} value={String(p.units ?? '')} inputMode="numeric"
                        className="w-16 text-center tabular-nums" placeholder="1"
                        onChange={(e) => onChange({ packages: g.packages.map((x, k) => (k === j ? { ...x, units: e.target.value.replace(/\D/g, '').slice(0, 3) } : x)) })}
                      />
                      <span className="text-[0.875rem] text-[var(--content-muted)] shrink-0">{unitWord(un, true)} por</span>
                      <div className="flex-1 min-w-0">
                        <MoneyInput
                          id={id(`pkg${j}`)} value={String(p.price ?? '')} placeholder="50,00"
                          onChange={(v) => onChange({ packages: g.packages.map((x, k) => (k === j ? { ...x, price: v } : x)) })}
                        />
                      </div>
                      {g.packages.length > 1 && (
                        <button
                          type="button" aria-label={`Remover pacote ${j + 1}`}
                          onClick={() => onChange({ packages: g.packages.filter((_, k) => k !== j) })}
                          className="size-10 grid place-items-center text-[var(--content-muted)] hover:text-[var(--color-critical)]"
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      )}
                    </div>
                    {allErrors?.[`${errPrefix}.${j}`]?.[0] && (
                      <p role="alert" className="text-[0.8125rem] text-[var(--color-critical)]">{allErrors[`${errPrefix}.${j}`]![0]}</p>
                    )}
                  </li>
                ))}
              </ul>
              {g.packages.length < MAX_PACKAGES && (
                <button
                  type="button"
                  onClick={() => onChange({ packages: [...g.packages, { units: '', price: '' }] })}
                  className="inline-flex items-center gap-2 text-[0.875rem] font-medium text-[var(--accent)] hover:underline"
                >
                  <Plus className="size-4" aria-hidden /> Adicionar pacote
                </button>
              )}
              <p className="text-[0.8125rem] text-[var(--content-muted)]">
                Cada pacote vale até a duração dele. Pacote mais longo não pode custar menos que um mais curto.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <span className="text-sm font-medium block">Horário de funcionamento</span>
            {un === 'hour' ? (
              <>
                <Choice<'always' | 'daily'>
                  name={id('hoursMode')} ariaLabel="Horário de funcionamento" value={g.hoursMode}
                  onChange={(v) => onChange({ hoursMode: v })}
                  options={[
                    { value: 'always', label: 'Aberto 24 horas' },
                    { value: 'daily', label: 'Horário fixo todo dia' },
                  ]}
                />
                {g.hoursMode === 'daily' && (
                  <div className="flex items-center gap-2">
                    <label className="text-[0.875rem] text-[var(--content-muted)]" htmlFor={id('opensAt')}>Abre</label>
                    <Input id={id('opensAt')} type="time" value={g.opensAt} onChange={(e) => onChange({ opensAt: e.target.value })} className="w-32" />
                    <label className="text-[0.875rem] text-[var(--content-muted)]" htmlFor={id('closesAt')}>fecha</label>
                    <Input id={id('closesAt')} type="time" value={g.closesAt} onChange={(e) => onChange({ closesAt: e.target.value })} className="w-32" />
                  </div>
                )}
                {err('hours') && <p role="alert" className="text-[0.8125rem] text-[var(--color-critical)]">{err('hours')}</p>}
              </>
            ) : (
              <p className="text-[0.8125rem] text-[var(--content-muted)]">
                Por {unitWord(un)}, o acesso é 24 horas. Para limitar horário, cobre por hora.
              </p>
            )}
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox" checked={g.renewalAllowed}
              onChange={(e) => onChange({ renewalAllowed: e.target.checked })}
              className="mt-0.5 size-4 shrink-0 rounded accent-[var(--accent)]"
            />
            <span className="text-[0.875rem]">
              Permitir renovar logo depois do fim
              <span className="block text-[0.8125rem] text-[var(--content-muted)]">
                A {unitNoun.singular} fica guardada por 7 minutos para quem estava usando decidir se continua.
              </span>
            </span>
          </label>

          {g.tempPricingMode === 'per_period' && centsOf(g.tempPrice) > 0 && Number(g.tempMaxUnits) > 0 && (
            <p className="text-[0.8125rem] text-[var(--content-muted)]">
              No anúncio: {brl(centsOf(g.tempPrice))} por {unitWord(un)} — máximo {formatDuration(Number(g.tempMaxUnits), un)}.
              {centsOf(g.tempPrice) < minRentCents && ` Cada aluguel precisa somar pelo menos ${brl(minRentCents)}; durações menores não aparecem para quem aluga.`}
            </p>
          )}
        </div>
      )}

      {onRemove && (
        <button
          type="button" onClick={onRemove}
          className="inline-flex items-center gap-2 text-[0.875rem] text-[var(--content-muted)] hover:text-[var(--color-critical)]"
        >
          <Trash2 className="size-4" aria-hidden /> Remover este grupo
        </button>
      )}
    </section>
  );
}
