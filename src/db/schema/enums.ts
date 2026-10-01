import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Papel na plataforma.
 * - user  : pode buscar, favoritar, conversar e alugar (locatario).
 * - owner : tudo do `user` + pode publicar espacos (proprietario).
 * - admin : acesso ao painel administrativo. Atribuido manualmente, nunca por cadastro.
 * "Visitante" nao existe aqui de proposito: e a ausencia de sessao.
 */
export const userRole = pgEnum('user_role', ['user', 'owner', 'admin']);

/** Estado da conta na plataforma (bloqueio administrativo). */
export const accountStatus = pgEnum('account_status', ['active', 'suspended', 'banned', 'deleted']);

/** Tipos de espaco anunciavel. */
export const spaceType = pgEnum('space_type', [
  'garagem',
  'vaga_carro',
  'vaga_moto',
  'deposito',
  'quarto',
  'galpao',
  'sala',
  'escritorio',
  'loja',
  'terreno',
  'outro',
  // --- Parte 12: categorias que faltavam ---
  'estacionamento',
  'espaco_eventos',
  'area_lazer',
  'oficina',
]);

/**
 * Ciclo de vida do anuncio.
 * draft -> pending_review -> published -> (paused | rented) -> archived
 * `removed` e exclusao administrativa (soft delete com motivo).
 */
export const spaceStatus = pgEnum('space_status', [
  'draft',
  'pending_review',
  'published',
  'paused',
  'rented',
  'archived',
  'removed',
]);

/**
 * Ciclo de vida da reserva.
 * requested -> (approved | rejected | expired | cancelled) -> awaiting_payment -> active -> (ended | cancelled)
 *
 * `expired` e so alcancavel a partir de `requested`: uma solicitacao que
 * ninguem respondeu dentro do prazo (`booking.request_expiry_days em
 * platform_settings). Ver src/lib/bookings/queries.ts#expireStaleRequests.
 */
export const bookingStatus = pgEnum('booking_status', [
  'requested',
  'approved',
  'rejected',
  'expired',
  'awaiting_payment',
  'active',
  'past_due',
  'cancelled',
  'ended',
]);

/** Meio de pagamento. PIX_AUTOMATICO e o debito recorrente autorizado pelo pagador. */
export const paymentMethod = pgEnum('payment_method', [
  'pix',
  'pix_automatico',
  'credit_card',
  'boleto',
]);

/** Estado de uma cobranca individual. Espelha os estados do gateway. */
export const paymentStatus = pgEnum('payment_status', [
  'pending',
  'confirmed',
  'received',
  'overdue',
  'refunded',
  'partially_refunded',
  'chargeback',
  'failed',
  'cancelled',
]);

/**
 * O que aconteceu com uma caução DEPOIS de cobrada (Fase 20) — separado do
 * `paymentStatus` da cobrança em si (que só diz se o dinheiro entrou).
 * held -> released (sem dano) | forfeited/partially_forfeited (dano procedente).
 */
export const depositReleaseStatus = pgEnum('deposit_release_status', [
  'held',
  'released',
  'forfeited',
  'partially_forfeited',
]);

/** Estado da assinatura (recorrencia mensal). */
export const subscriptionStatus = pgEnum('subscription_status', [
  'pending_authorization',
  'active',
  'past_due',
  'paused',
  'cancelled',
  'expired',
]);

/** Estado do repasse ao proprietario. */
export const payoutStatus = pgEnum('payout_status', [
  'pending',
  'scheduled',
  'settled',
  'failed',
  'reversed',
]);

/**
 * Tipo de lancamento no livro-razao. O ledger e append-only:
 * nada e atualizado, apenas novos lancamentos sao inseridos.
 */
export const ledgerEntryType = pgEnum('ledger_entry_type', [
  'charge_captured',
  'gateway_fee',
  'platform_fee_renter',
  'platform_fee_owner',
  'owner_payout',
  'refund',
  'chargeback',
  'adjustment',
  // --- Fase 20: caução (proteção contra dano) ---
  /** Caução cobrada e confirmada — dinheiro em custódia, ainda de ninguém. */
  'deposit_charged',
  /** Caução (ou parte dela) devolvida ao locatário. */
  'deposit_released',
  /** Parte retida da caução, atribuída ao proprietário — repasse ainda manual (ver docs/STATUS.md). */
  'deposit_forfeited_to_owner',
]);

/** Situacao do onboarding de recebimento do proprietario (KYC no gateway). */
export const payoutAccountStatus = pgEnum('payout_account_status', [
  'not_started',
  'pending_documents',
  'under_review',
  'approved',
  'rejected',
  'disabled',
]);

/** O que esta sendo denunciado. `review` (Fase 21): avaliacao publicada. */
export const reportTarget = pgEnum('report_target', ['space', 'user', 'message', 'review']);

/**
 * Motivos de denuncia.
 *
 * Cobrem os tres alvos. A severidade nao vem daqui: e derivada do motivo no
 * servidor (ver src/lib/safety/reports.ts), para que assedio e fraude subam na
 * fila de moderacao sem depender de quem denunciou marcar isso.
 */
export const reportReason = pgEnum('report_reason', [
  // --- Anuncio ---
  'anuncio_falso',
  'endereco_incorreto',
  'preco_enganoso',
  'espaco_inexistente',
  // --- Conduta ---
  'fraude',
  'golpe_pagamento',
  'pagamento_fora_plataforma',
  'assedio',
  'discurso_odio',
  'ameaca',
  'identidade_falsa',
  // --- Conteudo ---
  'conteudo_inadequado',
  'spam',
  'atividade_proibida',
  // --- Execucao do contrato ---
  'nao_compareceu',
  'dano_ao_espaco',
  'uso_indevido_do_espaco',
  'outro',
  // --- Fase 21: motivos que faltavam para anuncio, usuario e avaliacao ---
  'fotos_enganosas',
  'comportamento_suspeito',
  'informacao_falsa',
  'conteudo_ofensivo',
]);

/**
 * Prioridade na fila de moderacao.
 *
 * `critical` e para o que envolve risco a pessoa (ameaca, assedio) ou dinheiro
 * de terceiros — esses casos nao podem esperar o fim da fila.
 */
export const reportSeverity = pgEnum('report_severity', [
  'low',
  'normal',
  'high',
  'critical',
]);

export const reportStatus = pgEnum('report_status', [
  'open',
  'reviewing',
  'resolved',
  'dismissed',
]);

/** Quem avalia quem, ao fim de uma locacao. */
export const reviewKind = pgEnum('review_kind', ['renter_to_space', 'owner_to_renter']);

export const notificationType = pgEnum('notification_type', [
  'space_published',
  'space_rejected',
  'booking_requested',
  'booking_approved',
  'booking_rejected',
  'booking_cancelled',
  'payment_confirmed',
  'payment_upcoming',
  'payment_failed',
  'payout_settled',
  'new_message',
  'review_received',
  'report_resolved',
  'account_notice',
  // --- Fase 18: sistema inteligente de notificações ---
  /** Preço de um espaço favoritado caiu de forma significativa (>=5%). */
  'favorite_price_drop',
  /** Espaço favoritado saiu do ar (pausado ou alugado por outra pessoa). */
  'favorite_unavailable',
  /** Espaço favoritado voltou a ficar disponível. */
  'favorite_available_again',
  /** Espaço recém-publicado compatível com o padrão de favoritos da pessoa. */
  'new_compatible_space',
  /** Resumo agrupado de favoritos/conversas novas nos anúncios do proprietário. */
  'owner_activity_digest',
  // --- Fase 21: confiança, reputação e notificações ---
  /** O aluguel encerrou e esta pessoa ainda pode avaliar a outra parte. */
  'review_available',
  /** Destaque/Turbo do anúncio termina nas próximas 24h. */
  'promotion_expiring',
  /** Premium concedido ou encerrado pela administração. */
  'premium_changed',
  // --- Fase 23: descoberta, disponibilidade e desempenho ---
  /** Espaço da lista de espera da pessoa voltou a ficar disponível. */
  'waitlist_available',
  /** Anúncio novo que atende a um alerta (busca salva) criado pela pessoa. */
  'saved_search_match',
  /** Relatório mensal de desempenho dos anúncios do proprietário está pronto. */
  'monthly_report',
  // --- Parte 12: aluguel temporário e pagamentos ---
  /** Aluguel temporário termina em 10 minutos (lembrete; a contagem principal é no app). */
  'rental_ending_soon',
  /** Pagamento recebido depois do prazo e devolvido automaticamente. */
  'payment_refunded',
]);

/**
 * Categoria de preferencia de notificacao (Fase 21). O mapa tipo -> categoria
 * vive em src/lib/notifications/categories.ts; `reservas`, `pagamentos` e
 * `conta` sao essenciais e nao podem ser desligadas (CHECK na tabela).
 */
export const notificationCategory = pgEnum('notification_category', [
  'reservas',
  'pagamentos',
  'mensagens',
  'avaliacoes',
  'meus_espacos',
  'recomendacoes',
  'conta',
  /** Fase 23: o que a própria pessoa pediu para acompanhar (lista de espera, alertas de busca). */
  'alertas',
]);

/**
 * Entrada na lista de espera de um espaço indisponível (Fase 23).
 * waiting -> notified (o espaço voltou a ficar disponível e a pessoa foi
 * avisada) | left (a pessoa saiu) | closed (o anúncio deixou de existir).
 * Nenhum desses estados reserva nada: quem é avisado segue o fluxo normal
 * de solicitação.
 */
export const waitlistStatus = pgEnum('waitlist_status', ['waiting', 'notified', 'left', 'closed']);

/** Alerta de busca salva (Fase 23): pausado não gera aviso, mas continua salvo. */
export const savedSearchStatus = pgEnum('saved_search_status', ['active', 'paused']);

/**
 * Motivo de um bloqueio manual de datas no calendário do espaço (Fase 23).
 * PRIVADO: só o proprietário vê. O público vê apenas "indisponível".
 */
export const availabilityBlockReason = pgEnum('availability_block_reason', [
  'manutencao',
  'uso_proprio',
  'viagem',
  'outro',
]);

/**
 * Sugestão de melhoria de anúncio feita por IA (Fase 23). `failed` também
 * vira linha: a tentativa gastou (ou tentou gastar) uma chamada, e o limite
 * de uso conta tentativas, não só sucessos.
 */
export const listingSuggestionStatus = pgEnum('listing_suggestion_status', [
  'ready',
  'partially_applied',
  'applied',
  'dismissed',
  'failed',
]);

/**
 * Ciclo de vida de uma verificacao de telefone por SMS (Fase 21).
 * pending -> approved | failed | expired | cancelled. So `approved` marca o
 * perfil como verificado — e so o servidor, depois do provedor confirmar.
 */
export const phoneVerificationStatus = pgEnum('phone_verification_status', [
  'pending',
  'approved',
  'failed',
  'expired',
  'cancelled',
]);

/**
 * Verificacao de identidade (Fase 21) — SO ESTRUTURA. Nenhum provedor esta
 * integrado; nada no codigo leva uma conta a `verified`, e a interface nunca
 * mostra "Identidade verificada" sem isso. Fica pronta para quando existir um
 * provedor especializado (ver docs/STATUS.md, Fase 21).
 */
export const identityVerificationStatus = pgEnum('identity_verification_status', [
  'not_started',
  'pending',
  'verified',
  'rejected',
  'expired',
]);

/** Estado do processamento de um evento de webhook (idempotencia). */
export const webhookStatus = pgEnum('webhook_status', [
  'received',
  'processed',
  'failed',
  'ignored',
]);

/**
 * Nivel de promocao de um anuncio. Hierarquia fixa: normal < destaque < turbo.
 * So dois niveis pagos existem de proposito — o pedido explicito foi "sem
 * transformar isso em ranking absoluto de todos os anuncios".
 */
export const promotionType = pgEnum('promotion_type', ['destaque', 'turbo']);

/**
 * Estado real de uma promocao — nunca um booleano `is_featured`.
 * scheduled -> active -> (expired | cancelled)
 * `scheduled` nao e alcancado pelo fluxo de hoje (toda promocao comeca
 * `active` na hora), mas existe para permitir agendamento futuro (campanha
 * comprada para comecar numa data especifica) sem precisar de migracao nova.
 */
export const promotionStatus = pgEnum('promotion_status', [
  'scheduled',
  'active',
  'expired',
  'cancelled',
]);

/**
 * De onde veio a promocao. Hoje so `premium_benefit` e alcancavel (credito
 * mensal do Premium); `purchase` existe pronta para quando a compra avulsa
 * de Destaque/Turbo for implementada — ver `transactionId` em `promotions`.
 */
export const promotionSource = pgEnum('promotion_source', ['premium_benefit', 'purchase']);

/**
 * Estado da assinatura Premium. Sem `expired` de proposito: enquanto o unico
 * jeito de virar Premium e o admin conceder manualmente (ver
 * `premiumMembershipSource`), nao existe uma data de renovacao real para
 * expirar sozinha — so `cancelled`, decidido por uma pessoa.
 */
export const premiumMembershipStatus = pgEnum('premium_membership_status', ['active', 'cancelled']);

/**
 * Como a pessoa virou Premium.
 * `admin_grant`  : mecanismo interino de hoje — o admin concede pelo painel,
 *                  mesmo padrao de suspender/ativar conta (auditado, reversivel).
 * `subscription` : plano pago, ainda a definir. Existe aqui pronta para
 *                  quando esse fluxo for decidido, sem precisar de migracao nova.
 */
export const premiumMembershipSource = pgEnum('premium_membership_source', [
  'admin_grant',
  'subscription',
]);

/**
 * Estado de conservacao informado pelo proprietario na classificacao de
 * padrao do espaco (Fase 16). Nao confundir com `reviews` — isto e uma
 * autoavaliacao do dono sobre o proprio espaco, nao a nota de um locatario.
 */
export const spaceConservationState = pgEnum('space_conservation_state', [
  'ruim',
  'regular',
  'bom',
  'muito_bom',
  'excelente',
]);

/**
 * Faixa de padrao resultante do score final da classificacao (0-10).
 * Limites (continuos, sem lacuna): [0,4) economico, [4,7) medio,
 * [7,9) alto_padrao, [9,10] luxo — ver CHECK `sqa_classification_matches_score`.
 */
export const spaceQualityClassification = pgEnum('space_quality_classification', [
  'economico',
  'medio',
  'alto_padrao',
  'luxo',
]);

/** Alerta de incoerencia entre o valor de aluguel sugerido e a media real de comparaveis (Fase 17). */
export const spacePriceMarketWarning = pgEnum('space_price_market_warning', [
  'acima_da_media',
  'abaixo_da_media',
]);

// ---------------------------------------------------------------------------
// Parte 12 — unidades, aluguel temporário e contínuo
// ---------------------------------------------------------------------------

/**
 * Forma do aluguel. `continuous` = mensal, renovação automática, sem data
 * para terminar (o modelo que existia antes). `temporary` = horas, dias ou
 * semanas, com início e fim exatos.
 */
export const rentalKind = pgEnum('rental_kind', ['continuous', 'temporary']);

/** Unidade de tempo do aluguel temporário. */
export const rentalTimeUnit = pgEnum('rental_time_unit', ['hour', 'day', 'week']);

/**
 * Como o grupo cobra o aluguel temporário:
 * - `per_period`: preço por hora/dia/semana até a duração máxima;
 * - `packages`: pacotes fechados ("até 1 hora", "até 5 horas"…).
 */
export const temporaryPricingMode = pgEnum('temporary_pricing_mode', ['per_period', 'packages']);

/** Funcionamento: 24 horas, ou uma janela diária (ex.: 07:00 às 21:00). */
export const operatingHoursMode = pgEnum('operating_hours_mode', ['always', 'daily']);

/** Por que um aluguel terminou — fica gravado na reserva, para o histórico. */
export const bookingEndReason = pgEnum('booking_end_reason', [
  /** Chegou ao fim (temporário) sem renovação. */
  'completed',
  'cancelled_by_renter',
  'cancelled_by_owner',
  /** O prazo de pagamento pendente (40 min + 1 h) terminou sem pagamento. */
  'payment_not_received',
  /** A reserva temporária não foi paga no prazo de pagamento. */
  'hold_expired',
]);
