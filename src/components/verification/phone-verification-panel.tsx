'use client';

import { useActionState, useState, useTransition } from 'react';
import { CircleCheck, Smartphone } from 'lucide-react';
import {
  cancelPhoneVerificationAction,
  checkPhoneVerificationAction,
  startPhoneVerificationAction,
  type PhoneVerificationState,
} from '@/lib/verification/actions';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SubmitButton } from '@/components/auth/form-shell';

/**
 * Verificação de telefone em duas etapas (número → código).
 *
 * O componente não decide nada sozinho: quem diz se o telefone está
 * verificado é o servidor (prop `verifiedAt`, vinda do banco), e o selo só é
 * gravado depois que o provedor de SMS aprova o código.
 */
export function PhoneVerificationPanel({
  available,
  verifiedMasked,
  verifiedAtLabel,
  pending,
  isAdmin,
}: {
  available: boolean;
  /** Número verificado, mascarado — null se ainda não verificou. */
  verifiedMasked: string | null;
  verifiedAtLabel: string | null;
  /** Código já enviado e ainda válido. */
  pending: { masked: string; attemptsLeft: number } | null;
  isAdmin: boolean;
}) {
  const [trocando, setTrocando] = useState(false);
  const [cancelando, startCancel] = useTransition();
  const [inicio, iniciar] = useActionState<PhoneVerificationState | undefined, FormData>(
    startPhoneVerificationAction,
    undefined,
  );
  const [conferencia, conferir] = useActionState<PhoneVerificationState | undefined, FormData>(
    checkPhoneVerificationAction,
    undefined,
  );

  if (!available) {
    return (
      <div className="space-y-2">
        <p className="text-[0.9375rem] text-[var(--content-muted)] leading-relaxed">
          A verificação de telefone ainda não está disponível na MyPlace. Quando estiver, você vai
          confirmar seu número com um código enviado por SMS — e o selo &ldquo;Telefone
          verificado&rdquo; passa a aparecer no seu perfil.
        </p>
        {isAdmin && (
          <Alert tone="info" title="Para a administração">
            Falta configurar o serviço de SMS (Twilio Verify): TWILIO_ACCOUNT_SID,
            TWILIO_AUTH_TOKEN e TWILIO_VERIFY_SERVICE_SID. Passo a passo em docs/SETUP.md, seção 13.
          </Alert>
        )}
      </div>
    );
  }

  if (conferencia?.ok && conferencia.step === 'done') {
    return (
      <Alert tone="success" title="Telefone verificado">
        O selo já aparece no seu perfil público. O número em si continua privado.
      </Alert>
    );
  }

  const naEtapaCodigo =
    (inicio?.ok && inicio.step === 'code') || (Boolean(pending) && !inicio) || conferencia?.step === 'code';

  if (verifiedMasked && !trocando && !naEtapaCodigo) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-[0.9375rem]">
          <CircleCheck className="size-4 text-[var(--color-positive)] shrink-0" aria-hidden />
          <span>
            Verificado: <span className="tabular-nums">{verifiedMasked}</span>
            {verifiedAtLabel && <span className="text-[var(--content-muted)]"> · desde {verifiedAtLabel}</span>}
          </span>
        </p>
        <Button type="button" variant="secondary" size="sm" onClick={() => setTrocando(true)}>
          Trocar número
        </Button>
      </div>
    );
  }

  if (naEtapaCodigo) {
    const destino = inicio?.ok ? inicio.message : pending ? `Enviamos um código por SMS para ${pending.masked}.` : null;
    return (
      <div className="space-y-3">
        {destino && <p className="text-[0.9375rem]">{destino}</p>}
        {conferencia?.message && !conferencia.ok && (
          <Alert tone={conferencia.step === 'code' ? 'warning' : 'critical'}>{conferencia.message}</Alert>
        )}
        <form action={conferir} className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="codigo-sms" className="text-[0.875rem] font-medium">
              Código recebido por SMS
            </label>
            <Input
              id="codigo-sms"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={10}
              required
              className="max-w-[12rem] tracking-[0.3em] tabular-nums"
            />
            <p className="text-[0.75rem] text-[var(--content-subtle)]">O código vale por 10 minutos.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <SubmitButton size="sm" block={false}>
              Confirmar código
            </SubmitButton>
            <Button
              type="button"
              variant="quiet"
              size="sm"
              loading={cancelando}
              onClick={() =>
                startCancel(async () => {
                  await cancelPhoneVerificationAction();
                  window.location.reload();
                })
              }
            >
              Usar outro número
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <form action={iniciar} className="space-y-3">
      {inicio?.message && !inicio.ok && <Alert tone="critical">{inicio.message}</Alert>}
      {conferencia?.message && !conferencia.ok && !conferencia.step && <Alert tone="warning">{conferencia.message}</Alert>}
      <div className="space-y-1.5">
        <label htmlFor="telefone" className="text-[0.875rem] font-medium">
          Celular com DDD
        </label>
        <div className="flex items-center gap-2 max-w-xs">
          <Smartphone className="size-4 text-[var(--content-subtle)] shrink-0" aria-hidden />
          <Input
            id="telefone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="(27) 99999-8888"
            required
          />
        </div>
        <p className="text-[0.75rem] text-[var(--content-subtle)] leading-relaxed">
          Enviamos um código por SMS. O número nunca aparece no seu perfil público — só o selo.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <SubmitButton size="sm" block={false}>
          Enviar código por SMS
        </SubmitButton>
        {trocando && (
          <Button type="button" variant="quiet" size="sm" onClick={() => setTrocando(false)}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
