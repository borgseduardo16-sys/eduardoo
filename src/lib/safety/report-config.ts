import { z } from 'zod';

/**
 * Configuracao das denuncias.
 *
 * Modulo puro (sem 'use server'), para poder ser importado tanto pelo
 * formulario no navegador quanto pela acao no servidor — os dois precisam da
 * mesma lista de motivos, e duas listas divergentes seria fonte garantida de bug.
 */

export const REPORT_TARGETS = ['space', 'user', 'message'] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export type ReportSeverity = 'low' | 'normal' | 'high' | 'critical';

type ReasonConfig = {
  /** Texto mostrado a quem denuncia. */
  label: string;
  /** Explicacao curta, para a pessoa escolher o motivo certo. */
  hint: string;
  /** Alvos em que este motivo faz sentido. */
  targets: readonly ReportTarget[];
  /**
   * Prioridade na fila de moderacao.
   *
   * Definida AQUI, no servidor, e nunca enviada pelo formulario. Se quem
   * denuncia pudesse escolher a gravidade, tudo chegaria como "critico" e a
   * fila perderia a serventia.
   */
  severity: ReportSeverity;
};

export const REPORT_REASONS = {
  // --- Anuncio ---
  anuncio_falso: {
    label: 'Anúncio falso',
    hint: 'O espaço parece não existir ou as fotos não são do local.',
    targets: ['space'],
    severity: 'high',
  },
  endereco_incorreto: {
    label: 'Endereço incorreto',
    hint: 'A localização no mapa não corresponde ao endereço real.',
    targets: ['space'],
    severity: 'normal',
  },
  preco_enganoso: {
    label: 'Preço enganoso',
    hint: 'O valor anunciado não é o cobrado de verdade.',
    targets: ['space'],
    severity: 'normal',
  },
  espaco_inexistente: {
    label: 'O espaço não existe',
    hint: 'Fui até o local e não há espaço nenhum.',
    targets: ['space'],
    severity: 'high',
  },

  // --- Conduta ---
  fraude: {
    label: 'Fraude',
    hint: 'Tentativa de enganar para obter dinheiro ou dados.',
    targets: ['space', 'user', 'message'],
    severity: 'critical',
  },
  golpe_pagamento: {
    label: 'Golpe de pagamento',
    hint: 'Pediram pagamento adiantado, sinal ou caução por fora.',
    targets: ['user', 'message'],
    severity: 'critical',
  },
  pagamento_fora_plataforma: {
    label: 'Insistiu em pagar por fora',
    hint: 'Pediu para fechar negócio fora da MyPlace.',
    targets: ['user', 'message'],
    severity: 'high',
  },
  assedio: {
    label: 'Assédio',
    hint: 'Mensagens constrangedoras, insistentes ou de cunho sexual.',
    targets: ['user', 'message'],
    severity: 'critical',
  },
  discurso_odio: {
    label: 'Discurso de ódio',
    hint: 'Ofensa por raça, gênero, religião, orientação ou deficiência.',
    targets: ['space', 'user', 'message'],
    severity: 'critical',
  },
  ameaca: {
    label: 'Ameaça',
    hint: 'Ameaça à integridade física ou ao patrimônio.',
    targets: ['user', 'message'],
    severity: 'critical',
  },
  identidade_falsa: {
    label: 'Identidade falsa',
    hint: 'A pessoa não é quem diz ser.',
    targets: ['user'],
    severity: 'high',
  },

  // --- Conteudo ---
  conteudo_inadequado: {
    label: 'Conteúdo inadequado',
    hint: 'Texto ou imagem imprópria no anúncio ou na conversa.',
    targets: ['space', 'user', 'message'],
    severity: 'normal',
  },
  spam: {
    label: 'Spam',
    hint: 'Propaganda repetida ou mensagem em massa.',
    targets: ['space', 'user', 'message'],
    severity: 'low',
  },
  atividade_proibida: {
    label: 'Atividade proibida',
    hint: 'Uso do espaço para algo ilegal.',
    targets: ['space', 'user', 'message'],
    severity: 'critical',
  },

  // --- Execucao do contrato ---
  nao_compareceu: {
    label: 'Não compareceu',
    hint: 'Combinamos e a pessoa não apareceu nem avisou.',
    targets: ['user'],
    severity: 'normal',
  },
  dano_ao_espaco: {
    label: 'Dano ao espaço',
    hint: 'O locatário danificou o espaço.',
    targets: ['user'],
    severity: 'high',
  },
  uso_indevido_do_espaco: {
    label: 'Uso indevido do espaço',
    hint: 'Está usando o espaço para algo diferente do combinado.',
    targets: ['user'],
    severity: 'high',
  },

  outro: {
    label: 'Outro motivo',
    hint: 'Descreva o que aconteceu no campo abaixo.',
    targets: ['space', 'user', 'message'],
    severity: 'normal',
  },
} as const satisfies Record<string, ReasonConfig>;

export type ReportReason = keyof typeof REPORT_REASONS;

/** Motivos que fazem sentido para um alvo — alimenta o formulario. */
export function reasonsForTarget(target: ReportTarget) {
  return (Object.entries(REPORT_REASONS) as [ReportReason, ReasonConfig][])
    .filter(([, cfg]) => cfg.targets.includes(target))
    .map(([value, cfg]) => ({ value, label: cfg.label, hint: cfg.hint }));
}

/** Gravidade a partir do motivo. Sempre calculada no servidor. */
export function severityFor(reason: ReportReason): ReportSeverity {
  return REPORT_REASONS[reason].severity;
}

/** O motivo combina com o alvo? Evita "não compareceu" contra um anúncio. */
export function isReasonValidForTarget(reason: ReportReason, target: ReportTarget): boolean {
  return (REPORT_REASONS[reason].targets as readonly ReportTarget[]).includes(target);
}

export const reportInputSchema = z
  .object({
    targetType: z.enum(REPORT_TARGETS),
    targetId: z.uuid('Identificador do alvo inválido.'),
    reason: z.enum(Object.keys(REPORT_REASONS) as [ReportReason, ...ReportReason[]]),
    details: z
      .string()
      .trim()
      .max(2000, 'Use no máximo 2000 caracteres.')
      .optional()
      .transform((v) => (v === '' ? undefined : v)),
  })
  .refine((d) => isReasonValidForTarget(d.reason, d.targetType), {
    path: ['reason'],
    message: 'Este motivo não se aplica ao que você está denunciando.',
  })
  .refine((d) => d.reason !== 'outro' || (d.details?.length ?? 0) >= 10, {
    path: ['details'],
    message: 'Ao escolher "Outro motivo", descreva o que aconteceu.',
  });

export type ReportInput = z.infer<typeof reportInputSchema>;

export const blockUserSchema = z.object({
  blockedId: z.uuid('Usuário inválido.'),
  reason: z.string().trim().max(500).optional(),
});
