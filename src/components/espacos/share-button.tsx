'use client';

import { useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Compartilhar o anúncio.
 *
 * No celular, usa o mecanismo NATIVO de compartilhamento do sistema
 * (`navigator.share`) — é ele que abre WhatsApp, mensagens etc. Onde não
 * existe (a maioria dos desktops), cai para copiar o link, com confirmação
 * visual de que copiou. Nenhum dos dois é fingido: um chama a API real do
 * navegador, o outro escreve na área de transferência de verdade.
 */
export function ShareButton({ title, url }: { title: string; url: string }) {
  const [copiado, setCopiado] = useState(false);

  async function compartilhar() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Pessoa cancelou o painel de compartilhar — não é erro, não faz nada.
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissão de clipboard: seleciona o texto pra pessoa copiar na mao.
      window.prompt('Copie o link:', url);
    }
  }

  return (
    <Button type="button" variant="secondary" onClick={compartilhar} data-testid="botao-compartilhar">
      {copiado ? <Check className="size-4" aria-hidden /> : <Share2 className="size-4" aria-hidden />}
      {copiado ? 'Link copiado' : 'Compartilhar'}
    </Button>
  );
}
