import { unitNounFor } from './types';

/**
 * Textos da quantidade de um anúncio — módulo puro. O proprietário oferece N
 * unidades (uma garagem = 1; um estacionamento = 80 vagas); cada locação que
 * ocupa consome uma. Nada de unidade individual ("A1", "B17"): só a conta.
 */

/** "3 de 10 vagas disponíveis", "1 de 10 vagas disponível", "Nenhuma vaga disponível". Anúncio de uma só unidade: "Disponível" / "Já alugado". */
export function availabilityText(type: string, available: number, offered: number): string {
  const n = unitNounFor(type);
  if (offered <= 1) return available > 0 ? 'Disponível' : 'Já alugado';
  if (available <= 0) return `Nenhuma ${n.singular} disponível`.replace('Nenhuma', n.feminino ? 'Nenhuma' : 'Nenhum');
  return `${available} de ${offered} ${n.plural} ${available === 1 ? 'disponível' : 'disponíveis'}`;
}

/** Selo curto para cartões: "3 vagas livres" / "Última vaga" / "Lotado". `null` para anúncio de uma unidade só e livre. */
export function availabilityBadge(type: string, available: number, offered: number): string | null {
  const n = unitNounFor(type);
  if (available <= 0) return 'Lotado';
  if (offered <= 1) return null;
  if (available === 1) return n.feminino ? 'Última disponível' : 'Último disponível';
  return `${available} ${n.plural} livres`;
}

/** "Este local tem 100 vagas; 80 são oferecidas aqui." — só quando o total do local é maior que o oferecido. */
export function totalPlaceText(type: string, offered: number, total: number | null): string | null {
  if (total == null || total <= offered) return null;
  const n = unitNounFor(type);
  const oferecidas = offered === 1 ? (n.feminino ? 'é oferecida' : 'é oferecido') : (n.feminino ? 'são oferecidas' : 'são oferecidos');
  return `Este local tem ${total} ${n.plural}; ${offered} ${oferecidas} aqui.`;
}
