'use client';

import { useEffect } from 'react';

/**
 * Avisos de estatística do navegador (Fase 23): só o id do anúncio e o tipo
 * do evento. Nada de identificador, cookie próprio ou dado da pessoa — o
 * servidor soma um contador do dia e pronto (ver src/lib/analytics/track.ts).
 */
function enviar(spaceId: string, evento: 'visualizacao' | 'compartilhamento') {
  const corpo = JSON.stringify({ spaceId, evento });
  try {
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      navigator.sendBeacon('/api/estatisticas', new Blob([corpo], { type: 'application/json' }));
      return;
    }
  } catch {
    // cai no fetch abaixo
  }
  fetch('/api/estatisticas', {
    method: 'POST',
    body: corpo,
    keepalive: true,
    headers: { 'content-type': 'application/json' },
  }).catch(() => {});
}

/** Conta uma visualização por anúncio por aba (sessionStorage evita recontar a cada recarga). */
export function ViewTracker({ spaceId }: { spaceId: string }) {
  useEffect(() => {
    const chave = `visto:${spaceId}`;
    try {
      if (sessionStorage.getItem(chave)) return;
      sessionStorage.setItem(chave, '1');
    } catch {
      // sem sessionStorage (modo privado restrito): o limite do servidor segura a recontagem
    }
    enviar(spaceId, 'visualizacao');
  }, [spaceId]);
  return null;
}

export function trackShare(spaceId: string) {
  enviar(spaceId, 'compartilhamento');
}
