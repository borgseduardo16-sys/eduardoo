'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { subscribeToPushAction, unsubscribeFromPushAction } from '@/lib/notifications/push-actions';

/** `applicationServerKey` do PushManager quer bytes, não a string base64url que o VAPID devolve. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type Status = 'verificando' | 'sem-suporte' | 'nao-configurado' | 'negado' | 'inativo' | 'ativo';

/**
 * Ativa notificação push de verdade — a que aparece no celular mesmo com o
 * app fechado, não só o sininho do site (Fase 19).
 *
 * `pushConfigurado` vem do servidor (VAPID_PRIVATE_KEY/VAPID_SUBJECT — só o
 * servidor sabe se estão definidas); a chave pública em si é segura no
 * cliente por natureza do protocolo, lida direto de `NEXT_PUBLIC_...`.
 */
export function PushNotificationToggle({ pushConfigurado }: { pushConfigurado: boolean }) {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
  // Sempre comeca em 'verificando', igual no servidor e no cliente — a
  // deteccao de verdade so pode acontecer no navegador (useEffect), nunca no
  // render inicial, senao o texto do SSR diverge do primeiro render do
  // cliente (hydration mismatch) so por causa de `window` existir num lado e nao no outro.
  const [status, setStatus] = useState<Status>('verificando');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function checar() {
      if (!pushConfigurado || !vapidPublicKey) {
        if (!cancelado) setStatus('nao-configurado');
        return;
      }
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        if (!cancelado) setStatus('sem-suporte');
        return;
      }
      if (Notification.permission === 'denied') {
        if (!cancelado) setStatus('negado');
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        const sub = await reg?.pushManager.getSubscription();
        if (!cancelado) setStatus(sub ? 'ativo' : 'inativo');
      } catch {
        if (!cancelado) setStatus('inativo');
      }
    }

    void checar();
    return () => {
      cancelado = true;
    };
  }, [pushConfigurado, vapidPublicKey]);

  async function ativar() {
    if (!vapidPublicKey) return;
    setErro(null);
    setStatus('verificando');
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== 'granted') {
        setStatus('negado');
        return;
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });
      const raw = subscription.toJSON();
      if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) {
        throw new Error('Inscrição incompleta.');
      }

      const resultado = await subscribeToPushAction({
        endpoint: raw.endpoint,
        keys: { p256dh: raw.keys.p256dh, auth: raw.keys.auth },
      });
      if (!resultado.ok) {
        setErro(resultado.message ?? 'Não foi possível ativar agora.');
        setStatus('inativo');
        return;
      }
      setStatus('ativo');
    } catch (err) {
      console.error('[push] falha ao ativar:', err);
      setErro('Não foi possível ativar as notificações neste navegador.');
      setStatus('inativo');
    }
  }

  async function desativar() {
    setStatus('verificando');
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await unsubscribeFromPushAction(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus('inativo');
    } catch (err) {
      console.error('[push] falha ao desativar:', err);
      setStatus('ativo');
    }
  }

  if (status === 'nao-configurado') {
    return (
      <Alert tone="info" title="Notificação push ainda não configurada">
        Este ambiente ainda não tem a chave de notificação push configurada. Você continua
        recebendo tudo pelo sininho, aqui no site.
      </Alert>
    );
  }

  if (status === 'sem-suporte') {
    return (
      <Alert tone="info" title="Seu navegador não suporta notificação push">
        No iPhone, isso costuma ser porque o site ainda não foi adicionado à tela de início —
        é uma exigência do próprio iOS, não deste app. Toque em Compartilhar → Adicionar à Tela
        de Início e tente de novo.
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      {status === 'negado' && (
        <Alert tone="warning" title="Notificações bloqueadas neste navegador">
          Você negou a permissão antes. Para ativar, permita notificações para este site nas
          configurações do navegador.
        </Alert>
      )}
      {erro && <Alert tone="critical">{erro}</Alert>}

      {status === 'ativo' ? (
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[0.9375rem]">
            <BellRing className="size-4 text-[var(--color-positive)]" aria-hidden />
            Notificações ativas neste dispositivo
          </span>
          <Button variant="secondary" size="sm" onClick={desativar}>
            <BellOff aria-hidden /> Desativar
          </Button>
        </div>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={ativar}
          loading={status === 'verificando'}
          disabled={status === 'negado'}
        >
          <Bell aria-hidden /> Ativar notificações no celular
        </Button>
      )}
    </div>
  );
}
