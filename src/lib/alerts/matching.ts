import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { notifyUser } from '@/lib/notifications/dispatch';
import { settingInt } from '@/lib/settings';
import { HOJE_BR_SQL, todayInSaoPaulo } from '@/lib/dates';
import { earliestStartFrom } from '@/lib/search/match';
import { alertCriteriaSchema, alertSearchHref, spaceMatchesAlert } from './criteria';

/**
 * Alertas de busca salva → notificação (Fase 23).
 *
 * 1. Um anúncio é publicado pela PRIMEIRA vez (não "voltou do pausado":
 *    isso é para favoritos e lista de espera).
 * 2. Os alertas candidatos saem do banco por tipo e preço; o resto dos
 *    critérios (bairro, cidade, raio, características, área, "para começar
 *    já") é conferido um a um em `spaceMatchesAlert`. Só entra quem atende
 *    a TODOS — nunca "qualquer anúncio".
 * 3. Cada par (alerta, anúncio) vira uma linha em `saved_search_matches`
 *    (chave única: o mesmo anúncio nunca é avisado duas vezes pelo mesmo
 *    alerta).
 * 4. Aviso com intervalo mínimo por alerta (Premium 1 h, gratuito 24 h,
 *    em `platform_settings`). O que chegar no meio-tempo fica na fila e vem
 *    junto no aviso seguinte — "Encontramos 4 novos espaços…" — disparado
 *    pela próxima publicação que bater ou pelo cron diário.
 *
 * Nunca lança: falhar aqui não pode derrubar a publicação de ninguém.
 */

const MAX_CANDIDATOS = 5_000;

type Candidato = {
  id: string;
  user_id: string;
  criteria: unknown;
  distance: number | null;
};

type EspacoNovo = {
  id: string;
  owner_id: string;
  type: string;
  city: string | null;
  district: string | null;
  price_monthly_cents: number;
  size_m2: string | null;
  available_from: string | null;
  upcoming_blocks: { startsOn: string; endsOn: string }[] | null;
  feature_keys: string[];
};

/** Liga o anúncio aos alertas que ele atende. Devolve quem tem alerta que bateu (para não receber aviso repetido). */
export async function matchNewSpaceToAlerts(spaceId: string): Promise<{ userIds: string[]; alertIds: string[] }> {
  try {
    const [espaco] = (await db.execute(sql`
      SELECT s.id, s.owner_id, s.type::text AS type, s.city, s.district, s.price_monthly_cents,
        s.size_m2::text AS size_m2, s.available_from::text AS available_from,
        (SELECT json_agg(json_build_object('startsOn', b.starts_on::text, 'endsOn', b.ends_on::text) ORDER BY b.starts_on)
          FROM space_availability_blocks b
          WHERE b.space_id = s.id AND b.cancelled_at IS NULL AND b.ends_on >= ${sql.raw(HOJE_BR_SQL)}) AS upcoming_blocks,
        COALESCE((SELECT array_agg(sf.feature_key) FROM space_features sf WHERE sf.space_id = s.id), '{}') AS feature_keys
      FROM spaces s
      WHERE s.id = ${spaceId} AND s.status = 'published' AND s.deleted_at IS NULL
    `)) as unknown as EspacoNovo[];
    if (!espaco) return { userIds: [], alertIds: [] };

    const candidatos = (await db.execute(sql`
      SELECT ss.id, ss.user_id, ss.criteria,
        CASE WHEN jsonb_typeof(ss.criteria->'ponto') = 'object' THEN
          ST_Distance(
            s.approx_location::geography,
            ST_SetSRID(ST_MakePoint(
              (ss.criteria->'ponto'->>'lng')::float8, (ss.criteria->'ponto'->>'lat')::float8
            ), 4326)::geography)
        END AS distance
      FROM saved_searches ss
      JOIN profiles p ON p.id = ss.user_id AND p.status = 'active'
      JOIN spaces s ON s.id = ${spaceId}
      WHERE ss.status = 'active'
        AND ss.user_id <> s.owner_id
        AND CASE WHEN jsonb_typeof(ss.criteria->'tipos') = 'array' AND jsonb_array_length(ss.criteria->'tipos') > 0
              THEN ss.criteria->'tipos' ? s.type::text ELSE true END
        AND CASE WHEN jsonb_typeof(ss.criteria->'precoMaxCents') = 'number'
              THEN (ss.criteria->>'precoMaxCents')::numeric >= s.price_monthly_cents ELSE true END
        AND CASE WHEN jsonb_typeof(ss.criteria->'precoMinCents') = 'number'
              THEN (ss.criteria->>'precoMinCents')::numeric <= s.price_monthly_cents ELSE true END
        AND NOT EXISTS (
          SELECT 1 FROM user_blocks ub
          WHERE (ub.blocker_id = ss.user_id AND ub.blocked_id = s.owner_id)
             OR (ub.blocker_id = s.owner_id AND ub.blocked_id = ss.user_id)
        )
      LIMIT ${MAX_CANDIDATOS}
    `)) as unknown as Candidato[];

    const hoje = todayInSaoPaulo();
    const alvo = {
      type: espaco.type,
      city: espaco.city,
      district: espaco.district,
      priceMonthlyCents: espaco.price_monthly_cents,
      featureKeys: espaco.feature_keys ?? [],
      sizeM2: espaco.size_m2,
      earliestStart: earliestStartFrom(espaco.available_from, espaco.upcoming_blocks ?? [], hoje),
    };

    const bateram: Candidato[] = [];
    for (const c of candidatos) {
      const criterios = alertCriteriaSchema.safeParse(c.criteria);
      if (!criterios.success) continue; // critério adulterado por fora: ignora, não executa lixo
      const distancia = c.distance == null ? null : Number(c.distance);
      if (spaceMatchesAlert({ ...alvo, distanceMeters: distancia }, criterios.data, hoje)) bateram.push(c);
    }
    if (bateram.length === 0) return { userIds: [], alertIds: [] };

    const novos = (await db.execute(sql`
      INSERT INTO saved_search_matches (saved_search_id, space_id)
      SELECT unnest(${`{${bateram.map((b) => b.id).join(',')}}`}::uuid[]), ${spaceId}::uuid
      ON CONFLICT DO NOTHING
      RETURNING saved_search_id
    `)) as unknown as { saved_search_id: string }[];

    const alertIds = [...new Set(novos.map((n) => n.saved_search_id))];
    await deliverPendingAlerts({ alertIds });
    return { userIds: [...new Set(bateram.map((b) => b.user_id))], alertIds };
  } catch (err) {
    console.error('[alertas] falha ao cruzar anúncio novo com alertas:', err);
    return { userIds: [], alertIds: [] };
  }
}

type AlertaDevido = {
  id: string;
  user_id: string;
  label: string;
  criteria: unknown;
  premium: boolean;
};

/**
 * Manda o aviso de cada alerta que tem anúncio na fila e já passou do
 * intervalo mínimo. Sem `alertIds`, varre todos (cron diário).
 */
export async function deliverPendingAlerts(opts?: { alertIds?: string[] }): Promise<{ sent: number }> {
  let sent = 0;
  try {
    if (opts?.alertIds && opts.alertIds.length === 0) return { sent };
    const [horasFree, horasPremium] = await Promise.all([
      settingInt('alerts.digest_hours_free', 24),
      settingInt('alerts.digest_hours_premium', 1),
    ]);

    const filtro = opts?.alertIds
      ? sql`AND ss.id = ANY(${`{${opts.alertIds.join(',')}}`}::uuid[])`
      : sql``;
    const devidos = (await db.execute(sql`
      SELECT ss.id, ss.user_id, ss.label, ss.criteria,
        EXISTS (SELECT 1 FROM premium_memberships pm WHERE pm.user_id = ss.user_id AND pm.status = 'active') AS premium
      FROM saved_searches ss
      WHERE ss.status = 'active' ${filtro}
        AND EXISTS (
          SELECT 1 FROM saved_search_matches m
          JOIN spaces s ON s.id = m.space_id AND s.status = 'published' AND s.deleted_at IS NULL
          WHERE m.saved_search_id = ss.id AND m.notified_at IS NULL
        )
    `)) as unknown as AlertaDevido[];

    for (const alerta of devidos) {
      const horas = alerta.premium ? horasPremium : horasFree;
      // Trava: só um processo manda o aviso deste alerta, e só se o
      // intervalo mínimo já passou. Quem perde a corrida não manda nada.
      const [liberado] = (await db.execute(sql`
        UPDATE saved_searches SET last_notified_at = now()
        WHERE id = ${alerta.id} AND status = 'active'
          AND (last_notified_at IS NULL OR last_notified_at <= now() - make_interval(hours => ${horas}))
        RETURNING id
      `)) as unknown as { id: string }[];
      if (!liberado) continue;

      const itens = (await db.execute(sql`
        UPDATE saved_search_matches m SET notified_at = now()
        FROM spaces s
        WHERE m.saved_search_id = ${alerta.id} AND m.notified_at IS NULL AND s.id = m.space_id
        RETURNING m.space_id, s.slug, s.title, (s.status = 'published' AND s.deleted_at IS NULL) AS vivo
      `)) as unknown as { space_id: string; slug: string; title: string; vivo: boolean }[];
      const vivos = itens.filter((i) => i.vivo);
      if (vivos.length === 0) continue;

      const criterios = alertCriteriaSchema.safeParse(alerta.criteria);
      const linkLista = criterios.success ? alertSearchHref(criterios.data) : '/alertas';
      const unico = vivos.length === 1 ? vivos[0]! : null;

      await notifyUser(db, {
        userId: alerta.user_id,
        type: 'saved_search_match',
        title: unico ? 'Novo espaço no seu alerta' : 'Novos espaços no seu alerta',
        body: unico
          ? `"${unico.title}" combina com o seu alerta ${alerta.label}.`
          : `Encontramos ${vivos.length} novos espaços que combinam com o seu alerta ${alerta.label}.`,
        linkPath: unico ? `/espacos/${unico.slug}` : linkLista,
        data: { savedSearchId: alerta.id, spaceIds: vivos.map((v) => v.space_id) },
        dedupeKey: unico
          ? `saved_search:${alerta.id}:${unico.space_id}`
          : `saved_search:${alerta.id}:lote:${vivos.map((v) => v.space_id).sort().join(',').slice(0, 180)}`,
      });
      sent++;
    }
  } catch (err) {
    console.error('[alertas] falha ao entregar avisos de alerta:', err);
  }
  return { sent };
}

/** Cron diário: esvazia as filas que já passaram do intervalo. */
export async function runSavedSearchDigest(): Promise<{ sent: number }> {
  return deliverPendingAlerts();
}
