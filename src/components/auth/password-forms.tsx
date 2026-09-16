'use client';

import { useActionState } from 'react';
import {
  requestPasswordResetAction,
  updatePasswordAction,
  type ActionState,
} from '@/lib/auth/actions';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from './form-shell';

export function RequestPasswordResetForm() {
  const [state, action] = useActionState<ActionState | undefined, FormData>(
    requestPasswordResetAction,
    undefined,
  );

  if (state?.ok && state.message) {
    return (
      <Alert tone="success" title="Link enviado" className="animate-rise">
        {state.message}
      </Alert>
    );
  }

  return (
    <form action={action} className="space-y-5" noValidate>
      {state?.message && !state.ok && <Alert tone="critical">{state.message}</Alert>}
      <Field label="E-mail" htmlFor="email" error={state?.fieldErrors?.email?.[0]}>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="voce@exemplo.com"
          required
        />
      </Field>
      <SubmitButton>Enviar link de redefinição</SubmitButton>
    </form>
  );
}

export function UpdatePasswordForm() {
  const [state, action] = useActionState<ActionState | undefined, FormData>(
    updatePasswordAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-5" noValidate>
      {state?.message && !state.ok && <Alert tone="critical">{state.message}</Alert>}

      <Field
        label="Nova senha"
        htmlFor="password"
        error={state?.fieldErrors?.password?.[0]}
        hint="Pelo menos 10 caracteres."
      >
        <Input name="password" type="password" autoComplete="new-password" required />
      </Field>

      <Field
        label="Confirme a nova senha"
        htmlFor="confirmPassword"
        error={state?.fieldErrors?.confirmPassword?.[0]}
      >
        <Input name="confirmPassword" type="password" autoComplete="new-password" required />
      </Field>

      <SubmitButton>Salvar nova senha</SubmitButton>
    </form>
  );
}
