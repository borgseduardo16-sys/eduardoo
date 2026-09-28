import Image from 'next/image';
import { UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: { box: 'size-8', text: 'text-[0.8125rem]', icon: 'size-4', px: 32 },
  md: { box: 'size-11', text: 'text-[1rem]', icon: 'size-5', px: 44 },
  lg: { box: 'size-16', text: 'text-[1.375rem]', icon: 'size-7', px: 64 },
  xl: { box: 'size-24', text: 'text-[2rem]', icon: 'size-10', px: 96 },
} as const;

/**
 * Foto de perfil, com estado "sem foto".
 *
 * Sem foto não é erro: mostra a inicial do nome público num círculo neutro
 * (ou um ícone, se nem nome houver). A URL chega já assinada pelo servidor —
 * o bucket é privado.
 */
export function UserAvatar({
  url,
  name,
  size = 'md',
  className,
}: {
  url: string | null;
  name: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  const inicial = name?.trim().charAt(0).toLocaleUpperCase('pt-BR');

  return (
    <span
      className={cn(
        'relative inline-grid place-items-center shrink-0 overflow-hidden rounded-full',
        'bg-[var(--accent-subtle)] text-[var(--accent)] font-semibold select-none',
        s.box,
        s.text,
        className,
      )}
    >
      {url ? (
        <Image src={url} alt={name ? `Foto de ${name}` : 'Foto de perfil'} fill sizes={`${s.px}px`} className="object-cover" unoptimized />
      ) : inicial ? (
        <span aria-hidden>{inicial}</span>
      ) : (
        <UserRound className={s.icon} aria-hidden />
      )}
    </span>
  );
}
