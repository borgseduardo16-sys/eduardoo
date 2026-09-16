'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Conjunto de strings guardado no `localStorage` do navegador.
 *
 * Usa `useSyncExternalStore` em vez de `useEffect` + `setState` porque
 * `localStorage` e exatamente o que essa API existe para ler: estado externo,
 * mutavel, fora do React. Ler por efeito causa render em cascata (o React 19
 * inclusive avisa sobre isso) e ainda perde a sincronizacao entre abas.
 *
 * Detalhes que fazem isso funcionar:
 *
 * - `getSnapshot` PRECISA devolver a mesma referencia enquanto o valor nao
 *   muda, senao o React entra em loop infinito de render. Dai o cache por
 *   chave, invalidado comparando o texto cru.
 * - `getServerSnapshot` devolve vazio: no servidor nao existe `localStorage`,
 *   e devolver vazio e o que evita divergencia de hidratacao.
 * - Todo acesso vai em try/catch: em aba anonima, ou com dados de site
 *   bloqueados, `localStorage` lanca em vez de devolver null.
 */

const EMPTY: ReadonlySet<string> = new Set<string>();

/** Ouvintes por chave, para atualizar a propria aba (o evento `storage` so avisa as outras). */
const listeners = new Map<string, Set<() => void>>();

/** Cache do snapshot, para manter a identidade de referencia entre renders. */
const cache = new Map<string, { raw: string | null; value: ReadonlySet<string> }>();

function read(key: string): ReadonlySet<string> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return EMPTY;
  }

  const cached = cache.get(key);
  if (cached && cached.raw === raw) return cached.value;

  let value: ReadonlySet<string> = EMPTY;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) value = new Set(parsed.filter((v): v is string => typeof v === 'string'));
    } catch {
      value = EMPTY;
    }
  }

  cache.set(key, { raw, value });
  return value;
}

function notify(key: string) {
  for (const fn of listeners.get(key) ?? []) fn();
}

export function useLocalSet(key: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      let forKey = listeners.get(key);
      if (!forKey) {
        forKey = new Set();
        listeners.set(key, forKey);
      }
      forKey.add(onChange);

      // Outra aba mexeu na mesma chave.
      const onStorage = (e: StorageEvent) => {
        if (e.key === key) {
          cache.delete(key);
          onChange();
        }
      };
      window.addEventListener('storage', onStorage);

      return () => {
        forKey.delete(onChange);
        if (forKey.size === 0) listeners.delete(key);
        window.removeEventListener('storage', onStorage);
      };
    },
    [key],
  );

  const getSnapshot = useCallback(() => read(key), [key]);
  const getServerSnapshot = useCallback(() => EMPTY, []);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(
    (item: string) => {
      const next = new Set(read(key));
      if (next.has(item)) next.delete(item);
      else next.add(item);

      try {
        localStorage.setItem(key, JSON.stringify([...next]));
      } catch {
        // Sem armazenamento: a marcacao simplesmente nao persiste.
      }
      cache.delete(key);
      notify(key);
    },
    [key],
  );

  return { value, toggle };
}
