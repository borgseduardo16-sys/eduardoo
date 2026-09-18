import { SPACE_TYPES, type SpaceTypeKey } from './types';

/**
 * Palavras que as pessoas digitam e o tipo de espaco que elas querem dizer.
 *
 * Busca por texto (Parte 3, secao 11): "nao e necessario criar uma IA
 * complexa nesta etapa... primeiro faca uma busca confiavel e previsivel."
 * Isto e exatamente isso — um dicionario fixo, sem chamada de rede, sem
 * modelo, testavel com um `expect` simples. A arquitetura fica preparada
 * para trocar por algo mais esperto depois SEM mudar quem chama esta funcao:
 * ela sempre devolve um `SpaceTypeKey | null`.
 */
const SINONIMOS: Record<SpaceTypeKey, readonly string[]> = {
  vaga_carro: ['vaga', 'vaga de carro', 'estacionamento', 'carro', 'auto'],
  vaga_moto: ['vaga de moto', 'moto', 'motocicleta', 'motoca'],
  garagem: ['garagem'],
  deposito: ['deposito', 'armazenamento', 'guardar', 'self storage', 'guarda-moveis', 'guarda moveis'],
  galpao: ['galpao', 'galpão'],
  sala: ['sala', 'sala comercial'],
  escritorio: ['escritorio', 'escritório', 'coworking'],
  loja: ['loja', 'ponto comercial'],
  terreno: ['terreno', 'lote'],
  quarto: ['quarto', 'comodo', 'cômodo'],
  outro: [],
};

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acento
    .trim();
}

/**
 * Tenta reconhecer um tipo de espaco dentro de um texto livre.
 * Devolve o PRIMEIRO tipo cujo sinonimo aparece no texto — sem ranquear,
 * sem pontuar: previsivel de proposito.
 */
export function matchSpaceTypeKeyword(texto: string): SpaceTypeKey | null {
  const alvo = normalizar(texto);
  if (!alvo) return null;

  for (const tipo of SPACE_TYPES) {
    for (const sinonimo of SINONIMOS[tipo]) {
      if (alvo.includes(normalizar(sinonimo))) return tipo;
    }
  }
  return null;
}
