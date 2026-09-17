'use client';

import { useActionState } from 'react';
import { saveStepAction, type SpaceActionState } from '@/lib/spaces/actions';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { StepActions } from './step-actions';
import { useAdvanceOnSave } from './use-advance';

type Initial = {
  allowedItems: string | null; forbiddenItems: string | null;
  accessHours: string | null; rulesText: string | null;
};

/**
 * Etapa 7: regras do espaço.
 *
 * Tudo opcional. A plataforma não gera regra sozinha nem sugere cláusula
 * jurídica — o que está escrito aqui é o que o proprietário escreveu, e é
 * assim que fica registrado se houver divergência depois.
 */
export function RulesForm({ spaceId, initial }: { spaceId: string; initial: Initial }) {
  const [state, action] = useActionState<SpaceActionState | undefined, FormData>(
    saveStepAction, undefined,
  );
  useAdvanceOnSave(state?.ok, `/anunciar/${spaceId}/revisao`);

  const err = (k: string) => state?.fieldErrors?.[k]?.[0];

  return (
    <form action={action} noValidate>
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="step" value="regras" />

      {state?.message && !state.ok && (
        <Alert tone="critical" className="mb-5">{state.message}</Alert>
      )}

      <div className="space-y-5">
        <Field
          label="Horário de acesso" htmlFor="accessHours" optional
          error={err('accessHours')}
          hint="Ex.: das 7h às 22h, todos os dias — ou acesso 24 horas"
        >
          <Input name="accessHours" defaultValue={initial.accessHours ?? ''} maxLength={200} />
        </Field>

        <Field
          label="O que pode ser guardado" htmlFor="allowedItems" optional
          error={err('allowedItems')}
          hint="Ex.: móveis, caixas, equipamentos, um carro"
        >
          <Textarea name="allowedItems" defaultValue={initial.allowedItems ?? ''} maxLength={1000} rows={3} />
        </Field>

        <Field
          label="O que não pode" htmlFor="forbiddenItems" optional
          error={err('forbiddenItems')}
          hint="Ex.: inflamáveis, produtos químicos, animais, uso como moradia"
        >
          <Textarea name="forbiddenItems" defaultValue={initial.forbiddenItems ?? ''} maxLength={1000} rows={3} />
        </Field>

        <Field
          label="Outras informações importantes" htmlFor="rulesText" optional
          error={err('rulesText')}
          hint="Qualquer coisa que a pessoa precise saber antes de fechar"
        >
          <Textarea name="rulesText" defaultValue={initial.rulesText ?? ''} maxLength={2000} rows={4} />
        </Field>

        <p className="text-[0.8125rem] text-[var(--content-muted)] leading-relaxed">
          Escreva como você falaria. Não montamos contrato nem cláusula jurídica por você — o que
          estiver aqui é o que vale como combinado, e é o que fica registrado se houver
          divergência depois.
        </p>
      </div>

      <StepActions backHref={`/anunciar/${spaceId}/preco`} submitLabel="Revisar anúncio" />
    </form>
  );
}
