import { z } from 'zod';
import { SPACE_TYPES, UFS, requiresMeasurement, type SpaceTypeKey } from './types';

/**
 * Validacao do formulario de anuncio, etapa por etapa.
 *
 * Os mesmos schemas valem no navegador (feedback imediato) e no servidor
 * (barreira real). O cliente e conveniencia; quem decide e o servidor — e,
 * no caso de preco e completude, o proprio banco.
 *
 * Cada etapa valida SO o que ela pede. Assim da para salvar rascunho a
 * qualquer momento sem exigir campo de etapa futura. A validacao do conjunto
 * completo acontece uma vez so, na publicacao (`publishSchema`).
 */

// ---------------------------------------------------------------------------
// Etapa 1 — Tipo
// ---------------------------------------------------------------------------

export const typeStepSchema = z.object({
  type: z.enum(SPACE_TYPES, { error: 'Escolha o tipo de espaço.' }),
});

// ---------------------------------------------------------------------------
// Etapa 2 — Localizacao
// ---------------------------------------------------------------------------

/** CEP: aceita com ou sem hifen, guarda so os digitos. */
export const cepSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length === 8, 'CEP precisa ter 8 dígitos.');

export const locationStepSchema = z.object({
  postalCode: cepSchema.optional().or(z.literal('')),
  state: z.enum(UFS, { error: 'Escolha o estado.' }),
  city: z.string().trim().min(2, 'Informe a cidade.').max(120),
  district: z.string().trim().min(2, 'Informe o bairro.').max(120),
  street: z.string().trim().min(3, 'Informe a rua.').max(200),
  number: z.string().trim().min(1, 'Informe o número.').max(20),
  complement: z.string().trim().max(120).optional().or(z.literal('')),
  /**
   * Coordenada exata. Vem do GPS do navegador ou do pin no mapa.
   *
   * Obrigatoria: sem ela o anuncio nao aparece em busca por distancia, que e
   * a principal forma de alguem encontrar o espaco. Publicar sem coordenada
   * seria publicar um anuncio invisivel.
   */
  lat: z.coerce
    .number({ error: 'Marque a localização no mapa.' })
    .min(-33.75, 'Latitude fora do Brasil.')
    .max(5.27, 'Latitude fora do Brasil.'),
  lng: z.coerce
    .number({ error: 'Marque a localização no mapa.' })
    .min(-73.99, 'Longitude fora do Brasil.')
    .max(-34.79, 'Longitude fora do Brasil.'),
});

// ---------------------------------------------------------------------------
// Etapa 3 — Caracteristicas
// ---------------------------------------------------------------------------

/**
 * Metragem. Recusa o que nao faz sentido fisico em vez de aceitar e gerar um
 * anuncio absurdo: 0 m², numero negativo, ou 90 mil m² (9 hectares) sao quase
 * sempre erro de digitacao.
 */
const sizeSchema = z.coerce
  .number({ error: 'Informe um número.' })
  .positive('A metragem precisa ser maior que zero.')
  .max(90_000, 'Metragem acima do limite. Confira o valor.')
  .refine((v) => Number.isFinite(v), 'Valor inválido.');

const heightSchema = z.coerce
  .number({ error: 'Informe um número.' })
  .positive('A altura precisa ser maior que zero.')
  .max(50, 'Altura acima do limite. Confira o valor.');

export const featuresStepSchema = z.object({
  sizeM2: sizeSchema.optional().nullable(),
  ceilingHeightM: heightSchema.optional().nullable(),
  /** Chaves da tabela `features`. Validadas contra o banco no servidor. */
  features: z.array(z.string().min(1).max(60)).max(40).default([]),
});

/** Aplica as regras que dependem do tipo escolhido. */
export function validateMeasurements(
  type: SpaceTypeKey,
  data: { sizeM2?: number | null; ceilingHeightM?: number | null },
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (requiresMeasurement(type, 'size_m2') && !data.sizeM2) {
    errors.sizeM2 = 'Informe a metragem — quem procura filtra por tamanho.';
  }
  if (requiresMeasurement(type, 'ceiling_height_m') && !data.ceilingHeightM) {
    errors.ceilingHeightM = 'Informe a altura — importa para quem vai guardar carga.';
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Etapa 4 — Fotos (validada no upload; aqui so o minimo para publicar)
// ---------------------------------------------------------------------------

export const MIN_PHOTOS_TO_PUBLISH = 1;
export const MAX_PHOTOS = 15;

// ---------------------------------------------------------------------------
// Etapa 5 — Titulo e descricao
// ---------------------------------------------------------------------------

export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 2000;

export const contentStepSchema = z.object({
  title: z
    .string()
    .trim()
    .min(10, 'O título precisa de pelo menos 10 caracteres.')
    .max(TITLE_MAX, `Máximo de ${TITLE_MAX} caracteres.`),
  description: z
    .string()
    .trim()
    .min(20, 'Escreva pelo menos uma frase sobre o espaço.')
    .max(DESCRIPTION_MAX, `Máximo de ${DESCRIPTION_MAX} caracteres.`),
});

// ---------------------------------------------------------------------------
// Etapa 6 — Preco e disponibilidade
// ---------------------------------------------------------------------------

/**
 * Preco em CENTAVOS, inteiro. O formulario envia o texto digitado e o servidor
 * converte com `parseBRLToCents` — o navegador nunca decide o valor.
 * O minimo real vem de `platform_settings`, consultado no servidor.
 */
export const priceStepSchema = z.object({
  priceMonthlyCents: z
    .number()
    .int('O preço precisa ser um valor em centavos.')
    .positive('Informe o valor do aluguel.')
    .max(100_000_000, 'Valor acima do limite.'),
  availableFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
    .refine((v) => {
      const d = new Date(`${v}T12:00:00`);
      return !Number.isNaN(d.getTime());
    }, 'Data inválida.')
    .refine((v) => {
      // Ontem ainda passa, para cobrir fuso horario. Semana passada, nao.
      const d = new Date(`${v}T12:00:00`);
      const ontem = new Date();
      ontem.setDate(ontem.getDate() - 1);
      ontem.setHours(0, 0, 0, 0);
      return d >= ontem;
    }, 'A data precisa ser hoje ou no futuro.'),
});

// ---------------------------------------------------------------------------
// Etapa 7 — Regras
// ---------------------------------------------------------------------------

export const rulesStepSchema = z.object({
  allowedItems: z.string().trim().max(1000).optional().or(z.literal('')),
  forbiddenItems: z.string().trim().max(1000).optional().or(z.literal('')),
  accessHours: z.string().trim().max(200).optional().or(z.literal('')),
  rulesText: z.string().trim().max(2000).optional().or(z.literal('')),
});

// ---------------------------------------------------------------------------
// Publicacao — revalida TUDO
// ---------------------------------------------------------------------------

/**
 * O conjunto completo, conferido de novo no momento de publicar.
 *
 * Nao confiamos em "as etapas ja validaram": entre salvar a etapa 2 e publicar,
 * o rascunho pode ter sido editado por outra aba, por um request forjado, ou
 * simplesmente ter ficado meses parado enquanto as regras mudavam.
 */
export const publishSchema = typeStepSchema
  .extend(locationStepSchema.shape)
  .extend(contentStepSchema.shape)
  .extend(priceStepSchema.shape)
  .extend(featuresStepSchema.shape)
  .extend(rulesStepSchema.shape);

export type PublishInput = z.infer<typeof publishSchema>;

/** Etapas do formulario, na ordem. */
export const STEPS = [
  { n: 1, key: 'tipo', label: 'Tipo' },
  { n: 2, key: 'localizacao', label: 'Localização' },
  { n: 3, key: 'caracteristicas', label: 'Características' },
  { n: 4, key: 'fotos', label: 'Fotos' },
  { n: 5, key: 'descricao', label: 'Descrição' },
  { n: 6, key: 'preco', label: 'Preço' },
  { n: 7, key: 'regras', label: 'Regras' },
  { n: 8, key: 'revisao', label: 'Revisão' },
] as const;

export type StepKey = (typeof STEPS)[number]['key'];
export const TOTAL_STEPS = STEPS.length;

export function stepByKey(key: string) {
  return STEPS.find((s) => s.key === key);
}
