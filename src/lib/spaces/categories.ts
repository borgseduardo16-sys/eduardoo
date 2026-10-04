import { SPACE_TYPES, type SpaceTypeKey } from './types';

/**
 * Categorias do MAPA — módulo puro (servidor e navegador).
 *
 * O marketplace tem 15 tipos de espaço; no mapa, 15 ícones diferentes viram
 * ruído. Aqui os tipos se agrupam em poucas categorias que a pessoa reconhece
 * de relance, cada uma com um ícone vetorial próprio (nome do ícone lucide —
 * quem desenha importa o componente). Todo tipo cai em exatamente uma
 * categoria: a lista abaixo é conferida por teste contra `SPACE_TYPES`, então
 * um tipo novo sem categoria não passa despercebido.
 */

export const MAP_CATEGORIES = [
  { key: 'garagem', label: 'Garagem e vaga', icon: 'Car', types: ['vaga_carro', 'vaga_moto', 'estacionamento', 'garagem'] },
  { key: 'armazenamento', label: 'Armazenamento', icon: 'Package', types: ['deposito'] },
  { key: 'loja', label: 'Loja', icon: 'Store', types: ['loja'] },
  { key: 'escritorio', label: 'Escritório e sala', icon: 'Building2', types: ['escritorio', 'sala'] },
  { key: 'galpao', label: 'Galpão', icon: 'Factory', types: ['galpao'] },
  { key: 'terreno', label: 'Terreno', icon: 'Trees', types: ['terreno'] },
  { key: 'eventos', label: 'Eventos e lazer', icon: 'PartyPopper', types: ['espaco_eventos', 'area_lazer'] },
  { key: 'oficina', label: 'Oficina', icon: 'Wrench', types: ['oficina'] },
  { key: 'outros', label: 'Outros', icon: 'Shapes', types: ['quarto', 'outro'] },
] as const satisfies readonly { key: string; label: string; icon: string; types: readonly SpaceTypeKey[] }[];

export type MapCategoryKey = (typeof MAP_CATEGORIES)[number]['key'];

export const MAP_CATEGORY_KEYS = MAP_CATEGORIES.map((c) => c.key) as readonly MapCategoryKey[];

const POR_TIPO = new Map<string, MapCategoryKey>(
  MAP_CATEGORIES.flatMap((c) => c.types.map((t) => [t, c.key] as const)),
);

/** Categoria de um tipo de espaço. Tipo desconhecido cai em "outros" — nunca some do mapa. */
export function categoryOfType(type: string): MapCategoryKey {
  return POR_TIPO.get(type) ?? 'outros';
}

export function categoryInfo(key: string): (typeof MAP_CATEGORIES)[number] {
  return MAP_CATEGORIES.find((c) => c.key === key) ?? MAP_CATEGORIES[MAP_CATEGORIES.length - 1]!;
}

/** Tipos de espaço de um conjunto de categorias (para o filtro do servidor). */
export function typesOfCategories(keys: readonly string[]): SpaceTypeKey[] {
  const out = new Set<SpaceTypeKey>();
  for (const c of MAP_CATEGORIES) {
    if (keys.includes(c.key)) for (const t of c.types) out.add(t);
  }
  return [...out];
}

/** Tipos que nenhuma categoria cobre — deve ser sempre vazio (usado pelo teste). */
export function typesWithoutCategory(): string[] {
  return SPACE_TYPES.filter((t) => !POR_TIPO.has(t));
}

/** "Lê" a lista de categorias de um parâmetro de URL (`garagem,loja`), ignorando o que não existe. */
export function parseCategoriesParam(value: string | null | undefined): MapCategoryKey[] {
  if (!value) return [];
  const pedidas = new Set(value.split(',').map((s) => s.trim()));
  return MAP_CATEGORY_KEYS.filter((k) => pedidas.has(k));
}
