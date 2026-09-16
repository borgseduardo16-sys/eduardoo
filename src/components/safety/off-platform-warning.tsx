'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ShieldAlert, TriangleAlert, X } from 'lucide-react';
import type { DetectionResult } from '@/lib/safety/contact-detection';
import { cn } from '@/lib/utils';

/**
 * Aviso que aparece quando o detector encontra troca de contato ou pedido de
 * pagamento por fora.
 *
 * ESCALONADO de propósito. Aviso de intensidade única vira ruído: quem vê o
 * mesmo alerta em toda mensagem para de ler. Aqui:
 *
 *   - troca de contato (telefone, e-mail) → tom de atenção, discreto
 *   - pedido de pagamento por fora        → tom crítico, com o que se perde
 *
 * O segundo caso é o que realmente tira dinheiro de alguém, e é o único que
 * justifica interromper a leitura da conversa.
 *
 * Pode ser dispensado. Aviso que não fecha é aviso que a pessoa aprende a
 * ignorar — e passa a ignorar também o que importa.
 */
export function OffPlatformWarning({
  detection,
  className,
}: {
  detection: Pick<DetectionResult, 'kinds' | 'shouldWarn'>;
  className?: string;
}) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !detection.shouldWarn) return null;

  const envolvePagamento =
    detection.kinds.includes('chave_pix') ||
    detection.kinds.includes('cpf') ||
    detection.kinds.includes('cnpj') ||
    detection.kinds.includes('mencao_pagamento_externo');

  const grave = envolvePagamento;

  return (
    <div
      role={grave ? 'alert' : 'status'}
      className={cn(
        'relative flex gap-3 rounded-[var(--radius-field)] border p-3.5 pr-10',
        className,
      )}
      style={{
        backgroundColor: grave
          ? 'color-mix(in oklch, var(--color-critical) 10%, transparent)'
          : 'color-mix(in oklch, var(--color-caution) 12%, transparent)',
        borderColor: grave
          ? 'color-mix(in oklch, var(--color-critical) 30%, transparent)'
          : 'color-mix(in oklch, var(--color-caution) 30%, transparent)',
      }}
    >
      {grave ? (
        <ShieldAlert
          className="size-[1.125rem] shrink-0 mt-px"
          style={{ color: 'var(--color-critical)' }}
          aria-hidden
        />
      ) : (
        <TriangleAlert
          className="size-[1.125rem] shrink-0 mt-px"
          style={{ color: 'var(--color-caution)' }}
          aria-hidden
        />
      )}

      <div className="min-w-0 space-y-1.5">
        {grave ? (
          <>
            <p className="font-medium text-[0.875rem]">
              Cuidado: isso parece um pedido de pagamento por fora
            </p>
            <p className="text-[0.8125rem] text-[var(--content-muted)] leading-relaxed">
              Pix direto para outra pessoa é irreversível — o banco não estorna. Pedido de
              sinal antes da visita é o golpe mais comum neste tipo de anúncio.{' '}
              <strong className="text-[var(--content)] font-medium">
                Nunca pague nada fora da MyPlace
              </strong>
              , nem antes de visitar o espaço.
            </p>
            <p className="text-[0.8125rem]">
              <Link
                href="/protecao#golpes"
                className="text-[var(--accent)] underline underline-offset-2 font-medium"
              >
                Ver sinais de golpe
              </Link>
            </p>
          </>
        ) : (
          <>
            <p className="font-medium text-[0.875rem]">Troca de contato detectada</p>
            <p className="text-[0.8125rem] text-[var(--content-muted)] leading-relaxed">
              Combinar por fora tira vocês da proteção da plataforma: sem registro da
              conversa, não há como comprovar o que foi acertado.{' '}
              <Link href="/protecao" className="text-[var(--accent)] underline underline-offset-2">
                Entenda o que você perde
              </Link>
            </p>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dispensar aviso"
        className="absolute top-2.5 right-2.5 p-1.5 rounded-[var(--radius-field)] text-[var(--content-muted)] hover:bg-[var(--surface-sunken)]"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
