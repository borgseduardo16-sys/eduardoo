import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { requireIntegration } from '@/lib/env';

/**
 * Analise de fotos por IA (Claude, visao) — Fase 16.
 *
 * Modelo: Haiku 4.5. E uma classificacao estruturada e barata (nao
 * raciocinio longo), rodada sob demanda pelo proprio dono do anuncio —
 * Sonnet/Opus seriam custo desproporcional para essa tarefa.
 *
 * O "resumo" desta analise e so um dos ingredientes do texto final que o
 * usuario ve — o paragrafo completo (que tambem cobre idade, reforma e
 * conservacao informada) e montado em `scoring.ts`, sem outra chamada de IA.
 */

const CONSERVATION_STATES = ['ruim', 'regular', 'bom', 'muito_bom', 'excelente'] as const;

const PhotoAnalysisSchema = z.object({
  acabamento: z
    .number()
    .min(0)
    .max(10)
    .describe('Qualidade do acabamento visivel nas fotos (pintura, piso, portas, estrutura), de 0 a 10.'),
  modernidade: z
    .number()
    .min(0)
    .max(10)
    .describe('Quao atualizado/moderno o espaco parece pelas fotos, de 0 a 10.'),
  conservacaoPercebida: z
    .enum(CONSERVATION_STATES)
    .describe('Estado de conservacao que voce percebe nas fotos, independente do que o dono declarar.'),
  sinaisDeDesgaste: z
    .array(z.string().max(120))
    .max(8)
    .describe('Lista curta de sinais de desgaste encontrados nas fotos (ex: "rachadura visivel na parede lateral", "mancha de umidade no teto"). Array vazio se nao encontrar nenhum.'),
  resumo: z
    .string()
    .max(400)
    .describe('Um ou dois paragrafos curtos, em portugues do Brasil, resumindo o que as fotos mostram sobre o estado do espaco.'),
});

export type PhotoAnalysis = z.infer<typeof PhotoAnalysisSchema>;

export type PhotoInput = {
  base64: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
};

export class AiVisionError extends Error {
  constructor(
    message: string,
    readonly cause_?: unknown,
  ) {
    super(message);
    this.name = 'AiVisionError';
  }
}

const SYSTEM_PROMPT = `Voce avalia fotos de espacos ociosos anunciados para aluguel numa plataforma
brasileira — garagens, depositos, galpoes, salas, vagas de carro/moto,
escritorios, lojas e terrenos. NAO sao imoveis residenciais (nao existe
"quarto de casal" nem "sala de estar" para avaliar aqui): julgue acabamento,
estrutura, limpeza, organizacao e sinais de desgaste do espaco no uso a que
ele se destina.

Seja direto e especifico nos sinais de desgaste (cite o que aparece nas
fotos, nao generico). Se as fotos forem poucas ou de baixa qualidade para
avaliar algo com confianca, diga isso no resumo em vez de inventar detalhe.
Nunca avalie ou mencione pessoas que eventualmente apareçam nas fotos.`;

/**
 * Manda as fotos do espaco para a Claude analisar e devolve um JSON validado.
 * Lanca `AiVisionError` se a integracao nao estiver configurada, a chamada
 * falhar, ou a resposta nao vier no formato esperado — nunca inventa um
 * resultado.
 */
export async function analyzeSpacePhotos(
  photos: PhotoInput[],
  context: { spaceType: string; title: string },
): Promise<PhotoAnalysis> {
  if (photos.length === 0) {
    throw new AiVisionError('Nenhuma foto disponível para analisar.');
  }

  const { ANTHROPIC_API_KEY } = requireIntegration('aiVision');
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  try {
    const response = await client.messages.parse({
      model: 'claude-haiku-4-5',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            ...photos.map((p) => ({
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: p.mediaType, data: p.base64 },
            })),
            {
              type: 'text' as const,
              text: `Este é um espaço do tipo "${context.spaceType}", anunciado como "${context.title}". Analise as fotos acima e devolva a avaliação estruturada.`,
            },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(PhotoAnalysisSchema) },
    });

    if (!response.parsed_output) {
      throw new AiVisionError('A IA não devolveu um resultado no formato esperado.');
    }
    return response.parsed_output;
  } catch (err) {
    if (err instanceof AiVisionError) throw err;
    if (err instanceof Anthropic.APIError) {
      throw new AiVisionError(`Falha ao analisar as fotos com IA: ${err.message}`, err);
    }
    throw err;
  }
}
