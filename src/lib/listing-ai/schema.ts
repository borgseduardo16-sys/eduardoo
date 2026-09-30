import { z } from 'zod';

/**
 * Formato da resposta da IA de melhoria de anúncio (Fase 23). Módulo puro.
 *
 * A IA devolve SUGESTÕES: um título, uma descrição reorganizada, o que falta
 * informar e dicas. Nada disso é gravado no anúncio sem o proprietário
 * aceitar, campo por campo — e antes de chegar à tela, tudo passa pela
 * guarda de fatos (`guard.ts`), que tira o que a IA afirmou sem base.
 */

/** O que pode estar faltando no anúncio — lista fechada, cada um leva para a etapa certa do formulário. */
export const MISSING_FIELDS = [
  'metragem', 'altura', 'cobertura', 'seguranca', 'acesso', 'horario', 'regras', 'itens', 'fotos', 'estrutura', 'outro',
] as const;
export type MissingField = (typeof MISSING_FIELDS)[number];

/** Etapa do formulário de anúncio onde cada informação se preenche. */
export const MISSING_FIELD_STEP: Record<MissingField, string> = {
  metragem: 'caracteristicas',
  altura: 'caracteristicas',
  cobertura: 'caracteristicas',
  seguranca: 'caracteristicas',
  acesso: 'caracteristicas',
  estrutura: 'caracteristicas',
  horario: 'regras',
  regras: 'regras',
  itens: 'regras',
  fotos: 'fotos',
  outro: 'descricao',
};

export const ListingAiSchema = z.object({
  titulo: z
    .string()
    .nullable()
    .describe('Título sugerido, até 80 caracteres, só com fatos do anúncio. Null se o atual já está bom.'),
  descricao: z
    .string()
    .nullable()
    .describe(
      'Descrição reorganizada em parágrafos curtos, até 1500 caracteres, usando SOMENTE fatos que estão no anúncio. Null se não houver o que melhorar.',
    ),
  faltando: z
    .array(
      z.object({
        campo: z.enum(MISSING_FIELDS),
        texto: z
          .string()
          .describe('Pedido curto para o proprietário informar algo, ex.: "Considere informar se o espaço possui câmeras."'),
      }),
    )
    .describe('Informações que ajudariam quem procura e que o anúncio não traz. Nunca afirme que o espaço tem ou não tem algo.'),
  dicas: z
    .array(z.string())
    .describe('Até 4 dicas curtas sobre ordem e clareza das informações do anúncio.'),
});

export type ListingAiOutput = z.infer<typeof ListingAiSchema>;
