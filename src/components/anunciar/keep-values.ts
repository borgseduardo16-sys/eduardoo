import type { FormEvent } from 'react';

/**
 * O React 19 limpa o <form> depois de toda action, tenha ela salvado ou não.
 * Nas etapas do anúncio, quando o servidor recusava a etapa, isso apagava o
 * que a pessoa já tinha digitado (número, complemento, metragem, regras…) e
 * o estado voltava para "UF". Cancelar o reset mantém tudo como estava;
 * quando a etapa salva, a página avança para a próxima de qualquer jeito.
 */
export function keepTypedValues(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
}
