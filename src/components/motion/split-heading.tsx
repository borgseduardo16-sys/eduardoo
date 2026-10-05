'use client';

import { LazyMotion, domAnimation, m } from 'motion/react';
import { useMotionOk } from './use-motion-ok';

/**
 * Título que entra palavra por palavra, de baixo de uma máscara. O texto
 * continua sendo UM título para leitor de tela (aria-label + filhos ocultos).
 */
export function SplitHeading({
  text,
  className,
  delay = 0.1,
}: {
  text: string;
  className?: string;
  delay?: number;
}) {
  const ok = useMotionOk();
  if (!ok) return <h1 className={className}>{text}</h1>;

  return (
    <LazyMotion features={domAnimation} strict>
      <h1 className={className} aria-label={text}>
        {text.split(' ').map((palavra, i) => (
          <span key={i} aria-hidden className="inline-block overflow-hidden align-bottom pb-[0.08em] -mb-[0.08em]">
            <m.span
              className="inline-block"
              initial={{ y: '105%' }}
              animate={{ y: 0 }}
              transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1], delay: delay + i * 0.07 }}
            >
              {palavra}
              {' '}
            </m.span>
          </span>
        ))}
      </h1>
    </LazyMotion>
  );
}
