import 'server-only';
import { inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { notificationPreferences, notifications } from '@/db/schema';
import { sendPushToUser } from './push';
import { categoryOf, isEssentialCategory } from './categories';

/**
 * Ponto único de inserção de notificação (Fase 19; preferências e
 * idempotência na Fase 21).
 *
 * Antes da Fase 19, cada action fazia `db.insert(notifications)` direto —
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
 *     chama despacha o push só depois que a transação comitou.
 *
 * Fase 21, aqui dentro e não em cada chamador:
 *   - PREFERÊNCIAS: categoria desligada na central não é gravada (nem vai
 *     por push); push desligado grava só na central. Categoria essencial
 *     (reservas, pagamentos, conta) ignora preferência — sempre entrega.
 *   - IDEMPOTÊNCIA: com `dedupeKey`, o mesmo evento processado de novo não
 *     gera segunda notificação nem segundo push (índice único + ON CONFLICT).
 */

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type NotifyInput = Omit<typeof notifications.$inferInsert, 'id' | 'createdAt' | 'readAt' | 'emailSentAt'>;

export type PushJob = { userId: string; title: string; body: string; url: string };

type Decisao = { inApp: boolean; push: boolean };

function toPushJob(input: NotifyInput): PushJob | null {
  if (!input.linkPath) return null;
  return { userId: input.userId, title: input.title, body: input.body ?? '', url: input.linkPath };
}

/** Lê as preferências de quem vai receber (uma consulta para o lote inteiro). */
async function decidir(tx: DbOrTx, inputs: NotifyInput[]): Promise<Decisao[]> {
  const opcionais = inputs.filter((i) => !isEssentialCategory(categoryOf(i.type)));
  if (opcionais.length === 0) return inputs.map(() => ({ inApp: true, push: true }));

  const prefs = await tx
    .select({
      userId: notificationPreferences.userId,
      category: notificationPreferences.category,
      inApp: notificationPreferences.inApp,
      push: notificationPreferences.push,
    })
    .from(notificationPreferences)
    .where(inArray(notificationPreferences.userId, [...new Set(opcionais.map((i) => i.userId))]));
  const mapa = new Map(prefs.map((p) => [`${p.userId}:${p.category}`, p]));

  return inputs.map((i) => {
    const categoria = categoryOf(i.type);
    if (isEssentialCategory(categoria)) return { inApp: true, push: true };
    const p = mapa.get(`${i.userId}:${categoria}`);
    const inApp = p?.inApp ?? true; // sem linha = padrão ligado
    return { inApp, push: inApp && (p?.push ?? true) };
  });
}

/**
 * Grava respeitando preferência e idempotência; devolve os push a mandar
 * (só das notificações que de fato entraram e têm push permitido).
 */
async function gravar(tx: DbOrTx, inputs: NotifyInput[]): Promise<PushJob[]> {
  if (inputs.length === 0) return [];
  const decisoes = await decidir(tx, inputs);
  const aceitas = inputs.map((input, i) => ({ input, d: decisoes[i] })).filter((x) => x.d.inApp);
  if (aceitas.length === 0) return [];

  const jobs: PushJob[] = [];
  const semChave = aceitas.filter((x) => !x.input.dedupeKey);
  const comChave = aceitas.filter((x) => x.input.dedupeKey);

  if (semChave.length > 0) {
    await tx.insert(notifications).values(semChave.map((x) => x.input));
    for (const x of semChave) {
      const job = x.d.push ? toPushJob(x.input) : null;
      if (job) jobs.push(job);
    }
  }

  // Com chave, uma a uma: só assim se sabe exatamente quais entraram e
  // quais já existiam (e essas não podem gerar push de novo).
  for (const x of comChave) {
    const inserida = await tx
      .insert(notifications)
      .values(x.input)
      .onConflictDoNothing({
        target: [notifications.userId, notifications.dedupeKey],
        where: sql`dedupe_key IS NOT NULL`,
      })
      .returning({ id: notifications.id });
    if (inserida.length > 0 && x.d.push) {
      const job = toPushJob(x.input);
      if (job) jobs.push(job);
    }
  }

  return jobs;
}

/** Insere sem mandar push ainda — devolve o job pra `flushPushJobs` depois do commit. */
export async function insertNotification(tx: DbOrTx, input: NotifyInput): Promise<PushJob | null> {
  const [job] = await gravar(tx, [input]);
  return job ?? null;
}

export async function insertNotifications(tx: DbOrTx, inputs: NotifyInput[]): Promise<PushJob[]> {
  return gravar(tx, inputs);
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
