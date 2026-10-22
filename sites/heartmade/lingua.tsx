'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { TEXTOS, type Lingua } from './textos';

/*
 * Língua do site (PT/EN). O HTML sai em português; no navegador, a escolha guardada ou, na primeira visita, a língua
 * do aparelho (qualquer coisa que não comece por "pt" → inglês) decide. O botão do cabeçalho troca e guarda.
 */
const CHAVE = 'heartmade-lingua';
const Ctx = createContext<{ l: Lingua; trocar: () => void }>({ l: 'pt', trocar: () => {} });

export function LinguaProvider({ children }: { children: React.ReactNode }) {
  const [l, setL] = useState<Lingua>('pt');
  useEffect(() => {
    const id = window.setTimeout(() => {
      let salva: string | null = null;
      try { salva = localStorage.getItem(CHAVE); } catch { /* sem armazenamento */ }
      if (salva === 'pt' || salva === 'en') setL(salva);
      else if (!(navigator.language || 'pt').toLowerCase().startsWith('pt')) setL('en');
    }, 0);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => { document.documentElement.lang = l === 'pt' ? 'pt-PT' : 'en'; }, [l]);
  const trocar = useCallback(() => {
    setL((x) => {
      const n = x === 'pt' ? 'en' : 'pt';
      try { localStorage.setItem(CHAVE, n); } catch { /* ignora */ }
      return n;
    });
  }, []);
  return <Ctx.Provider value={{ l, trocar }}>{children}</Ctx.Provider>;
}

export const useLingua = () => useContext(Ctx);
export const useT = () => TEXTOS[useContext(Ctx).l];
