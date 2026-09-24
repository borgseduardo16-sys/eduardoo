import { z } from 'zod';

export const activatePromotionSchema = z.object({
  spaceId: z.uuid('Anúncio inválido.'),
  type: z.enum(['destaque', 'turbo'], { error: 'Escolha Destaque ou Turbo.' }),
});

export const cancelPromotionSchema = z.object({
  promotionId: z.uuid('Promoção inválida.'),
});
