'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { CreditCard, QrCode } from 'lucide-react';
import { choosePaymentMethodAction, type PaymentActionState } from '@/lib/payments/actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

function Botao({ method, label, variant }: { method: 'pix' | 'card'; label: string; variant: 'primary' | 'secondary' }) {
  const { pending, data } = useFormStatus();
  const esteEnviando = pending && data?.get('method') === method;
  return (
    <Button
      type="submit" name="method" value={method} variant={variant} size="lg" block
      loading={esteEnviando} disabled={pending}
    >
      {!esteEnviando && (method === 'pix' ? <QrCode className="size-4" aria-hidden /> : <CreditCard className="size-4" aria-hidden />)}
      {label}
    </Button>
  );
}

/**
 * "Pagar com Pix" / "Pagar com cartão" sobre a MESMA cobrança.
 * Os dois botões travam enquanto um envia — o duplo toque não sai do
 * aparelho; e, se sair, o servidor não cria nada novo (só troca a forma de
 * pagamento da cobrança que já existe).
 */
export function PaymentMethodButtons({
  bookingId,
  showPix,
  showCard,
  pixLabel = 'Pagar com Pix',
  cardLabel = 'Pagar com cartão de crédito ou débito',
  primary = 'pix',
}: {
  bookingId: string;
  showPix: boolean;
  showCard: boolean;
  pixLabel?: string;
  cardLabel?: string;
  primary?: 'pix' | 'card';
}) {
  const [state, action] = useActionState<PaymentActionState | undefined, FormData>(choosePaymentMethodAction, undefined);
  return (
    <form action={action} className="space-y-2.5">
      <input type="hidden" name="bookingId" value={bookingId} />
      {state?.message && !state.ok && <Alert tone="critical">{state.message}</Alert>}
      {showPix && <Botao method="pix" label={pixLabel} variant={primary === 'pix' ? 'primary' : 'secondary'} />}
      {showCard && <Botao method="card" label={cardLabel} variant={primary === 'card' ? 'primary' : 'secondary'} />}
    </form>
  );
}

/**
 * "Pagar agora" do pagamento pendente: um botão só; ao tocar,
 * aparecem as formas de pagamento — sempre sobre a cobrança que já existe.
 */
export function PayNowChooser({ bookingId }: { bookingId: string }) {
  const [aberto, setAberto] = useState(false);
  if (!aberto) {
    return (
      <Button type="button" size="lg" block onClick={() => setAberto(true)}>
        Pagar agora
      </Button>
    );
  }
  return (
    <div className="space-y-2.5" data-testid="formas-de-pagamento">
      <p className="text-[0.875rem] font-medium">Como você quer pagar?</p>
      <PaymentMethodButtons
        bookingId={bookingId}
        showPix
        showCard
        pixLabel="Pix — aprovação na hora"
        cardLabel="Cartão de crédito ou débito"
      />
    </div>
  );
}
