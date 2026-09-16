import * as React from 'react';
import { cn } from '@/lib/utils';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';

const TONES = {
  info: { icon: Info, color: 'var(--accent)', bg: 'var(--accent-subtle)' },
  success: { icon: CircleCheck, color: 'var(--color-positive)', bg: 'color-mix(in oklch, var(--color-positive) 10%, transparent)' },
  warning: { icon: TriangleAlert, color: 'var(--color-caution)', bg: 'color-mix(in oklch, var(--color-caution) 12%, transparent)' },
  critical: { icon: CircleAlert, color: 'var(--color-critical)', bg: 'color-mix(in oklch, var(--color-critical) 10%, transparent)' },
} as const;

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: keyof typeof TONES;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const { icon: Icon, color, bg } = TONES[tone];
  return (
    <div
      // assertive so no que e erro: aviso informativo nao deve interromper a leitura.
      role={tone === 'critical' ? 'alert' : 'status'}
      className={cn(
        'flex gap-3 p-3.5 rounded-[var(--radius-field)] border text-[0.875rem]',
        className,
      )}
      style={{ backgroundColor: bg, borderColor: `color-mix(in oklch, ${color} 25%, transparent)` }}
    >
      <Icon className="size-[1.125rem] shrink-0 mt-px" style={{ color }} aria-hidden />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-medium text-[var(--content)]">{title}</p>}
        {children && <div className="text-[var(--content-muted)] leading-relaxed">{children}</div>}
      </div>
    </div>
  );
}
