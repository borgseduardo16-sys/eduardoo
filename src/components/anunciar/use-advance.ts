'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Avança para a próxima etapa quando a atual termina de salvar.
 *
 * Fica em efeito, e não no corpo do componente: navegar durante o render é
 * efeito colateral em fase de render, o que o React pode repetir ou descartar.
 */
export function useAdvanceOnSave(saved: boolean | undefined, href: string) {
  const router = useRouter();

  useEffect(() => {
    if (saved) router.push(href);
  }, [saved, href, router]);
}
