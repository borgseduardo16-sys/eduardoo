import { cn } from '@/lib/utils';

/**
 * Marca MyPlace.
 *
 * O simbolo e um contorno de espaco com um vazio interno que se "preenche":
 * a ideia do produto em uma forma so — espaco ocioso que passa a ser usado.
 * Desenhado como SVG inline para herdar currentColor e nao pesar uma request.
 */
export function Logo({ className, showWordmark = true }: { className?: string; showWordmark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 select-none', className)}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="size-7 shrink-0"
        aria-hidden
      >
        <path
          d="M3.2 9.6 12 3l8.8 6.6v9.2a1.6 1.6 0 0 1-1.6 1.6H4.8a1.6 1.6 0 0 1-1.6-1.6V9.6Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <rect x="9" y="12.4" width="6" height="5" rx="1" fill="currentColor" />
      </svg>
      {showWordmark && (
        <span className="text-[1.0625rem] font-semibold tracking-[-0.03em]">MyPlace</span>
      )}
      <span className="sr-only">MyPlace — marketplace de espaços ociosos</span>
    </span>
  );
}
