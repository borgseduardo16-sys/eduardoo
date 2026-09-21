/**
 * Referencia geografica para expandir buscas por estado/regiao/Brasil inteiro
 * em varias consultas por cidade (a Places API responde por proximidade a um
 * texto de busca, nao existe um jeito de pedir "todo o Espirito Santo" numa
 * chamada so). Sao nomes de cidade/estado publicos e estaveis — nao e dado de
 * empresa, entao nao entra na regra de "nunca inventar" que vale para leads.
 */

export type BrazilianState = {
  uf: string;
  name: string;
  region: 'Norte' | 'Nordeste' | 'Centro-Oeste' | 'Sudeste' | 'Sul';
  /** Capital primeiro; demais cidades usadas para expandir a busca estadual. */
  cities: string[];
};

export const BRAZILIAN_STATES: BrazilianState[] = [
  { uf: 'AC', name: 'Acre', region: 'Norte', cities: ['Rio Branco', 'Cruzeiro do Sul'] },
  { uf: 'AL', name: 'Alagoas', region: 'Nordeste', cities: ['Maceió', 'Arapiraca'] },
  { uf: 'AP', name: 'Amapá', region: 'Norte', cities: ['Macapá', 'Santana'] },
  { uf: 'AM', name: 'Amazonas', region: 'Norte', cities: ['Manaus', 'Parintins'] },
  { uf: 'BA', name: 'Bahia', region: 'Nordeste', cities: ['Salvador', 'Feira de Santana', 'Vitória da Conquista', 'Ilhéus'] },
  { uf: 'CE', name: 'Ceará', region: 'Nordeste', cities: ['Fortaleza', 'Juazeiro do Norte', 'Sobral'] },
  { uf: 'DF', name: 'Distrito Federal', region: 'Centro-Oeste', cities: ['Brasília'] },
  { uf: 'ES', name: 'Espírito Santo', region: 'Sudeste', cities: ['Vitória', 'Vila Velha', 'Serra', 'Cariacica', 'Colatina', 'Linhares', 'Cachoeiro de Itapemirim'] },
  { uf: 'GO', name: 'Goiás', region: 'Centro-Oeste', cities: ['Goiânia', 'Aparecida de Goiânia', 'Anápolis'] },
  { uf: 'MA', name: 'Maranhão', region: 'Nordeste', cities: ['São Luís', 'Imperatriz'] },
  { uf: 'MT', name: 'Mato Grosso', region: 'Centro-Oeste', cities: ['Cuiabá', 'Várzea Grande', 'Rondonópolis'] },
  { uf: 'MS', name: 'Mato Grosso do Sul', region: 'Centro-Oeste', cities: ['Campo Grande', 'Dourados'] },
  { uf: 'MG', name: 'Minas Gerais', region: 'Sudeste', cities: ['Belo Horizonte', 'Uberlândia', 'Contagem', 'Juiz de Fora', 'Betim', 'Montes Claros'] },
  { uf: 'PA', name: 'Pará', region: 'Norte', cities: ['Belém', 'Ananindeua', 'Santarém'] },
  { uf: 'PB', name: 'Paraíba', region: 'Nordeste', cities: ['João Pessoa', 'Campina Grande'] },
  { uf: 'PR', name: 'Paraná', region: 'Sul', cities: ['Curitiba', 'Londrina', 'Maringá', 'Ponta Grossa'] },
  { uf: 'PE', name: 'Pernambuco', region: 'Nordeste', cities: ['Recife', 'Jaboatão dos Guararapes', 'Olinda', 'Caruaru'] },
  { uf: 'PI', name: 'Piauí', region: 'Nordeste', cities: ['Teresina', 'Parnaíba'] },
  { uf: 'RJ', name: 'Rio de Janeiro', region: 'Sudeste', cities: ['Rio de Janeiro', 'Niterói', 'Duque de Caxias', 'Nova Iguaçu', 'Petrópolis'] },
  { uf: 'RN', name: 'Rio Grande do Norte', region: 'Nordeste', cities: ['Natal', 'Mossoró'] },
  { uf: 'RS', name: 'Rio Grande do Sul', region: 'Sul', cities: ['Porto Alegre', 'Caxias do Sul', 'Pelotas', 'Canoas'] },
  { uf: 'RO', name: 'Rondônia', region: 'Norte', cities: ['Porto Velho', 'Ji-Paraná'] },
  { uf: 'RR', name: 'Roraima', region: 'Norte', cities: ['Boa Vista'] },
  { uf: 'SC', name: 'Santa Catarina', region: 'Sul', cities: ['Florianópolis', 'Joinville', 'Blumenau', 'Chapecó'] },
  { uf: 'SP', name: 'São Paulo', region: 'Sudeste', cities: ['São Paulo', 'Guarulhos', 'Campinas', 'São Bernardo do Campo', 'Santo André', 'Osasco', 'Ribeirão Preto', 'Sorocaba'] },
  { uf: 'SE', name: 'Sergipe', region: 'Nordeste', cities: ['Aracaju', 'Nossa Senhora do Socorro'] },
  { uf: 'TO', name: 'Tocantins', region: 'Norte', cities: ['Palmas', 'Araguaína'] },
];

export function findStateByName(query: string): BrazilianState | undefined {
  const q = query.trim().toLowerCase();
  return BRAZILIAN_STATES.find(
    (s) => s.name.toLowerCase() === q || s.uf.toLowerCase() === q,
  );
}

export function citiesForRegion(region: BrazilianState['region']): string[] {
  return BRAZILIAN_STATES.filter((s) => s.region === region).flatMap((s) => s.cities);
}

/** Amostra de cidades para "Brasil inteiro" — capitais + principais polos. */
export function citiesForCountry(): string[] {
  return BRAZILIAN_STATES.flatMap((s) => s.cities);
}

export const PREDEFINED_NICHES = [
  'Clínicas de estética',
  'Salões de beleza',
  'Barbearias',
  'Clínicas odontológicas',
  'Clínicas médicas',
  'Psicólogos',
  'Nutricionistas',
  'Academias',
  'Personal trainers',
  'Restaurantes',
  'Pizzarias',
  'Hamburguerias',
  'Padarias',
  'Confeitarias',
  'Escritórios de advocacia',
  'Contadores',
  'Arquitetos',
  'Engenheiros',
  'Imobiliárias',
  'Oficinas mecânicas',
  'Auto centers',
  'Lojas',
  'Pet shops',
  'Veterinários',
  'Fotógrafos',
  'Profissionais autônomos',
  'Empresas de serviços',
] as const;

export const REVIEW_COUNT_PRESETS = [10, 25, 50, 70, 90, 100, 200, 500, 1000] as const;
export const RATING_PRESETS = [3.0, 3.5, 4.0, 4.5, 4.8] as const;
export const QUANTITY_PRESETS = [10, 25, 50, 100, 250, 500, 1000] as const;
