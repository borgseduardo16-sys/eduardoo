/**
 * Categorias de preferência de notificação (Fase 21) — módulo puro.
 *
 * Cada tipo de notificação pertence a UMA categoria. A pessoa escolhe por
 * categoria (não por tipo: ninguém quer uma lista de 22 interruptores).
 *
 * ESSENCIAIS não desligam: reservas, pagamentos e conta. Desligar "seu
 * pagamento foi recusado" ou "sua reserva foi cancelada" só prejudicaria
 * quem desligou — e o CHECK `notification_preferences_essential_locked` no
 * banco garante isso mesmo que alguém tente gravar direto.
 */

export const NOTIFICATION_CATEGORIES = [
  'reservas',
  'pagamentos',
  'mensagens',
  'avaliacoes',
  'meus_espacos',
  'recomendacoes',
  'alertas',
  'conta',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const ESSENTIAL_CATEGORIES: readonly NotificationCategory[] = ['reservas', 'pagamentos', 'conta'];

export const CATEGORY_INFO: Record<NotificationCategory, { label: string; description: string }> = {
  reservas: {
    label: 'Solicitações e reservas',
    description: 'Pedido novo, prazo para responder, aceite, recusa, início, cancelamento e fim da locação.',
  },
  pagamentos: {
    label: 'Pagamentos',
    description: 'Pagamento aprovado, recusado, em atraso, estornado e repasses.',
  },
  mensagens: {
    label: 'Mensagens',
    description: 'Mensagem nova numa conversa.',
  },
  avaliacoes: {
    label: 'Avaliações',
    description: 'Avaliação recebida e aviso de que já dá para avaliar uma locação.',
  },
  meus_espacos: {
    label: 'Atualizações dos meus espaços',
    description: 'Anúncio publicado, resumo de interesse, Destaque ou Turbo terminando.',
  },
  recomendacoes: {
    label: 'Favoritos e recomendações',
    description: 'Preço de favorito caiu, favorito voltou a ficar disponível, espaço novo parecido com os que você salvou.',
  },
  alertas: {
    label: 'Alertas que você criou',
    description: 'Espaço da sua lista de espera disponível e anúncios novos que atendem aos seus alertas de busca.',
  },
  conta: {
    label: 'Conta e segurança',
    description: 'Avisos sobre a sua conta, denúncias que você fez e o plano Premium.',
  },
};

const TIPO_PARA_CATEGORIA: Record<string, NotificationCategory> = {
  booking_requested: 'reservas',
  booking_approved: 'reservas',
  booking_rejected: 'reservas',
  booking_cancelled: 'reservas',
  payment_confirmed: 'pagamentos',
  payment_upcoming: 'pagamentos',
  payment_failed: 'pagamentos',
  payment_refunded: 'pagamentos',
  payout_settled: 'pagamentos',
  // Fluxo mensal por quantidade: prazos, início e encerramento — todos "reservas" (essencial).
  booking_request_expiring: 'reservas',
  booking_expired: 'reservas',
  rental_started: 'reservas',
  rental_end_requested: 'reservas',
  // Legado: o aluguel por tempo deixou de existir, mas as notificações antigas continuam no histórico.
  rental_ending_soon: 'reservas',
  new_message: 'mensagens',
  review_received: 'avaliacoes',
  review_available: 'avaliacoes',
  space_published: 'meus_espacos',
  space_rejected: 'meus_espacos',
  owner_activity_digest: 'meus_espacos',
  promotion_expiring: 'meus_espacos',
  favorite_price_drop: 'recomendacoes',
  favorite_unavailable: 'recomendacoes',
  favorite_available_again: 'recomendacoes',
  new_compatible_space: 'recomendacoes',
  waitlist_available: 'alertas',
  saved_search_match: 'alertas',
  monthly_report: 'meus_espacos',
  report_resolved: 'conta',
  account_notice: 'conta',
  premium_changed: 'conta',
};

/** Tipo sem categoria conhecida cai em "conta" — essencial: na dúvida, entrega. */
export function categoryOf(type: string): NotificationCategory {
  return TIPO_PARA_CATEGORIA[type] ?? 'conta';
}

export function isEssentialCategory(category: NotificationCategory): boolean {
  return ESSENTIAL_CATEGORIES.includes(category);
}

const ROTULO_CURTO: Record<NotificationCategory, string> = {
  reservas: 'Reservas',
  pagamentos: 'Pagamentos',
  mensagens: 'Mensagens',
  avaliacoes: 'Avaliações',
  meus_espacos: 'Meus espaços',
  recomendacoes: 'Recomendações',
  alertas: 'Alertas',
  conta: 'Conta',
};

/** Rótulo curto do tipo, para a central ("Reservas", "Pagamentos"…). */
export function categoryLabelOf(type: string): string {
  return ROTULO_CURTO[categoryOf(type)];
}
