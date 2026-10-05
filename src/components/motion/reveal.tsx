'use client';

import type { ElementType, ReactNode } from 'react';
import { LazyMotion, domAnimation, m, type Variants } from 'motion/react';
import { useMotionOk } from './use-motion-ok';

const EASE = [0.16, 1, 0.3, 1] as const;

const item: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

/**
 * Aparece ao entrar na viewport (uma vez só). `delay` em segundos.
 * Com "reduzir movimento" renderiza o conteúdo final, sem transição.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as = 'div',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: 'div' | 'li' | 'section' | 'p';
}) {
  const ok = useMotionOk();
  const Tag = as as ElementType;
  if (!ok) return <Tag className={className}>{children}</Tag>;
  const M = m[as];
  return (
    <LazyMotion features={domAnimation} strict>
      <M
        className={className}
        variants={item}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '0px 0px -12% 0px' }}
        transition={{ delay }}
      >
        {children}
      </M>
    </LazyMotion>
  );
}

/** Contêiner que escalona (stagger) os filhos <RevealItem>. */
export function RevealGroup({
  children,
  className,
  as = 'div',
  stagger = 0.09,
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'ul' | 'ol';
  stagger?: number;
}) {
  const ok = useMotionOk();
  const Tag = as as ElementType;
  if (!ok) return <Tag className={className}>{children}</Tag>;
  const M = m[as];
  return (
    <LazyMotion features={domAnimation} strict>
      <M
        className={className}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '0px 0px -12% 0px' }}
        variants={{ hidden: {}, show: { transition: { staggerChildren: stagger } } }}
      >
        {children}
      </M>
    </LazyMotion>
  );
}

export function RevealItem({
  children,
  className,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'li';
}) {
  const ok = useMotionOk();
  const Tag = as as ElementType;
  if (!ok) return <Tag className={className}>{children}</Tag>;
  const M = m[as];
  return (
    <LazyMotion features={domAnimation} strict>
      <M className={className} variants={item}>
        {children}
      </M>
    </LazyMotion>
  );
}
