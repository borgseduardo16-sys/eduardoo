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

/** O que esta sendo denunciado. */
export const reportTarget = pgEnum('report_target', ['space', 'user', 'message']);

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
]);

/** Estado do processamento de um evento de webhook (idempotencia). */
export const webhookStatus = pgEnum('webhook_status', [
  'received',
  'processed',
  'failed',
  'ignored',
]);
