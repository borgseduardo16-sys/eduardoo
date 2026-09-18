'use client';

import { useActionState, useId } from 'react';
import { createPayoutAccountAction, type PayoutAccountActionState } from '@/lib/payments/actions';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/auth/form-shell';

/**
 * Cadastro de recebimento do proprietario — cria a subconta no Asaas.
 *
 * So pede o que o Asaas exige pra criar a subconta (src/lib/payments/asaas.ts):
 * nome, CPF/CNPJ, e-mail, telefone, renda/faturamento mensal e endereco. Sem
 * isso nenhuma reserva deste proprietario consegue chegar ao pagamento — o
 * split de toda cobranca precisa de um walletId de destino.
 */
export function PayoutAccountForm({
  nomeSugerido,
  emailSugerido,
}: {
  nomeSugerido?: string;
  emailSugerido?: string;
}) {
  const id = useId();
  const [state, action] = useActionState<PayoutAccountActionState | undefined, FormData>(
    createPayoutAccountAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-5">
      {state?.message && !state.ok && <Alert tone="critical">{state.message}</Alert>}

      <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
        Esses dados vão direto para o Asaas (o gateway de pagamento) para criar sua conta de
        recebimento. Sem isso, os repasses dos seus aluguéis não têm para onde ir.
      </p>

      <Field label="Nome completo" htmlFor={`${id}-nome`}>
        <Input name="fullName" defaultValue={nomeSugerido} required maxLength={140} />
      </Field>

      <Field label="CPF ou CNPJ" htmlFor={`${id}-doc`} hint="Só números.">
        <Input name="cpfCnpj" inputMode="numeric" required placeholder="000.000.000-00" />
      </Field>

      <Field label="E-mail" htmlFor={`${id}-email`}>
        <Input name="email" type="email" defaultValue={emailSugerido} required />
      </Field>

      <Field label="Celular" htmlFor={`${id}-tel`} hint="Com DDD.">
        <Input name="mobilePhone" inputMode="tel" required placeholder="(27) 99999-9999" />
      </Field>

      <Field label="Renda ou faturamento mensal" htmlFor={`${id}-renda`} hint="Em reais, valor aproximado. Exigido pelo Asaas.">
        <Input name="incomeValueReais" type="number" min="1" step="0.01" required placeholder="3000" />
      </Field>

      <Field label="Data de nascimento" htmlFor={`${id}-nasc`} optional hint="Obrigatório para pessoa física.">
        <Input name="birthDate" type="date" />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="CEP" htmlFor={`${id}-cep`}>
          <Input name="postalCode" inputMode="numeric" required placeholder="00000-000" />
        </Field>
        <Field label="Número" htmlFor={`${id}-num`}>
          <Input name="addressNumber" required />
        </Field>
      </div>

      <Field label="Endereço" htmlFor={`${id}-end`}>
        <Input name="address" required placeholder="Rua, avenida..." />
      </Field>

      <Field label="Bairro" htmlFor={`${id}-bairro`}>
        <Input name="province" required />
      </Field>

      <SubmitButton>Criar conta de recebimento</SubmitButton>
    </form>
  );
}
