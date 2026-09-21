import { z } from 'zod';
import { PREDEFINED_NICHES } from './locations';

export const locationScopeSchema = z.enum(['city', 'state', 'region', 'country']);

export const searchFormSchema = z.object({
  niche: z
    .string({ error: 'Escolha ou digite um nicho.' })
    .trim()
    .min(2, 'Escolha ou digite um nicho.')
    .max(120),
  locationLabel: z
    .string({ error: 'Informe a localização.' })
    .trim()
    .min(2, 'Informe a localização.')
    .max(120),
  locationScope: locationScopeSchema,
  minReviews: z.coerce.number().int().min(0).max(1_000_000).default(0),
  minRating: z.coerce.number().min(0).max(5).nullable().optional(),
  requestedQuantity: z.coerce.number().int().min(1).max(5000),
});

export type SearchFormInput = z.infer<typeof searchFormSchema>;

export function isPredefinedNiche(value: string): boolean {
  return (PREDEFINED_NICHES as readonly string[]).includes(value);
}

export const savedStatusSchema = z.enum([
  'novo',
  'contato_realizado',
  'em_negociacao',
  'cliente',
  'sem_interesse',
]);

export const updateLeadNotesSchema = z.object({
  leadId: z.string().uuid(),
  notes: z.string().max(4000).optional(),
});
