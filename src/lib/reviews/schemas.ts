import { z } from 'zod';

export const createReviewSchema = z.object({
  bookingId: z.uuid('Reserva inválida.'),
  kind: z.enum(['renter_to_space', 'owner_to_renter'], { error: 'Tipo de avaliação inválido.' }),
  rating: z.coerce.number().int().min(1, 'Escolha de 1 a 5 estrelas.').max(5, 'Escolha de 1 a 5 estrelas.'),
  comment: z.string().trim().max(2000, 'Escreva até 2000 caracteres.').optional(),
});
