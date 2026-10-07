import { z } from 'zod';
import { cpfCnpjSchema } from '@/lib/payments/schemas';

/**
 * Assinar o Premium. O navegador manda SÓ a forma de pagamento (e o CPF, se a
 * conta ainda não tem cliente no gateway) — nunca preço: o valor é lido do
 * banco (`premium.price_monthly_cents`) no servidor.
 */
export const subscribePremiumSchema = z.object({
  method: z.enum(['card', 'pix'], { error: 'Escolha como pagar.' }),
  cpfCnpj: z
    .union([z.literal(''), cpfCnpjSchema('CPF/CNPJ')])
    .optional()
    .transform((v) => (v ? v : null)),
});

/** Concessão administrativa (modo teste/suporte). */
export const adminPremiumGrantSchema = z.object({
  userId: z.uuid('Usuário inválido.'),
  days: z.coerce
    .number({ error: 'Informe por quantos dias.' })
    .int('Use um número inteiro de dias.')
    .min(1, 'No mínimo 1 dia.')
    .max(90, 'No máximo 90 dias.'),
  reason: z.string().trim().min(5, 'Explique o motivo (mín. 5 caracteres).').max(300, 'Use no máximo 300 caracteres.'),
  financialTest: z.boolean(),
});
