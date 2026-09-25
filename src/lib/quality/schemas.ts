import { z } from 'zod';

export const requestQualityAssessmentSchema = z.object({
  spaceId: z.uuid('Espaço inválido.'),
  conservationState: z.enum(['ruim', 'regular', 'bom', 'muito_bom', 'excelente'], {
    error: 'Escolha o estado de conservação.',
  }),
  ageYears: z.coerce
    .number()
    .int('Use um número inteiro de anos.')
    .min(0, 'A idade não pode ser negativa.')
    .max(200, 'Verifique a idade informada.'),
  renovatedRecently: z.preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean()),
});
