import 'server-only';
import { serverEnv, IntegrationNotConfiguredError } from '@/lib/env';
import { getUserEmail } from '@/lib/auth/queries';
import { sendEmail } from '@/lib/email/resend';

export type NotifyNewMessageInput = {
  recipientId: string;
  conversationId: string;
  senderName: string;
  spaceTitle: string;
  preview: string;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Avisa por e-mail quem recebeu uma mensagem nova — para quando a pessoa nao
 * esta com o site aberto (sem isso, uma mensagem podia ficar sem resposta
 * indefinidamente, so porque ninguem viu o sininho).
 *
 * Best-effort de proposito, sempre: o chat em si ja funciona sem e-mail
 * nenhum, e precisa continuar funcionando mesmo se o Resend cair ou nao
 * estiver configurado ainda. Por isso esta funcao NUNCA lanca — quem chama
 * (sendMessageAction, o fluxo de reserva) nao precisa de try/catch proprio.
 * Sem RESEND_API_KEY/EMAIL_FROM, so nao envia (nao finge que enviou).
 */
export async function notifyNewMessage(input: NotifyNewMessageInput): Promise<void> {
  try {
    const email = await getUserEmail(input.recipientId);
    if (!email) return;

    const link = `${serverEnv.NEXT_PUBLIC_SITE_URL}/mensagens/${input.conversationId}`;
    const previewCurto =
      input.preview.length > 200 ? `${input.preview.slice(0, 197)}...` : input.preview;

    await sendEmail({
      to: email,
      subject: `Nova mensagem de ${input.senderName} sobre "${input.spaceTitle}"`,
      text: `${input.senderName}: ${previewCurto}\n\nResponda em ${link}`,
      html:
        `<p><strong>${escapeHtml(input.senderName)}</strong> sobre ` +
        `"${escapeHtml(input.spaceTitle)}":</p>` +
        `<p>${escapeHtml(previewCurto)}</p>` +
        `<p><a href="${link}">Responder na MyPlace</a></p>`,
    });
  } catch (err) {
    // Integracao ainda nao configurada e o estado normal ate a Fase 6 ganhar
    // a conta Resend real — nao e um erro para logar como se fosse.
    if (err instanceof IntegrationNotConfiguredError) return;
    console.error('[messaging] falha ao enviar e-mail de notificacao:', err);
  }
}
