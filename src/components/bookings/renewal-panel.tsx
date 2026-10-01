import Link from 'next/link';
import type { RenewalInfo } from '@/lib/bookings/renewal';
import { RENEWAL_STATE_LABEL } from '@/lib/bookings/renewal-state';
import { paymentStatusLabel, PAYMENT_STATUS_INFO } from '@/lib/payments/format';
import { formatBRL } from '@/lib/money';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';

function dataBr(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/**
 * Renovação mensal na página da reserva (Fase 23): próxima cobrança, valor,
 * até quando está pago, situação e histórico — tudo das cobranças reais que
 * o gateway informou. "Pagar agora" abre a cobrança no próprio gateway; o
 * status só muda quando o webhook confirma, nunca por clique aqui.
 */
export function RenewalPanel({ info }: { info: RenewalInfo }) {
  const locatario = info.role === 'renter';
  const tom =
    info.state === 'em_dia' ? 'positive'
    : info.state === 'aguardando' ? 'caution'
    : info.state === 'encerrada' ? 'neutral'
    : 'critical';
  const problema = info.state === 'atrasada' || info.state === 'recusada';

  return (
    <section
      id="renovacao"
      aria-labelledby="renovacao-titulo"
      className="rounded-[var(--radius-card)] border p-4 sm:p-5 space-y-4 scroll-mt-20"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="renovacao-titulo" className="font-semibold">Renovação mensal</h2>
        <Badge tone={tom}>{RENEWAL_STATE_LABEL[info.state]}</Badge>
      </div>

      {problema &&
        (locatario ? (
          <Alert tone="critical" title="Não conseguimos processar sua renovação">
            {info.state === 'recusada'
              ? 'O pagamento não foi aprovado. Pague pelo botão abaixo com outro cartão ou meio de pagamento para manter o aluguel ativo.'
              : 'A cobrança venceu sem pagamento. Pague pelo botão abaixo para manter o aluguel ativo.'}{' '}
            Se você já pagou, a confirmação do banco pode levar alguns minutos.
          </Alert>
        ) : (
          <Alert tone="warning" title="A renovação deste mês ainda não foi paga">
            O locatário foi avisado para regularizar. Você recebe um aviso quando o pagamento entrar.
          </Alert>
        ))}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[0.875rem]">
        {info.next && (
          <>
            <div>
              <dt className="text-[0.75rem] text-[var(--content-subtle)]">{problema ? 'Cobrança em aberto' : 'Próxima cobrança'}</dt>
              <dd className="font-medium">{dataBr(info.next.dueDate)}</dd>
            </div>
            <div>
              <dt className="text-[0.75rem] text-[var(--content-subtle)]">{locatario ? 'Valor' : 'Você recebe'}</dt>
              <dd className="font-medium">
                {formatBRL(locatario ? info.next.amountCents : info.ownerPayoutCents)}
                {!locatario && <span className="font-normal text-[var(--content-muted)]"> (já sem a taxa)</span>}
              </dd>
            </div>
          </>
        )}
        {info.paidThrough && (
          <div>
            <dt className="text-[0.75rem] text-[var(--content-subtle)]">Pago até</dt>
            <dd className="font-medium">{dataBr(info.paidThrough)}</dd>
          </div>
        )}
      </dl>

      {locatario && info.next?.invoiceUrl && info.state !== 'em_dia' && info.state !== 'encerrada' && (
        <a
          href={info.next.invoiceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ size: 'lg', block: true })}
        >
          Pagar agora
        </a>
      )}

      {info.next && !info.next.generated && info.state === 'em_dia' && (
        <p className="text-[0.8125rem] text-[var(--content-muted)]">
          {locatario
            ? 'A cobrança é gerada automaticamente antes do vencimento. Quando ela existir, o botão para pagar aparece aqui e você recebe um lembrete.'
            : 'A cobrança é gerada automaticamente antes do vencimento.'}
        </p>
      )}

      {info.history.length > 0 && (
        <details className="text-[0.875rem]">
          <summary className="cursor-pointer font-medium text-[var(--accent)]">
            Histórico de cobranças ({info.history.length})
          </summary>
          <ul className="mt-2 divide-y border-y">
            {info.history.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p>Vencimento {dataBr(c.dueDate)}</p>
                  {c.paidAt && (
                    <p className="text-[0.75rem] text-[var(--content-subtle)]">Pago em {dataBr(c.paidAt.slice(0, 10))}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {locatario && <span className="tabular-nums">{formatBRL(c.amountCents)}</span>}
                  <Badge tone={PAYMENT_STATUS_INFO[c.status]?.tone ?? 'neutral'}>{paymentStatusLabel(c.status)}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      {info.state !== 'encerrada' ? (
        <p className="text-[0.8125rem] text-[var(--content-muted)]">
          A renovação é automática, todo mês, até alguém encerrar o aluguel — pelas regras de sempre, em “Encerrar
          aluguel”.
        </p>
      ) : (
        <p className="text-[0.8125rem] text-[var(--content-muted)]">Aluguel encerrado: não há novas cobranças.</p>
      )}

      {!locatario && (
        <Link href="/meus-espacos/financeiro" className="inline-block text-[0.875rem] text-[var(--accent)] underline underline-offset-4">
          Ver recebimentos
        </Link>
      )}
    </section>
  );
}
