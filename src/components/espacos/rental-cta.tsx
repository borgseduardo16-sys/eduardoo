import Link from 'next/link';
import { Clock, CreditCard, KeyRound, Send } from 'lucide-react';
import { StartConversationButton } from '@/components/messaging/start-conversation-button';
import { buttonVariants } from '@/components/ui/button';
import { formatBRL } from '@/lib/money';
import { availabilityText, totalPlaceText } from '@/lib/spaces/quantity';

/**
 * "Alugar este espaço" na página do anúncio: o preço mensal, quantas unidades
 * estão livres AGORA (o número vem das locações reais, mantido pelo banco) e o
 * caminho até a locação, dito com franqueza — nada é cobrado ao solicitar.
 */
export function RentalCta({
  slug, spaceId, spaceType, priceMonthlyCents, quantityAvailable, quantityOffered, quantityTotal,
  loggedIn, ownerView, depositNote,
}: {
  slug: string;
  spaceId: string;
  spaceType: string;
  priceMonthlyCents: number;
  quantityAvailable: number;
  quantityOffered: number;
  quantityTotal: number | null;
  loggedIn: boolean;
  /** O dono vê o resumo, sem botão de solicitar. */
  ownerView?: boolean;
  depositNote?: string | null;
}) {
  const voltar = `/entrar?next=${encodeURIComponent(`/espacos/${slug}/solicitar`)}`;
  const totalLocal = totalPlaceText(spaceType, quantityOffered, quantityTotal);

  return (
    <section id="alugar" aria-labelledby="alugar-titulo" className="rounded-[var(--radius-card)] border-2 p-5 sm:p-6 space-y-5 scroll-mt-20">
      <header className="space-y-1">
        <h2 id="alugar-titulo" className="font-semibold text-[1.0625rem]">Alugar este espaço</h2>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[1.5rem] font-semibold tabular-nums">{formatBRL(priceMonthlyCents)}</span>
          <span className="text-[var(--content-muted)]">por mês</span>
        </p>
        <p className="text-[0.9375rem] text-[var(--content-muted)]" data-testid="resumo-unidades">
          {availabilityText(spaceType, quantityAvailable, quantityOffered)}
        </p>
        {totalLocal && <p className="text-[0.8125rem] text-[var(--content-subtle)]">{totalLocal}</p>}
      </header>

      <ol className="space-y-2.5 text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
        <li className="flex gap-2.5">
          <Send className="size-4 mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden />
          <span>Você escolhe a data de início e envia a solicitação. <strong className="font-medium text-[var(--content)]">Nada é cobrado nem bloqueado no seu cartão</strong> nessa etapa.</span>
        </li>
        <li className="flex gap-2.5">
          <Clock className="size-4 mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden />
          <span>O proprietário tem 24 horas para aceitar ou recusar. Sem resposta, a solicitação expira.</span>
        </li>
        <li className="flex gap-2.5">
          <CreditCard className="size-4 mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden />
          <span>Se aceitar, você tem 24 horas para pagar pelo app (Pix ou cartão). Pago, a locação é confirmada.</span>
        </li>
        <li className="flex gap-2.5">
          <KeyRound className="size-4 mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden />
          <span>O endereço exato e as instruções de acesso aparecem para você só depois da confirmação.</span>
        </li>
      </ol>
      {depositNote && <p className="text-[0.8125rem] text-[var(--content-subtle)]">{depositNote}</p>}

      {!ownerView && (
        <div className="flex flex-wrap items-center gap-3">
          {loggedIn ? (
            <Link href={`/espacos/${slug}/solicitar`} className={buttonVariants({ size: 'lg' })}>
              Solicitar locação
            </Link>
          ) : (
            <Link href={voltar} className={buttonVariants({ size: 'lg' })}>Entrar para solicitar</Link>
          )}
          {loggedIn ? (
            <StartConversationButton spaceId={spaceId} />
          ) : (
            <Link
              href={`/entrar?next=${encodeURIComponent(`/espacos/${slug}`)}`}
              className={buttonVariants({ variant: 'secondary', size: 'lg' })}
            >
              Entrar para conversar
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
