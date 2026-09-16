'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signInAction, type ActionState } from '@/lib/auth/actions';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from './form-shell';

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState<ActionState | undefined, FormData>(
    signInAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-5" noValidate>
      {next && <input type="hidden" name="next" value={next} />}

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

      <div className="space-y-1.5">
        <Field label="Senha" htmlFor="password" error={state?.fieldErrors?.password?.[0]}>
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <div className="flex justify-end">
          <Link
            href="/recuperar-senha"
            className="text-[0.8125rem] text-[var(--content-muted)] hover:text-[var(--accent)] underline underline-offset-4 decoration-[var(--border-strong)]"
          >
            Esqueci minha senha
          </Link>
        </div>
      </div>

      <SubmitButton>Entrar</SubmitButton>
    </form>
  );
}
