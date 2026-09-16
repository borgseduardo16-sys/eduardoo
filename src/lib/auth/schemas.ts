import { z } from 'zod';

/**
 * Validacao das entradas de autenticacao.
 *
 * Os mesmos schemas valem no cliente (feedback imediato) e no servidor
 * (barreira real). O cliente e conveniencia; o servidor e o que decide.
 */

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Informe seu e-mail.')
  .max(254, 'E-mail longo demais.')
  .email('E-mail invalido.')
  .transform((v) => v.toLowerCase());

/**
 * Politica de senha seguindo a orientacao do NIST: comprimento importa mais do
 * que exigir simbolo e maiuscula, regra que so empurra a pessoa para "Senha@1".
 */
export const passwordSchema = z
  .string()
  .min(10, 'Use pelo menos 10 caracteres.')
  .max(72, 'A senha pode ter no maximo 72 caracteres.')
  .refine((v) => !/^\d+$/.test(v), 'A senha nao pode ser so numeros.')
  .refine((v) => !/^(.)\1+$/.test(v), 'A senha nao pode ser um caractere repetido.');

export const signUpSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, 'Informe seu nome.')
      .max(120, 'Nome longo demais.'),
    email: emailSchema,
    password: passwordSchema,
    acceptTerms: z.literal(true, {
      error: 'E preciso aceitar os Termos de Uso para criar a conta.',
    }),
  })
  .refine(
    ({ email, password }) => {
      const local = email.split('@')[0];
      return local.length < 3 || !password.toLowerCase().includes(local);
    },
    { path: ['password'], message: 'A senha nao pode conter seu e-mail.' },
  );

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Informe sua senha.'),
});

export const requestPasswordResetSchema = z.object({
  email: emailSchema,
});

export const updatePasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas nao coincidem.',
  });

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
