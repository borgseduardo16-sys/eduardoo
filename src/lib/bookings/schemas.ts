import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');

/** Hoje no formato ISO, para comparar sem depender de fuso do cliente. */
function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export const requestBookingSchema = z.object({
  spaceId: z.string().uuid('Espaço inválido.'),
  startDate: isoDate.refine((v) => v >= hojeISO(), 'A data de início não pode ser no passado.'),
  renterMessage: z.string().trim().max(600, 'Escreva até 600 caracteres.').optional(),
});

export const respondBookingSchema = z.object({
  bookingId: z.string().uuid(),
  decision: z.enum(['accept', 'reject']),
  ownerResponse: z.string().trim().max(600, 'Escreva até 600 caracteres.').optional(),
});

export const cancelBookingSchema = z.object({
  bookingId: z.string().uuid(),
  reason: z.string().trim().max(600, 'Escreva até 600 caracteres.').optional(),
});
