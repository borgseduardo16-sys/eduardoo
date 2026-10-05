'use client';

import { useState } from 'react';
import { LazyMotion, domAnimation, m } from 'motion/react';
import { useMotionOk } from '@/components/motion/use-motion-ok';
import { IllustrativeTag } from './illustrative-tag';

/*
 * Gráfico CONCEITUAL: sem eixo numérico, sem valores. Mostra só a ideia de que
 * atendimento organizado tende a evoluir de forma mais estável do que
 * atendimento improvisado. Não representa dado real do produto.
 */

// Improvisado: sobe e desce, sem direção.
const CAOS = 'M 40 190 L 100 150 L 150 205 L 210 160 L 260 215 L 330 170 L 390 210 L 450 175 L 520 200 L 590 182';
// Profissional: curva de evolução constante.
const PRO = 'M 40 205 C 130 200, 200 185, 280 150 S 440 85, 590 48';
const AREA = `${PRO} L 590 250 L 40 250 Z`;

export function CompareChart() {
  const ok = useMotionOk();
  const [foco, setFoco] = useState<'caos' | 'pro' | null>(null);
  const dim = (qual: 'caos' | 'pro') => (foco && foco !== qual ? 0.18 : 1);
  const anim = (delay: number) =>
    ok
      ? {
          initial: { pathLength: 0, opacity: 0 },
          whileInView: { pathLength: 1, opacity: 1 },
          viewport: { once: true, margin: '0px 0px -20% 0px' },
          transition: { duration: 2, delay, ease: [0.22, 1, 0.36, 1] as const },
        }
      : {};

  return (
    <LazyMotion features={domAnimation} strict>
      <figure className="rounded-3xl border border-white/10 bg-[#070d1b]/80 p-4 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9)] sm:p-6">
        <figcaption className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Destacar linha do gráfico">
            <Legenda ativo={foco === 'caos'} cor="bg-white/50" aoEntrar={() => setFoco('caos')} aoSair={() => setFoco(null)}>
              Atendimento sem organização
            </Legenda>
            <Legenda ativo={foco === 'pro'} cor="bg-[var(--v-blue)]" aoEntrar={() => setFoco('pro')} aoSair={() => setFoco(null)}>
              Atendimento profissional
            </Legenda>
          </div>
          <IllustrativeTag />
        </figcaption>

        <svg
          viewBox="0 0 640 280"
          role="img"
          aria-label="Gráfico ilustrativo: a linha do atendimento sem organização oscila sem direção, enquanto a do atendimento profissional evolui de forma constante. Exemplo conceitual, sem valores reais."
          className="h-auto w-full"
        >
          <defs>
            <linearGradient id="v-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2f7bff" stopOpacity="0.32" />
              <stop offset="1" stopColor="#2f7bff" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[70, 130, 190, 250].map((y) => (
            <line key={y} x1="40" x2="600" y1={y} y2={y} stroke="white" strokeOpacity="0.06" />
          ))}
          <line x1="40" x2="40" y1="20" y2="250" stroke="white" strokeOpacity="0.18" />
          <line x1="40" x2="600" y1="250" y2="250" stroke="white" strokeOpacity="0.18" />
          <text x="46" y="18" fill="#9ba9c4" fontSize="11">Organização do atendimento</text>
          <text x="600" y="272" fill="#9ba9c4" fontSize="11" textAnchor="end">Tempo</text>

          <m.path d={AREA} fill="url(#v-area)" style={{ opacity: dim('pro') }}
            {...(ok ? { initial: { opacity: 0 }, whileInView: { opacity: 1 }, viewport: { once: true }, transition: { duration: 1.4, delay: 1.2 } } : {})} />
          <m.path d={CAOS} fill="none" stroke="white" strokeOpacity={0.55} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
            style={{ opacity: dim('caos') }} {...anim(0)} />
          <m.path d={PRO} fill="none" stroke="#2f7bff" strokeWidth="3.5" strokeLinecap="round"
            style={{ opacity: dim('pro'), filter: 'drop-shadow(0 0 8px rgb(47 123 255 / 0.55))' }} {...anim(0.5)} />

          {/* Pontas das linhas: só aparecem depois que o traço chega lá. */}
          <m.g style={{ opacity: dim('pro') }}
            {...(ok ? { initial: { opacity: 0 }, whileInView: { opacity: dim('pro') }, viewport: { once: true }, transition: { delay: 2.3, duration: 0.5 } } : {})}>
            <circle cx="590" cy="48" r="5" fill="#25d366" />
            <circle cx="590" cy="48" r="5" fill="none" stroke="#25d366" className="v-ping" style={{ transformOrigin: '590px 48px' }} />
          </m.g>
          <m.circle cx="590" cy="182" r="4" fill="white" fillOpacity="0.6" style={{ opacity: dim('caos') }}
            {...(ok ? { initial: { opacity: 0 }, whileInView: { opacity: dim('caos') }, viewport: { once: true }, transition: { delay: 1.9, duration: 0.5 } } : {})} />
        </svg>

        <p className="mt-3 text-xs leading-relaxed text-[var(--v-muted)]">
          Representação conceitual para ilustrar a ideia. Não mostra dados reais nem promete resultados.
        </p>
      </figure>
    </LazyMotion>
  );
}

function Legenda({
  children, cor, ativo, aoEntrar, aoSair,
}: {
  children: React.ReactNode; cor: string; ativo: boolean; aoEntrar: () => void; aoSair: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onPointerEnter={aoEntrar}
      onPointerLeave={aoSair}
      onFocus={aoEntrar}
      onBlur={aoSair}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        ativo ? 'border-white/30 bg-white/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'
      }`}
    >
      <span className={`size-2 rounded-full ${cor}`} aria-hidden />
      {children}
    </button>
  );
}
