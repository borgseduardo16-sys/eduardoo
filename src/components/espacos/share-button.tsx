'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Check, Copy, MessageCircle, Share2, Upload } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { trackShare } from '@/components/analytics/track';
import { cn } from '@/lib/utils';

/**
 * Compartilhar o anúncio (Fase 23): WhatsApp, copiar link e, quando o
 * aparelho oferece, o compartilhamento nativo do sistema ("Mais opções").
 *
 * Nada é fingido: o WhatsApp abre pelo link oficial `wa.me` com o texto
 * pronto; copiar escreve na área de transferência de verdade (e diz quando
 * não conseguiu); o nativo só aparece onde `navigator.share` existe.
 * O link é sempre a URL pública e estável do anúncio — sem endereço, sem
 * dado de quem compartilha. Cada compartilhamento feito vira só +1 no
 * contador do dia do anúncio (o próprio dono não conta).
 */
const nadaParaAssinar = () => () => {};

export function ShareButton({
  title,
  url,
  spaceId,
  className,
}: {
  title: string;
  url: string;
  spaceId: string;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  // Só o navegador sabe se existe compartilhamento nativo; no servidor é
  // sempre "não" (mesmo valor na hidratação, sem divergir).
  const temNativo = useSyncExternalStore(
    nadaParaAssinar,
    () => typeof navigator.share === 'function',
    () => false,
  );
  const raiz = useRef<HTMLDivElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const idPainel = useId();

  useEffect(() => {
    if (!aberto) return;
    raiz.current?.querySelector<HTMLElement>('[data-item-compartilhar]')?.focus();
    const fora = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAberto(false);
        gatilho.current?.focus();
      }
    };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      trackShare(spaceId);
      setCopiado(true);
      setAberto(false);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissão de área de transferência: mostra o link para copiar à mão.
      setAberto(false);
      window.prompt('Copie o link:', url);
    }
  }

  async function nativo() {
    setAberto(false);
    try {
      await navigator.share({ title, url });
      trackShare(spaceId);
    } catch {
      // Cancelou o painel do sistema — não é erro e não conta.
    }
  }

  const textoWhatsApp = `${title} — ${url}`;
  const item =
    'flex w-full items-center gap-3 h-11 px-3 rounded-[0.5rem] text-left text-[0.9375rem] hover:bg-[var(--surface-sunken)] focus-visible:bg-[var(--surface-sunken)] outline-none';

  return (
    <div ref={raiz} className="relative">
      <button
        ref={gatilho}
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-controls={idPainel}
        data-testid="botao-compartilhar"
        className={cn(buttonVariants({ variant: 'secondary' }), className)}
      >
        {copiado ? <Check className="size-4" aria-hidden /> : <Share2 className="size-4" aria-hidden />}
        {copiado ? 'Link copiado' : 'Compartilhar'}
      </button>

      <div
        id={idPainel}
        hidden={!aberto}
        className="absolute right-0 top-full mt-2 z-30 w-56 rounded-[var(--radius-field)] border bg-[var(--surface-raised)] p-1 shadow-sm"
      >
        <ul aria-label="Compartilhar anúncio">
          <li>
            <a
              data-item-compartilhar
              href={`https://wa.me/?text=${encodeURIComponent(textoWhatsApp)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                trackShare(spaceId);
                setAberto(false);
              }}
              className={item}
            >
              <MessageCircle className="size-4 text-[var(--content-muted)]" aria-hidden />
              WhatsApp
            </a>
          </li>
          <li>
            <button type="button" onClick={copiar} className={item}>
              <Copy className="size-4 text-[var(--content-muted)]" aria-hidden />
              Copiar link
            </button>
          </li>
          {temNativo && (
            <li>
              <button type="button" onClick={nativo} className={item}>
                <Upload className="size-4 text-[var(--content-muted)]" aria-hidden />
                Mais opções
              </button>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
