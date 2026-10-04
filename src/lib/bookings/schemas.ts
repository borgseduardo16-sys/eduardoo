import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');

/*
 * O limite da data de início (hoje em Brasília, até N dias à frente, bloqueios
 * do calendário) não está aqui: depende do relógio de Brasília e das regras do
 * anúncio, e quem confere é a ação — `new Date().toISOString()` daria a data em
 * UTC, que de noite já é "amanhã" no Brasil.
 */
export const requestBookingSchema = z.object({
  spaceId: z.string().uuid('Espaço inválido.'),
  startDate: isoDate,
  renterMessage: z.string().trim().max(600, 'Escreva até 600 caracteres.').optional(),
});

/** Instruções de acesso: o aceite exige texto (10 a 1000 caracteres) OU áudio. */
export const ACCESS_INSTRUCTIONS_MIN = 10;
export const ACCESS_INSTRUCTIONS_MAX = 1000;

export const respondBookingSchema = z.object({
  bookingId: z.string().uuid(),
  decision: z.enum(['accept', 'reject']),
  ownerResponse: z.string().trim().max(600, 'Escreva até 600 caracteres.').optional(),
  accessInstructions: z
    .string()
    .trim()
    .max(ACCESS_INSTRUCTIONS_MAX, `As instruções de acesso podem ter até ${ACCESS_INSTRUCTIONS_MAX} caracteres.`)
    .optional(),
  /** Caminho do áudio já enviado (pasta da conversa). A duração é só para o player. */
  accessAudioPath: z.string().trim().max(200).optional(),
  accessAudioDurationMs: z.coerce.number().int().min(1000).max(180_000).optional(),
});

export const cancelBookingSchema = z.object({
  bookingId: z.string().uuid(),
  reason: z.string().trim().max(600, 'Escreva até 600 caracteres.').optional(),
});

/** Pedido do proprietário para encerrar uma locação em andamento. */
export const requestEndSchema = z.object({
  bookingId: z.string().uuid(),
  endDate: isoDate,
  reason: z.string().trim().max(500, 'Escreva até 500 caracteres.').optional(),
});

export const withdrawEndRequestSchema = z.object({
  bookingId: z.string().uuid(),
});
