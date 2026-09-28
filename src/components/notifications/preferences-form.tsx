'use client';

import { useActionState, useState } from 'react';
import { Lock } from 'lucide-react';
import { updateNotificationPreferencesAction, type PreferencesState } from '@/lib/notifications/actions';
import { CATEGORY_INFO, type NotificationCategory } from '@/lib/notifications/categories';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/auth/form-shell';
import { cn } from '@/lib/utils';

type Pref = { category: NotificationCategory; inApp: boolean; push: boolean; essential: boolean };

/**
 * Interruptores por categoria: "Na central" e "No celular".
 *
 * Essenciais aparecem ligados e travados, com o motivo — não somem da tela
 * (isso esconderia que existem) nem fingem ser editáveis. O servidor ignora
 * qualquer valor enviado para elas.
 */
export function PreferencesForm({ initial }: { initial: Pref[] }) {
  const [state, action] = useActionState<PreferencesState | undefined, FormData>(
    updateNotificationPreferencesAction,
    undefined,
  );
  const [prefs, setPrefs] = useState(initial);

  function alternar(category: NotificationCategory, campo: 'inApp' | 'push') {
    setPrefs((atual) =>
      atual.map((p) => {
        if (p.category !== category || p.essential) return p;
        const novo = { ...p, [campo]: !p[campo] };
        // Sem central, sem celular: desligar a central desliga o push junto.
        if (campo === 'inApp' && !novo.inApp) novo.push = false;
        if (campo === 'push' && novo.push) novo.inApp = true;
        return novo;
      }),
    );
  }

  return (
    <form action={action} className="space-y-5">
      {state?.ok && (
        <div className="animate-rise">
          <Alert tone="success">{state.message}</Alert>
        </div>
      )}
      {state && !state.ok && state.message && <Alert tone="critical">{state.message}</Alert>}

      <ul className="divide-y rounded-[var(--radius-card)] border">
        {prefs.map((p) => (
          <li key={p.category} className="p-4 sm:p-5 space-y-3">
            <div className="space-y-0.5">
              <p className="font-medium flex items-center gap-2">
                {CATEGORY_INFO[p.category].label}
                {p.essential && (
                  <span className="inline-flex items-center gap-1 text-[0.75rem] font-normal text-[var(--content-subtle)]">
                    <Lock className="size-3" aria-hidden />
                    Sempre ativado
                  </span>
                )}
              </p>
              <p className="text-[0.8125rem] text-[var(--content-muted)] leading-relaxed">
                {CATEGORY_INFO[p.category].description}
              </p>
              {p.essential && (
                <p className="text-[0.75rem] text-[var(--content-subtle)]">
                  Essencial para o funcionamento das suas reservas e da sua conta — não pode ser desligado.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Interruptor
                name={`${p.category}:in_app`}
                label="Na central"
                checked={p.inApp}
                disabled={p.essential}
                onChange={() => alternar(p.category, 'inApp')}
              />
              <Interruptor
                name={`${p.category}:push`}
                label="No celular (push)"
                checked={p.push}
                disabled={p.essential}
                onChange={() => alternar(p.category, 'push')}
              />
            </div>
          </li>
        ))}
      </ul>

      <SubmitButton size="md" block={false}>
        Salvar preferências
      </SubmitButton>
    </form>
  );
}

function Interruptor({
  name,
  label,
  checked,
  disabled,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <label className={cn('inline-flex items-center gap-2.5 text-[0.875rem]', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
      <input
        type="checkbox"
        role="switch"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-checked={checked}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cn(
          'relative inline-block h-6 w-10 rounded-full transition-colors',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]',
          checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]',
          disabled && 'opacity-60',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform',
            checked && 'translate-x-4',
          )}
        />
      </span>
      <span>
        {label}
        <span className="sr-only">{checked ? ' — ativado' : ' — desativado'}</span>
      </span>
    </label>
  );
}
