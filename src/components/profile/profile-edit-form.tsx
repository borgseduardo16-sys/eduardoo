'use client';

import { useActionState, useState } from 'react';
import { updateProfileAction, type ProfileActionState } from '@/lib/profiles/actions';
import { Input, Textarea } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/auth/form-shell';

const BIO_MAX = 500;

/**
 * Nome de exibição + apresentação. Só esses dois campos existem aqui — nota,
 * verificações e contadores não são editáveis por ninguém pela interface.
 */
export function ProfileEditForm({
  initialDisplayName,
  initialBio,
  fallbackName,
}: {
  initialDisplayName: string | null;
  initialBio: string | null;
  /** O que aparece se o nome de exibição ficar vazio (primeiro nome do cadastro). */
  fallbackName: string | null;
}) {
  const [state, action] = useActionState<ProfileActionState | undefined, FormData>(updateProfileAction, undefined);
  const [bio, setBio] = useState(initialBio ?? '');

  return (
    <form action={action} className="space-y-5" noValidate>
      {state?.ok && (
        <div className="animate-rise">
          <Alert tone="success">{state.message}</Alert>
        </div>
      )}
      {state && !state.ok && state.message && <Alert tone="critical">{state.message}</Alert>}

      <div className="space-y-1.5">
        <label htmlFor="displayName" className="text-[0.875rem] font-medium">
          Nome de exibição
        </label>
        <Input
          id="displayName"
          name="displayName"
          defaultValue={initialDisplayName ?? ''}
          maxLength={40}
          autoComplete="nickname"
          aria-invalid={state?.fieldErrors?.displayName ? true : undefined}
          aria-describedby="displayName-ajuda"
          placeholder={fallbackName ?? 'Como você quer ser chamado'}
        />
        {state?.fieldErrors?.displayName && (
          <p role="alert" className="text-[0.8125rem] text-[var(--color-critical)]">
            {state.fieldErrors.displayName}
          </p>
        )}
        <p id="displayName-ajuda" className="text-[0.75rem] text-[var(--content-subtle)] leading-relaxed">
          É como você aparece no perfil, nos anúncios e nas avaliações.
          {fallbackName ? ` Em branco, usamos seu primeiro nome: ${fallbackName}.` : ''} Seu nome completo
          não aparece publicamente.
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="bio" className="text-[0.875rem] font-medium">
            Apresentação <span className="font-normal text-[var(--content-subtle)]">(opcional)</span>
          </label>
          <span
            className={`text-[0.75rem] tabular-nums ${bio.length > BIO_MAX ? 'text-[var(--color-critical)]' : 'text-[var(--content-subtle)]'}`}
            aria-live="polite"
          >
            {bio.length}/{BIO_MAX}
          </span>
        </div>
        <Textarea
          id="bio"
          name="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={BIO_MAX}
          rows={4}
          aria-invalid={state?.fieldErrors?.bio ? true : undefined}
          aria-describedby="bio-ajuda"
          placeholder="Conte um pouco sobre você: o que costuma guardar ou alugar, como prefere combinar a entrega das chaves…"
        />
        {state?.fieldErrors?.bio && (
          <p role="alert" className="text-[0.8125rem] text-[var(--color-critical)]">
            {state.fieldErrors.bio}
          </p>
        )}
        <p id="bio-ajuda" className="text-[0.75rem] text-[var(--content-subtle)]">
          Aparece no seu perfil público. Não inclua telefone, e-mail, documentos ou links.
        </p>
      </div>

      <SubmitButton size="md" block={false}>
        Salvar perfil
      </SubmitButton>
    </form>
  );
}
