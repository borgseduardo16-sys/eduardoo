'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signUpAction, type ActionState } from '@/lib/auth/actions';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from './form-shell';

export function SignUpForm() {
  const [state, action] = useActionState<ActionState | undefined, FormData>(
    signUpAction,
    undefined,
  );

  // Cadastro concluido: o proximo passo esta no e-mail, nao nesta tela.
  // Trocamos o formulario inteiro para nao sugerir que falta algo aqui.
  if (state?.ok && state.message) {
    return (
      <div className="space-y-6 animate-rise">
        <Alert tone="success" title="Confira seu e-mail">
          {state.message}
        </Alert>
        <p className="text-[0.875rem] text-[var(--content-muted)]">
          Não chegou? Verifique a caixa de spam ou{' '}
          <Link href="/criar-conta" className="text-[var(--accent)] underline underline-offset-4">
            tente com outro e-mail
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5" noValidate>
      {state?.message && !state.ok && <Alert tone="critical">{state.message}</Alert>}

      <Field label="Nome completo" htmlFor="fullName" error={state?.fieldErrors?.fullName?.[0]}>
        <Input name="fullName" autoComplete="name" placeholder="Como devemos te chamar" required />
      </Field>

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

      <Field
        label="Senha"
        htmlFor="password"
        error={state?.fieldErrors?.password?.[0]}
        hint="Pelo menos 10 caracteres. Frases longas funcionam melhor que símbolos."
      >
        <Input name="password" type="password" autoComplete="new-password" required />
      </Field>

      <div className="space-y-1.5">
        <label className="flex gap-3 items-start cursor-pointer">
          <input
            type="checkbox"
            name="acceptTerms"
            className="mt-1 size-4 rounded accent-[var(--accent)] shrink-0"
            required
          />
          <span className="text-[0.8125rem] text-[var(--content-muted)] leading-relaxed">
            Li e aceito os{' '}
            <Link href="/termos" className="text-[var(--accent)] underline underline-offset-4">
              Termos de Uso
            </Link>{' '}
            e a{' '}
            <Link href="/privacidade" className="text-[var(--accent)] underline underline-offset-4">
              Política de Privacidade
            </Link>
            .
          </span>
        </label>
        {state?.fieldErrors?.acceptTerms?.[0] && (
          <p role="alert" className="text-[0.8125rem] text-[var(--color-critical)]">
            {state.fieldErrors.acceptTerms[0]}
          </p>
        )}
      </div>

      <SubmitButton>Criar conta</SubmitButton>
    </form>
  );
}
