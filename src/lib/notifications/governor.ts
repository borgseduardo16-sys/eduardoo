import 'server-only';
import { and, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { notifications } from '@/db/schema';

/**
 * Governanca anti-spam (Fase 18).
 *
 * Filtro, nao despachante: a pergunta antes de qualquer notificacao aqui e
 * "isso e relevante o bastante para interromper esta pessoa AGORA?" — na
 * duvida, nao envia. So os tipos de notificacao "de iniciativa da
 * plataforma" (preco/disponibilidade de favorito, espaco compativel) passam
 * por aqui; notificacao transacional 1:1 com uma acao da propria pessoa
 * (reserva, pagamento, mensagem, avaliacao) continua com insert direto nas
 * respectivas actions — ela ja e inerentemente rara e relevante, throttle
 * so acrescentaria risco de esconder algo importante.
 *
 * Sem tabela nova: a propria `notifications` e o log que decide se o
 * cooldown ainda esta ativo. `scopeKey`, quando presente, grava em
 * `data.scopeKey` e limita o cooldown a repeticoes sobre a MESMA entidade
 * (ex.: o mesmo espaco) — sem ele, o cooldown vale para o tipo inteiro
 * (ex.: "no maximo 1 sugestao de espaço compatível a cada 48h", nao importa
 * qual espaço).
 */

export type GovernedNotificationType =
  | 'favorite_price_drop'
  | 'favorite_unavailable'
  | 'favorite_available_again'
  | 'new_compatible_space';

export type GovernedNotificationInput = {
  userId: string;
  type: GovernedNotificationType;
  title: string;
  body: string;
  linkPath: string;
  data: Record<string, unknown>;
  /** Janela minima entre duas notificacoes deste tipo (e escopo) para a mesma pessoa. */
  cooldownHours: number;
  /** Ex.: o id do espaço — limita o cooldown a repeticoes sobre a mesma entidade. */
  scopeKey?: string;
};

/**
 * Envia se o cooldown permitir. Devolve `true` quando enviou, `false` quando
 * o silencio foi a decisao certa (ainda dentro da janela minima).
 *
 * Ha uma janela de corrida teorica (SELECT depois INSERT, sem lock): dois
 * disparos quase simultaneos para a mesma pessoa/tipo/escopo poderiam ambos
 * passar no cooldown e gerar 2 notificacoes em vez de 1. Nenhum caminho de
 * chamada hoje dispara o mesmo (usuario,tipo,escopo) em paralelo — cada
 * gatilho e uma acao unica do proprietario, processada sequencialmente —
 * entao o pior caso realista e uma notificacao duplicada rarissima, nunca
 * dado financeiro. Nao ha lock/constraint dedicados para isto de proposito.
 */
export async function sendGovernedNotification(input: GovernedNotificationInput): Promise<boolean> {
  const conditions = [
    eq(notifications.userId, input.userId),
    sql`${notifications.type}::text = ${input.type}`,
    gt(notifications.createdAt, sql`now() - (${input.cooldownHours} || ' hours')::interval`),
  ];
  if (input.scopeKey) {
    conditions.push(sql`${notifications.data}->>'scopeKey' = ${input.scopeKey}`);
  }

  const [recent] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(...conditions))
    .limit(1);

  if (recent) return false;

  await db.insert(notifications).values({
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    linkPath: input.linkPath,
    data: input.scopeKey ? { ...input.data, scopeKey: input.scopeKey } : input.data,
  });

  return true;
}
