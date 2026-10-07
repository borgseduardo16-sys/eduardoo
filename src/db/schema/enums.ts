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
 * Ciclo de vida da locação mensal.
 *
 *   requested ──(proprietário aceita, com instruções de acesso)──▶ approved
 *   approved ──(locatário inicia o pagamento)──▶ awaiting_payment ──(webhook)──▶ active
 *   active ──(cobrança do mês falha)──▶ past_due ──(regulariza)──▶ active
 *   requested ─▶ rejected | expired (24 h sem resposta) | cancelled
 *   approved/awaiting_payment ─▶ expired (24 h sem pagar) | cancelled
 *   active/past_due ─▶ ended (encerrada) | past_due vencida (2 h) ─▶ ended
 *
 * "Aguardando início" NÃO é um estado gravado: é `active` com `start_date`
 * no futuro (o rótulo vem da data — ver src/lib/bookings/format.ts).
 *
 * Quem OCUPA uma vaga do anúncio: approved, awaiting_payment, active e
 * past_due (função `booking_occupies`, na migração 0026). Pedido (`requested`)
 * não ocupa nada: vários pedidos podem disputar a última vaga, e o banco
 * decide na hora de aceitar (trigger `bookings_guard_capacity`).
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
  /** LEGADO: era o aviso do aluguel por hora (removido na 0033). Valor de enum não se apaga; nada mais o usa. */
  'rental_ending_soon',
  /** Pagamento recebido depois do prazo e devolvido automaticamente. */
  'payment_refunded',
  // --- Modelo mensal por quantidade (0033) ---
  /** Proprietário: um pedido está perto de expirar sem resposta. */
  'booking_request_expiring',
  /** Pedido expirou (ninguém respondeu) ou a locação aceita expirou sem pagamento. */
  'booking_expired',
  /** Proprietário: a locação foi confirmada (pagamento do 1º mês recebido). */
  'rental_started',
  /** Locatário: o proprietário pediu o encerramento da locação. */
  'rental_end_requested',
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
 * Estado da assinatura Premium (resumo — quem diz se a pessoa E Premium agora
 * sao os ciclos pagos, ver `premium_is_active()` e src/db/schema/premium.ts).
 *   active          : tem (ou teve, ate a varredura) um periodo pago;
 *   cancelled       : terminou por cancelamento ou revogacao;
 *   pending_payment : assinatura criada, 1o pagamento ainda nao confirmado
 *                     (NAO e Premium — Premium e pagamento confirmado);
 *   expired         : o periodo pago acabou e nao houve renovacao confirmada.
 * Os dois ultimos entram na migracao 0034 (valores novos de enum existente:
 * nao sao usados como literal dentro da propria migracao).
 */
export const premiumMembershipStatus = pgEnum('premium_membership_status', [
  'active',
  'cancelled',
  'pending_payment',
  'expired',
]);

/**
 * Como a pessoa virou Premium.
 * `subscription` : assinatura PAGA (R$ 119,90/mes, recorrencia propria no
 *                  Asaas). E o caminho normal do produto.
 * `admin_grant`  : MODO ADMINISTRATIVO/TESTE — a administracao concede por
 *                  um numero de dias, para teste ou suporte. Nao e gratis
 *                  "de verdade": nao recebe os beneficios financeiros
 *                  (taxa reduzida, primeiro mes) a menos que a concessao
 *                  marque o teste financeiro de proposito.
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
// Modelo mensal por quantidade (0033)
// ---------------------------------------------------------------------------

/**
 * Por que uma locação terminou — fica gravado na reserva, para o histórico.
 * Só vale para `ended`, `expired` e `cancelled` (CHECK `bookings_end_reason_matches`).
 */
export const bookingEndReason = pgEnum('booking_end_reason', [
  'cancelled_by_renter',
  'cancelled_by_owner',
  /** `expired`: o proprietário não respondeu o pedido em 24 h. */
  'request_not_answered',
  /** `expired`: a locação aceita não foi paga em 24 h. `ended`: a janela de 2 h do pagamento pendente acabou. */
  'payment_not_received',
  /** `ended`: o proprietário pediu o encerramento e a data pedida chegou. */
  'owner_end_request',
]);

/** Pedido do proprietário para encerrar uma locação em andamento. */
export const bookingEndRequestStatus = pgEnum('booking_end_request_status', [
  'pending',
  /** O proprietário desistiu do pedido antes da data. */
  'withdrawn',
  /** A data chegou (ou a locação terminou antes) e o pedido foi cumprido. */
  'completed',
]);

/** Tipo da mensagem do chat. Imagens NÃO existem: só texto e áudio. */
export const messageKind = pgEnum('message_kind', ['text', 'audio']);
