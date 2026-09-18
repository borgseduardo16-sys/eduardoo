import { z } from 'zod';
import { onlyDigits, isValidCpf, isValidCnpj, isBrazilianPhone } from '@/lib/safety/documents';

function cpfCnpjSchema(campo: string) {
  return z
    .string()
    .transform(onlyDigits)
    .refine((v) => (v.length === 11 ? isValidCpf(v) : v.length === 14 ? isValidCnpj(v) : false), {
      message: `${campo} inválido.`,
    });
}

/** Dados pra criar a subconta do proprietario (onboarding de recebimento). */
export const payoutAccountSchema = z.object({
  fullName: z.string().trim().min(3, 'Informe seu nome completo.').max(140),
  cpfCnpj: cpfCnpjSchema('CPF/CNPJ'),
  email: z.string().trim().email('E-mail inválido.'),
  mobilePhone: z
    .string()
    .transform(onlyDigits)
    .refine((v) => isBrazilianPhone(v), 'Telefone inválido — use DDD + número.'),
  incomeValueReais: z.coerce
    .number({ error: 'Informe sua renda ou faturamento mensal.' })
    .positive('Informe um valor maior que zero.')
    .max(10_000_000, 'Valor implausível.'),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de nascimento inválida.')
    .optional()
    .or(z.literal('')),
  postalCode: z
    .string()
    .transform(onlyDigits)
    .refine((v) => v.length === 8, 'CEP inválido.'),
  address: z.string().trim().min(3, 'Informe o endereço.').max(200),
  addressNumber: z.string().trim().min(1, 'Informe o número.').max(20),
  province: z.string().trim().min(2, 'Informe o bairro.').max(100),
});

/** Confirmacao de checkout — o locatario so precisa confirmar o CPF que vai identificar a cobranca. */
export const checkoutSchema = z.object({
  bookingId: z.string().uuid(),
  cpfCnpj: cpfCnpjSchema('CPF/CNPJ'),
});
