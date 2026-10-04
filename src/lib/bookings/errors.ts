import 'server-only';
import postgres from 'postgres';

const { PostgresError } = postgres;
type PgError = InstanceType<typeof PostgresError>;

/** O erro do Postgres por trás de um erro do Drizzle (que embrulha em `.cause`). */
export function pgErrorFrom(err: unknown): PgError | null {
  if (err instanceof PostgresError) return err;
  if (err instanceof Error && err.cause instanceof PostgresError) return err.cause;
  return null;
}

/** O banco recusou por falta de vaga (`bookings_capacity`) ou por deadlock entre duas pessoas aceitando ao mesmo tempo. */
export function isCapacityConflict(err: unknown): boolean {
  const pg = pgErrorFrom(err);
  if (!pg) return false;
  if (pg.constraint_name === 'bookings_capacity') return true;
  return pg.code === '40P01'; // deadlock_detected
}

/**
 * Recusa de uma regra do banco, dita para quem está usando — nunca a
 * mensagem técnica. `null` = não é uma regra conhecida (quem chama decide).
 */
export function bookingRuleMessage(err: unknown): string | null {
  const pg = pgErrorFrom(err);
  if (!pg) return null;
  if (pg.code === '40P01') return 'Muita gente mexendo neste anúncio ao mesmo tempo. Tente de novo em instantes.';
  switch (pg.constraint_name) {
    case 'bookings_capacity':
      return 'Não há vaga disponível neste anúncio agora.';
    case 'bookings_access_required':
      return 'Informe como o locatário encontra e usa o espaço (por texto ou por áudio).';
    case 'bookings_response_window':
      return 'O prazo para responder esta solicitação terminou.';
    case 'bookings_rent_matches_space':
      return 'O preço deste anúncio mudou agora há pouco. Confira o novo valor e tente de novo.';
    case 'bookings_period_not_blocked':
      return 'O proprietário bloqueou o início de locações nessa data. Escolha outra data.';
    case 'bookings_one_live_per_renter_space':
    case 'bookings_one_pending_per_renter_space':
      return 'Você já tem uma solicitação ou locação em andamento neste anúncio.';
    case 'bookings_access_instructions_length':
      return 'As instruções de acesso precisam ter entre 10 e 1000 caracteres.';
    case 'bookings_access_audio_in_conversation':
    case 'bookings_access_audio_shape':
      return 'O áudio das instruções não pôde ser anexado. Grave de novo.';
    case 'booking_end_requests_by_owner':
      return 'Só o proprietário da locação pede o encerramento.';
    case 'booking_end_requests_live_booking':
      return 'Só uma locação em andamento pode ter o encerramento pedido.';
    case 'booking_end_requests_min_notice':
      return 'A data pedida não respeita o aviso mínimo. Escolha uma data mais distante.';
    case 'booking_end_requests_horizon':
      return 'A data pedida está longe demais. Escolha uma data dentro de um ano.';
    case 'booking_end_requests_one_pending':
      return 'Já existe um pedido de encerramento em aberto para esta locação.';
    case 'spaces_quantity_covers_rentals':
      return 'Há locações em andamento: a quantidade oferecida não pode ficar menor que a quantidade ocupada.';
    default:
      return null;
  }
}
