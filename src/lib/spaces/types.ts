/**
 * Catalogo dos tipos de espaco.
 *
 * Cada tipo declara o que faz sentido perguntar sobre ele. E o que faz o
 * formulario nao perguntar "entrada para caminhao" sobre uma vaga de moto,
 * nem "cabe carro?" sobre uma sala comercial.
 *
 * Modulo puro: roda no navegador (para montar o formulario) e no servidor
 * (para validar o que voltou). Duas listas divergentes seriam a origem
 * garantida de um bug em que a pessoa responde algo que a validacao recusa.
 */

export const SPACE_TYPES = [
  'vaga_carro',
  'vaga_moto',
  'estacionamento',
  'garagem',
  'deposito',
  'galpao',
  'sala',
  'escritorio',
  'loja',
  'oficina',
  'terreno',
  'espaco_eventos',
  'area_lazer',
  'quarto',
  'outro',
] as const;

export type SpaceTypeKey = (typeof SPACE_TYPES)[number];

/** Campos numericos que so aparecem em alguns tipos. */
export type MeasurementField = 'size_m2' | 'ceiling_height_m';

type SpaceTypeConfig = {
  label: string;
  /** Nome do icone lucide-react. Sem emoji na interface final. */
  icon: string;
  /** Uma linha, para a pessoa reconhecer o tipo sem pensar. */
  hint: string;
  /** Categorias de caracteristica que fazem sentido aqui (ver tabela `features`). */
  featureCategories: readonly ('estrutura' | 'seguranca' | 'acesso' | 'veiculo')[];
  /** Medidas perguntadas, e quais sao obrigatorias. */
  measurements: readonly MeasurementField[];
  requiredMeasurements: readonly MeasurementField[];
  /** Exemplo de titulo, mostrado como placeholder — nunca preenchido sozinho. */
  titleExample: string;
  /** Faixa de preco tipica em centavos, so para orientar. Nao trava nada. */
  priceHintCents?: readonly [number, number];
};

export const SPACE_TYPE_CONFIG = {
  vaga_carro: {
    label: 'Vaga de carro',
    icon: 'Car',
    hint: 'Uma vaga demarcada para um veículo',
    featureCategories: ['acesso', 'seguranca', 'estrutura', 'veiculo'],
    measurements: [],
    requiredMeasurements: [],
    titleExample: 'Vaga coberta em prédio no centro',
    priceHintCents: [8000, 35000],
  },
  vaga_moto: {
    label: 'Vaga de moto',
    icon: 'Bike',
    hint: 'Espaço para uma ou mais motos',
    featureCategories: ['acesso', 'seguranca', 'estrutura'],
    measurements: [],
    requiredMeasurements: [],
    titleExample: 'Vaga de moto em garagem fechada',
    priceHintCents: [5000, 20000],
  },
  estacionamento: {
    label: 'Estacionamento',
    icon: 'SquareParking',
    hint: 'Pátio ou prédio com várias vagas',
    featureCategories: ['acesso', 'seguranca', 'estrutura', 'veiculo'],
    measurements: [],
    requiredMeasurements: [],
    titleExample: 'Estacionamento coberto no centro, vagas por hora e mensais',
    priceHintCents: [8000, 35000],
  },
  garagem: {
    label: 'Garagem',
    icon: 'Warehouse',
    hint: 'Garagem fechada, para veículo ou armazenamento',
    featureCategories: ['acesso', 'seguranca', 'estrutura', 'veiculo'],
    measurements: ['size_m2', 'ceiling_height_m'],
    requiredMeasurements: ['size_m2'],
    titleExample: 'Garagem coberta perto do centro',
    priceHintCents: [10000, 50000],
  },
  deposito: {
    label: 'Depósito',
    icon: 'Package',
    hint: 'Espaço fechado para guardar coisas',
    featureCategories: ['estrutura', 'seguranca', 'acesso', 'veiculo'],
    measurements: ['size_m2', 'ceiling_height_m'],
    requiredMeasurements: ['size_m2'],
    titleExample: 'Depósito seco e ventilado, 20 m²',
    priceHintCents: [10000, 80000],
  },
  galpao: {
    label: 'Galpão',
    icon: 'Factory',
    hint: 'Área ampla, geralmente com acesso para caminhão',
    featureCategories: ['estrutura', 'acesso', 'seguranca', 'veiculo'],
    measurements: ['size_m2', 'ceiling_height_m'],
    requiredMeasurements: ['size_m2', 'ceiling_height_m'],
    titleExample: 'Galpão 200 m² com entrada para caminhão',
    priceHintCents: [80000, 1500000],
  },
  sala: {
    label: 'Sala',
    icon: 'DoorOpen',
    hint: 'Sala em imóvel comercial ou residencial',
    featureCategories: ['estrutura', 'acesso', 'seguranca'],
    measurements: ['size_m2'],
    requiredMeasurements: ['size_m2'],
    titleExample: 'Sala 25 m² em prédio comercial',
    priceHintCents: [30000, 300000],
  },
  escritorio: {
    label: 'Escritório',
    icon: 'Building2',
    hint: 'Espaço preparado para trabalho',
    featureCategories: ['estrutura', 'acesso', 'seguranca'],
    measurements: ['size_m2'],
    requiredMeasurements: ['size_m2'],
    titleExample: 'Escritório mobiliado para 4 pessoas',
    priceHintCents: [40000, 400000],
  },
  loja: {
    label: 'Loja',
    icon: 'Store',
    hint: 'Ponto comercial com fachada',
    featureCategories: ['estrutura', 'acesso', 'seguranca', 'veiculo'],
    measurements: ['size_m2'],
    requiredMeasurements: ['size_m2'],
    titleExample: 'Loja de rua 40 m² com vitrine',
    priceHintCents: [80000, 800000],
  },
  oficina: {
    label: 'Oficina',
    icon: 'Wrench',
    hint: 'Box ou galpão para serviços e reparos',
    featureCategories: ['estrutura', 'acesso', 'seguranca', 'veiculo'],
    measurements: ['size_m2', 'ceiling_height_m'],
    requiredMeasurements: ['size_m2'],
    titleExample: 'Box de oficina com elevador automotivo',
    priceHintCents: [50000, 500000],
  },
  terreno: {
    label: 'Terreno',
    icon: 'Trees',
    hint: 'Área aberta, murada ou não',
    featureCategories: ['estrutura', 'acesso', 'seguranca', 'veiculo'],
    measurements: ['size_m2'],
    requiredMeasurements: ['size_m2'],
    titleExample: 'Terreno murado 300 m² para estacionar',
    priceHintCents: [20000, 500000],
  },
  espaco_eventos: {
    label: 'Espaço para eventos',
    icon: 'PartyPopper',
    hint: 'Salão ou área para festas e encontros',
    featureCategories: ['estrutura', 'acesso', 'seguranca'],
    measurements: ['size_m2'],
    requiredMeasurements: ['size_m2'],
    titleExample: 'Salão de festas para 80 pessoas',
  },
  area_lazer: {
    label: 'Área de lazer',
    icon: 'TreePalm',
    hint: 'Piscina, churrasqueira, quadra ou área ao ar livre',
    featureCategories: ['estrutura', 'acesso', 'seguranca'],
    measurements: ['size_m2'],
    requiredMeasurements: [],
    titleExample: 'Área com piscina e churrasqueira',
  },
  quarto: {
    label: 'Quarto',
    icon: 'BedDouble',
    hint: 'Cômodo vazio para armazenamento',
    featureCategories: ['estrutura', 'seguranca', 'acesso'],
    measurements: ['size_m2'],
    requiredMeasurements: ['size_m2'],
    titleExample: 'Quarto vazio para guardar móveis',
    priceHintCents: [15000, 80000],
  },
  outro: {
    label: 'Outro',
    icon: 'Shapes',
    hint: 'Não se encaixa nas opções acima',
    featureCategories: ['estrutura', 'seguranca', 'acesso', 'veiculo'],
    measurements: ['size_m2', 'ceiling_height_m'],
    requiredMeasurements: [],
    titleExample: 'Descreva seu espaço no título',
  },
} as const satisfies Record<SpaceTypeKey, SpaceTypeConfig>;

/**
 * Faixa de preco tipica, quando existe para o tipo.
 *
 * Acessor em vez de leitura direta porque nem todo tipo tem faixa — "Outro"
 * nao tem, e ler a propriedade direto quebraria a tipagem da uniao.
 */
export function priceHintFor(type: SpaceTypeKey): readonly [number, number] | null {
  const config = SPACE_TYPE_CONFIG[type] as { priceHintCents?: readonly [number, number] };
  return config.priceHintCents ?? null;
}

export function spaceTypeLabel(type: SpaceTypeKey): string {
  return SPACE_TYPE_CONFIG[type].label;
}

/** Plural para títulos ("Garagens em Colatina"). Somar "s" dava "Garagems" e "Galpãos". */
const PLURAL: Record<SpaceTypeKey, string> = {
  vaga_carro: 'Vagas de carro',
  vaga_moto: 'Vagas de moto',
  estacionamento: 'Estacionamentos',
  garagem: 'Garagens',
  deposito: 'Depósitos',
  galpao: 'Galpões',
  sala: 'Salas',
  escritorio: 'Escritórios',
  loja: 'Lojas',
  oficina: 'Oficinas',
  terreno: 'Terrenos',
  espaco_eventos: 'Espaços para eventos',
  area_lazer: 'Áreas de lazer',
  quarto: 'Quartos',
  outro: 'Outros espaços',
};

export function spaceTypePlural(type: SpaceTypeKey): string {
  return PLURAL[type];
}

/**
 * Como se chama UMA unidade alugável deste tipo de anúncio (Parte 12):
 * "10 vagas · 7 disponíveis · 3 ocupadas", "4 boxes · 4 disponíveis".
 * `feminino` concorda o adjetivo ("ocupadas"/"ocupados").
 */
export type UnitNoun = { singular: string; plural: string; feminino: boolean };

const UNIT_NOUNS: Record<SpaceTypeKey, UnitNoun> = {
  vaga_carro: { singular: 'vaga', plural: 'vagas', feminino: true },
  vaga_moto: { singular: 'vaga', plural: 'vagas', feminino: true },
  estacionamento: { singular: 'vaga', plural: 'vagas', feminino: true },
  garagem: { singular: 'vaga', plural: 'vagas', feminino: true },
  deposito: { singular: 'box', plural: 'boxes', feminino: false },
  galpao: { singular: 'módulo', plural: 'módulos', feminino: false },
  sala: { singular: 'sala', plural: 'salas', feminino: true },
  escritorio: { singular: 'sala', plural: 'salas', feminino: true },
  loja: { singular: 'loja', plural: 'lojas', feminino: true },
  oficina: { singular: 'box', plural: 'boxes', feminino: false },
  terreno: { singular: 'área', plural: 'áreas', feminino: true },
  espaco_eventos: { singular: 'espaço', plural: 'espaços', feminino: false },
  area_lazer: { singular: 'espaço', plural: 'espaços', feminino: false },
  quarto: { singular: 'quarto', plural: 'quartos', feminino: false },
  outro: { singular: 'unidade', plural: 'unidades', feminino: true },
};

export function unitNounFor(type: string): UnitNoun {
  return UNIT_NOUNS[type as SpaceTypeKey] ?? UNIT_NOUNS.outro;
}

/**
 * Busca de categoria (a lupa da primeira etapa): pelo nome, pela descrição
 * e por palavras que as pessoas usam ("salão", "piscina", "mecânica"). Sem
 * acento, sem maiúscula. "Outro" aparece sempre — é a saída para o que não
 * se encaixa em nada.
 */
const TYPE_SEARCH_TERMS: Record<SpaceTypeKey, readonly string[]> = {
  vaga_carro: ['carro', 'automóvel', 'estacionar'],
  vaga_moto: ['moto', 'motocicleta', 'bicicleta', 'bike'],
  estacionamento: ['estacionamento', 'pátio', 'parking', 'vagas', 'rotativo', 'mensalista'],
  garagem: ['garagem', 'carro'],
  deposito: ['depósito', 'guardar', 'armazenar', 'self storage', 'guarda-móveis', 'box'],
  galpao: ['galpão', 'armazém', 'barracão', 'logística'],
  sala: ['sala', 'consultório', 'atendimento'],
  escritorio: ['escritório', 'coworking', 'trabalho'],
  loja: ['loja', 'ponto comercial', 'comércio', 'vitrine'],
  oficina: ['oficina', 'mecânica', 'funilaria', 'reparo', 'conserto'],
  terreno: ['terreno', 'lote', 'área aberta'],
  espaco_eventos: ['evento', 'festa', 'salão', 'aniversário', 'casamento', 'reunião'],
  area_lazer: ['lazer', 'piscina', 'churrasqueira', 'quadra', 'chácara', 'sítio'],
  quarto: ['quarto', 'cômodo'],
  outro: ['outro'],
};

function semAcento(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export function searchSpaceTypes(query: string): SpaceTypeKey[] {
  const q = semAcento(query);
  if (!q) return [...SPACE_TYPES];
  const achados = SPACE_TYPES.filter((t) => {
    const c = SPACE_TYPE_CONFIG[t];
    return [c.label, c.hint, ...TYPE_SEARCH_TERMS[t]].some((termo) => semAcento(termo).includes(q));
  });
  return achados.includes('outro') ? achados : [...achados, 'outro'];
}

/** Medida obrigatoria para este tipo? Usado na validacao do servidor. */
export function requiresMeasurement(type: SpaceTypeKey, field: MeasurementField): boolean {
  return (SPACE_TYPE_CONFIG[type].requiredMeasurements as readonly string[]).includes(field);
}

export function asksMeasurement(type: SpaceTypeKey, field: MeasurementField): boolean {
  return (SPACE_TYPE_CONFIG[type].measurements as readonly string[]).includes(field);
}

/** Lista para montar a grade de escolha na primeira etapa. */
export function spaceTypeOptions() {
  return SPACE_TYPES.map((value) => ({
    value,
    label: SPACE_TYPE_CONFIG[value].label,
    icon: SPACE_TYPE_CONFIG[value].icon,
    hint: SPACE_TYPE_CONFIG[value].hint,
  }));
}

/** Estados brasileiros, para o seletor e para validar a sigla. */
export const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
  'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
] as const;

export type UF = (typeof UFS)[number];
