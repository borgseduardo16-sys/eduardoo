import { z } from 'zod';
import { onlyDigits, isValidCpf, isValidCnpj } from '@/lib/safety/documents';

export const activatePromotionSchema = z.object({
  spaceId: z.uuid('Anúncio inválido.'),
  type: z.enum(['destaque', 'turbo'], { error: 'Escolha Destaque ou Turbo.' }),
});

export const cancelPromotionSchema = z.object({
  promotionId: z.uuid('Promoção inválida.'),
});

/** Confirmacao de compra avulsa — o dono so confirma o CPF/CNPJ que identifica a cobranca. */
export const purchasePromotionSchema = z.object({
  spaceId: z.uuid('Anúncio inválido.'),
  type: z.enum(['destaque', 'turbo'], { error: 'Escolha Destaque ou Turbo.' }),
  durationHours: z.coerce.number().int().positive('Escolha uma duração.'),
  cpfCnpj: z
    .string()
    .transform(onlyDigits)
    .refine((v) => (v.length === 11 ? isValidCpf(v) : v.length === 14 ? isValidCnpj(v) : false), {
      message: 'CPF/CNPJ inválido.',
    }),
});
