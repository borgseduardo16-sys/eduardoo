import { z } from 'zod';

export const startConversationSchema = z.object({
  spaceId: z.string().uuid(),
});

export const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  body: z
    .string()
    .trim()
    .min(1, 'Escreva alguma coisa antes de enviar.')
    .max(4000, 'Mensagem muito longa (máximo 4000 caracteres).'),
});
