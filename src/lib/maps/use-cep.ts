'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CEP_MESSAGES, onlyDigits, type CepFailure, type CepResult } from './cep';

export type CepStatus = 'idle' | 'buscando' | 'ok' | 'erro';

/** Espera depois da ultima tecla antes de consultar. */
const DEBOUNCE_MS = 600;

/**
 * Consulta de CEP a partir do navegador, batendo na NOSSA rota (`/api/cep`) e
 * nao no servico externo.
 *
 * Tres cuidados que existem por causa da cota dos servicos gratuitos:
 *
 *  - So consulta com 8 digitos. Digitar "297" nunca gera requisicao.
 *  - Espera `DEBOUNCE_MS` depois da ultima tecla. Colar um CEP inteiro dispara
 *    uma consulta, nao oito.
 *  - Cancela a consulta anterior quando o CEP muda, e ignora resposta que
 *    chegou depois de o campo ter mudado — senao um endereco antigo poderia
 *    sobrescrever o que a pessoa acabou de digitar.
 *
 * O ultimo CEP consultado fica guardado para nao repetir a mesma consulta
 * quando a pessoa sai e volta ao campo sem mudar nada.
 */
export function useCepLookup(onFound: (r: CepResult) => void) {
  const [status, setStatus] = useState<CepStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const ultimoConsultado = useRef<string | null>(null);
  const onFoundRef = useRef(onFound);

  // Atualizar ref durante o render e proibido pela regra react-hooks/refs.
  useEffect(() => {
    onFoundRef.current = onFound;
  }, [onFound]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      abort.current?.abort();
    };
  }, []);

  const consultar = useCallback(async (raw: string) => {
    const digits = onlyDigits(raw);
    if (digits.length !== 8) {
      setStatus('erro');
      setMessage(CEP_MESSAGES.formato);
      return;
    }

    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;

    ultimoConsultado.current = digits;
    setStatus('buscando');
    setMessage(null);

    try {
      const res = await fetch(`/api/cep/${digits}`, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      const data = (await res.json()) as
        | ({ ok: true } & CepResult)
        | { ok: false; reason: CepFailure; message?: string };

      // O campo mudou enquanto a resposta vinha: descarta.
      if (ultimoConsultado.current !== digits) return;

      if (!data.ok) {
        setStatus('erro');
        setMessage(data.message ?? CEP_MESSAGES[data.reason] ?? CEP_MESSAGES.indisponivel);
        return;
      }

      setStatus('ok');
      setMessage(null);
      onFoundRef.current(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setStatus('erro');
      setMessage(CEP_MESSAGES.indisponivel);
    }
  }, []);

  /** Chame no onChange do campo. Decide sozinho se e hora de consultar. */
  const aoDigitar = useCallback(
    (raw: string) => {
      const digits = onlyDigits(raw);

      if (timer.current) clearTimeout(timer.current);

      if (digits.length < 8) {
        abort.current?.abort();
        ultimoConsultado.current = null;
        setStatus('idle');
        setMessage(null);
        return;
      }

      if (digits === ultimoConsultado.current && status === 'ok') return;

      timer.current = setTimeout(() => void consultar(digits), DEBOUNCE_MS);
    },
    [consultar, status],
  );

  /** Botao "Buscar": consulta na hora, sem esperar o debounce. */
  const buscarAgora = useCallback(
    (raw: string) => {
      if (timer.current) clearTimeout(timer.current);
      ultimoConsultado.current = null;
      return consultar(raw);
    },
    [consultar],
  );

  return { status, message, aoDigitar, buscarAgora };
}
