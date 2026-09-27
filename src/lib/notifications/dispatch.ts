import 'server-only';
import { db } from '@/db/client';
import { notifications } from '@/db/schema';
import { sendPushToUser } from './push';

/**
 * Ponto único de inserção de notificação (Fase 19).
 *
 * Antes desta fase, cada action fazia `db.insert(notifications)` direto —
 * funcionava, mas não dava onde pendurar "e também manda um push de
 * verdade pro celular" sem editar cada um dos ~10 lugares. Este arquivo
 * substitui esses inserts, sem mudar nenhum título/corpo/link já escrito.
 *
 * Duas formas, pelo mesmo motivo — nunca mandar push ANTES do commit:
 *   - `notifyUser(s)`: o caso comum, fora de uma transação (ou já com ela
 *     resolvida) — insere e manda o push na mesma chamada.
 *   - `insertNotification(s)` + `flushPushJobs`: para quando o insert
 *     precisa acontecer DENTRO de uma transação maior (ex.: o webhook do
 *     Asaas) — insere com o `tx`, devolve o que precisa ser enviado, e quem
 *     chama despacha o push só depois que a transação comitou. Sem essa
 *     separação, um push poderia avisar de algo que a transação desfez
 *     um instante depois.
 */

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type NotifyInput = Omit<typeof notifications.$inferInsert, 'id' | 'createdAt' | 'readAt' | 'emailSentAt'>;

export type PushJob = { userId: string; title: string; body: string; url: string };

function toPushJob(input: NotifyInput): PushJob | null {
  if (!input.linkPath) return null;
  return { userId: input.userId, title: input.title, body: input.body ?? '', url: input.linkPath };
}

/** Insere sem mandar push ainda — devolve o(s) job(s) pra `flushPushJobs` depois do commit. */
export async function insertNotification(tx: DbOrTx, input: NotifyInput): Promise<PushJob | null> {
  await tx.insert(notifications).values(input);
  return toPushJob(input);
}

export async function insertNotifications(tx: DbOrTx, inputs: NotifyInput[]): Promise<PushJob[]> {
  if (inputs.length === 0) return [];
  await tx.insert(notifications).values(inputs);
  return inputs.map(toPushJob).filter((j): j is PushJob => j !== null);
}

/** Manda os pushes de verdade. Só chame depois que a transação (se houver) já comitou. */
export async function flushPushJobs(jobs: PushJob[]): Promise<void> {
  await Promise.all(jobs.map((j) => sendPushToUser(j.userId, { title: j.title, body: j.body, url: j.url })));
}

/** Caso comum: fora de transação (ou com ela já resolvida) — insere e manda o push na hora. */
export async function notifyUser(tx: DbOrTx, input: NotifyInput): Promise<void> {
  const job = await insertNotification(tx, input);
  if (job) await flushPushJobs([job]);
}

export async function notifyUsers(tx: DbOrTx, inputs: NotifyInput[]): Promise<void> {
  const jobs = await insertNotifications(tx, inputs);
  await flushPushJobs(jobs);
}
