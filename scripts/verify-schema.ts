/**
 * Verificacao do schema contra um Postgres real.
 *
 * Nao e um teste de UI: e a prova de que as regras que dizemos existir no banco
 * REALMENTE bloqueiam dado invalido. Roda contra o banco apontado por
 * DATABASE_URL e limpa tudo o que cria ao final.
 *
 *   pnpm tsx scripts/verify-schema.ts
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: ['.env.local', '.env'], quiet: true });

import postgres from 'postgres';
import { computeBookingAmounts, platformNetCents, formatBRL, parseBRLToCents } from '../src/lib/money';
import { PG_CONNECTION_PARAMS } from '../src/db/connection';
import { garantirUnidadePadrao } from './lib/unidades';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL nao definida.');
const sql = postgres(url, { max: 1, onnotice: () => {}, connection: PG_CONNECTION_PARAMS });

let passed = 0;
let failed = 0;

function ok(name: string, detail = '') {
  passed++;
  console.log(`  \x1b[32m✓\x1b[0m ${name}${detail ? ` \x1b[2m${detail}\x1b[0m` : ''}`);
}
function bad(name: string, detail: string) {
  failed++;
  console.log(`  \x1b[31m✗\x1b[0m ${name}\n      ${detail}`);
}

/** Espera que o bloco FALHE. Se passar, a regra nao esta protegendo nada. */
async function mustReject(name: string, fn: () => Promise<unknown>, expectFragment: string) {
  try {
    await fn();
    bad(name, 'o banco ACEITOU um dado que deveria ter sido rejeitado');
  } catch (err) {
    // Recusa por trigger (RAISE ... CONSTRAINT = '...') traz o nome da regra
    // em `constraint_name`, não na mensagem — os dois contam.
    const regra = (err as { constraint_name?: string }).constraint_name ?? '';
    const msg = `${err instanceof Error ? err.message : String(err)}${regra ? ` [${regra}]` : ''}`;
    if (msg.toLowerCase().includes(expectFragment.toLowerCase())) {
      ok(name, `bloqueado por: ${expectFragment}`);
    } else {
      bad(name, `rejeitou, mas por outro motivo: ${msg.slice(0, 160)}`);
    }
  }
}

function expectEqual(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) ok(name, JSON.stringify(actual));
  else bad(name, `esperava ${JSON.stringify(expected)}, veio ${JSON.stringify(actual)}`);
}

async function mustAccept(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    ok(name);
  } catch (err) {
    bad(name, err instanceof Error ? err.message : String(err));
  }
}

async function main() {
  const tag = `verify-${Date.now()}`;
  const ownerId = crypto.randomUUID();
  const renterId = crypto.randomUUID();
  const strangerId = crypto.randomUUID();
  const confirmedId = crypto.randomUUID();
  let spaceId = '';
  let bookingId = '';
  let unidadePrincipal: { groupId: string; unitIds: string[] } = { groupId: '', unitIds: [] };

  try {
    console.log('\n\x1b[1m1. Aritmetica de dinheiro (pura, sem banco)\x1b[0m');
    {
      // Taxas vigentes da plataforma: 3% de cada lado.
      const a = computeBookingAmounts(10_000, { renterFeeBps: 300, ownerFeeBps: 300 });
      const expected = {
        renterFeeCents: 300,
        ownerFeeCents: 300,
        totalChargedCents: 10_300,
        ownerPayoutCents: 9_700,
        platformGrossCents: 600,
      };
      const mismatch = Object.entries(expected).filter(
        ([k, v]) => a[k as keyof typeof expected] !== v,
      );
      if (mismatch.length === 0) {
        ok('R$100 a 3%+3%', 'paga R$103,00 · recebe R$97,00 · bruto R$6,00');
      } else {
        bad('R$100 a 3%+3%', JSON.stringify(mismatch));
      }

      // A tarifa do gateway sai antes do split e e absorvida pela plataforma.
      const pix = platformNetCents(a, 199);
      const card = platformNetCents(a, Math.round(10_300 * 0.0299) + 49);
      ok('receita liquida calculada', `Pix ${formatBRL(pix)} · cartao ${formatBRL(card)}`);

      /*
       * Abaixo do ponto de equilibrio a plataforma perde dinheiro. Isso nao e
       * bug: e a razao de existir o aluguel minimo em platform_settings.
       * A R$ 30,00 (abaixo do minimo de R$ 35,00) o Pix ja fica negativo.
       */
      const small = computeBookingAmounts(3_000, { renterFeeBps: 300, ownerFeeBps: 300 });
      const smallPix = platformNetCents(small, 199);
      if (smallPix < 0) {
        ok('abaixo do minimo da prejuizo no Pix', `R$30,00/mes → ${formatBRL(smallPix)}`);
      } else {
        bad('ponto de equilibrio', `esperava prejuizo a R$30, deu ${formatBRL(smallPix)}`);
      }

      // E no minimo configurado (R$ 35,00) ja e positivo nos dois meios.
      const min = computeBookingAmounts(3_500, { renterFeeBps: 300, ownerFeeBps: 300 });
      const minPix = platformNetCents(min, 199);
      const minCard = platformNetCents(min, Math.round(min.totalChargedCents * 0.0299) + 49);
      if (minPix >= 0 && minCard >= 0) {
        ok('no minimo de R$35 nao ha prejuizo', `Pix ${formatBRL(minPix)} · cartao ${formatBRL(minCard)}`);
      } else {
        bad('minimo de R$35', `Pix ${formatBRL(minPix)} · cartao ${formatBRL(minCard)}`);
      }

      const parsed = ['1.500,50', '1500.50', 'R$ 1.500', '99,9'].map(parseBRLToCents);
      if (JSON.stringify(parsed) === JSON.stringify([150_050, 150_050, 150_000, 9_990])) {
        ok('parse de valor digitado', '1.500,50 / 1500.50 / R$ 1.500 / 99,9');
      } else {
        bad('parse de valor digitado', JSON.stringify(parsed));
      }

      try {
        computeBookingAmounts(10_000, { renterFeeBps: 200, ownerFeeBps: 10_000 });
        bad('taxa de 100% rejeitada', 'aceitou taxa de 100%');
      } catch {
        ok('taxa de 100% rejeitada');
      }
    }

    console.log('\n\x1b[1m2. Identidade e criacao automatica de perfil\x1b[0m');
    await sql`INSERT INTO auth.users (id, email) VALUES
      (${ownerId}, ${`owner-${tag}@example.com`}),
      (${renterId}, ${`renter-${tag}@example.com`}),
      (${strangerId}, ${`stranger-${tag}@example.com`})`;
    const profs = await sql<{ id: string }[]>`
      SELECT id FROM profiles WHERE id IN (${ownerId}, ${renterId}, ${strangerId})`;
    if (profs.length === 3) ok('trigger criou 3 perfis a partir de auth.users');
    else bad('trigger de perfil', `esperava 3 perfis, achou ${profs.length}`);

    await sql`UPDATE profiles SET role = 'owner' WHERE id = ${ownerId}`;

    console.log('\n\x1b[1m3. Espacos e geolocalizacao\x1b[0m');
    // Centro de Colatina/ES.
    // Publicado exige anuncio completo (spaces_published_requires_complete):
    // bairro, titulo com 10+ caracteres, descricao e data de disponibilidade.
    /*
     * Publicar acontece em duas etapas de proposito: o trigger
     * `spaces_publish_requires_photos` exige as fotos, e foto so existe
     * depois que o anuncio existe. Inserir um anuncio ja publicado, sem
     * passar por rascunho, e impossivel — e e assim que tem que ser.
     */
    const [space] = await sql<{ id: string }[]>`
      INSERT INTO spaces (owner_id, slug, type, status, title, description,
                          district, city, state, available_from,
                          price_monthly_cents, location)
      VALUES (${ownerId}, ${`garagem-${tag}`}, 'garagem', 'draft',
              'Garagem coberta perto do centro',
              'Garagem fechada com portao automatico, cabe um carro medio.',
              'Centro', 'Colatina', 'ES', CURRENT_DATE, 18000,
              ST_SetSRID(ST_MakePoint(-40.6295, -19.5386), 4326))
      RETURNING id`;
    spaceId = space.id;

    for (const n of [0, 1, 2]) {
      await sql`INSERT INTO space_images (space_id, storage_path, position)
                VALUES (${spaceId}, ${`${ownerId}/${spaceId}/f${n}.jpg`}, ${n})`;
    }
    // Parte 12: publicar exige unidade alugável (trigger spaces_publish_requires_units).
    const unidade = await garantirUnidadePadrao(sql, spaceId);
    unidadePrincipal = unidade;
    await sql`UPDATE spaces SET status='published', published_at=now() WHERE id=${spaceId}`;
    ok('anuncio publicado com coordenada');

    /*
     * Este anuncio esta COMPLETO em tudo — bairro, titulo, descricao, data —
     * e falta so a coordenada. Isolar assim e o que prova que a regra de
     * localizacao existe por si: com campos faltando, a constraint de
     * completude dispararia antes e o teste passaria pelo motivo errado.
     */
    const [semGeo] = await sql<{ id: string }[]>`
      INSERT INTO spaces (owner_id, slug, type, status, title, description,
                          district, city, state, available_from, price_monthly_cents)
      VALUES (${ownerId}, ${`sem-geo-${tag}`}, 'deposito', 'draft',
              'Deposito sem coordenada',
              'Deposito completo em tudo, menos o ponto no mapa.',
              'Centro', 'Colatina', 'ES', CURRENT_DATE, 10000)
      RETURNING id`;
    for (const n of [0, 1, 2]) {
      await sql`INSERT INTO space_images (space_id, storage_path, position)
                VALUES (${semGeo.id}, ${`${ownerId}/${semGeo.id}/f${n}.jpg`}, ${n})`;
    }

    // Com unidade, para que a única coisa faltando seja mesmo a coordenada.
    await garantirUnidadePadrao(sql, semGeo.id);
    await mustReject(
      'publicar sem coordenada e bloqueado',
      () => sql`UPDATE spaces SET status='published' WHERE id=${semGeo.id}`,
      'spaces_published_requires_location',
    );

    await mustReject(
      'preco negativo e bloqueado',
      () => sql`
        INSERT INTO spaces (owner_id, slug, type, title, price_monthly_cents)
        VALUES (${ownerId}, ${`negativo-${tag}`}, 'deposito', 'Preco negativo', -500)`,
      'spaces_price_positive',
    );

    // ~1,2 km do ponto do anuncio.
    const near = await sql<{ id: string; dist: number }[]>`
      SELECT id, ST_Distance(location::geography,
                             ST_SetSRID(ST_MakePoint(-40.6400, -19.5450), 4326)::geography) AS dist
      FROM spaces
      WHERE id = ${spaceId}
        AND ST_DWithin(location::geography,
                       ST_SetSRID(ST_MakePoint(-40.6400, -19.5450), 4326)::geography, 2000)`;
    if (near.length === 1) ok('busca por raio de 2 km encontra', `${Math.round(near[0].dist)} m`);
    else bad('busca por raio', 'nao encontrou o espaco dentro de 2 km');

    const far = await sql`
      SELECT id FROM spaces WHERE id = ${spaceId}
        AND ST_DWithin(location::geography,
                       ST_SetSRID(ST_MakePoint(-43.9345, -19.9167), 4326)::geography, 5000)`;
    if (far.length === 0) ok('espaco em Colatina nao aparece em busca em BH');
    else bad('busca por raio', 'retornou espaco a 300 km de distancia');

    const plan = await sql<{ 'QUERY PLAN': string }[]>`
      EXPLAIN SELECT id FROM spaces
      WHERE ST_DWithin(location::geography,
                       ST_SetSRID(ST_MakePoint(-40.64, -19.54), 4326)::geography, 2000)`;
    const planText = plan.map((r) => r['QUERY PLAN']).join(' ');
    // Em tabela minuscula o planner prefere seq scan; o que importa e o indice existir.
    const gistExists = await sql`
      SELECT 1 FROM pg_indexes WHERE indexname = 'spaces_location_gix'`;
    if (gistExists.length === 1) {
      ok('indice GIST existe para a expressao usada', planText.includes('Index') ? 'plano usa indice' : 'plano seq (tabela pequena)');
    } else {
      bad('indice GIST', 'nao encontrado');
    }

    console.log('\n\x1b[1m4. Invariantes de dinheiro na reserva\x1b[0m');
    const amounts = computeBookingAmounts(18_000, { renterFeeBps: 300, ownerFeeBps: 300 });

    await mustAccept('reserva com valores coerentes e aceita', async () => {
      const [b] = await sql<{ id: string }[]>`
        INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, start_date,
          group_id, unit_id,
          monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
          owner_fee_cents, total_charged_cents, owner_payout_cents)
        VALUES (${`MP-${tag.slice(-6).toUpperCase()}`}, ${spaceId}, ${renterId}, ${ownerId},
          'active', CURRENT_DATE, ${unidadePrincipal.groupId}, ${unidadePrincipal.unitIds[0]!},
          ${amounts.monthlyRentCents}, ${amounts.renterFeeBps},
          ${amounts.ownerFeeBps}, ${amounts.renterFeeCents}, ${amounts.ownerFeeCents},
          ${amounts.totalChargedCents}, ${amounts.ownerPayoutCents})
        RETURNING id`;
      bookingId = b.id;
      return b;
    });

    await mustReject(
      'total adulterado e bloqueado pelo banco',
      () => sql`
        INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, start_date,
          monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
          owner_fee_cents, total_charged_cents, owner_payout_cents)
        VALUES (${`MP-FRAUD-${tag.slice(-4)}`}, ${spaceId}, ${renterId}, ${ownerId},
          'requested', CURRENT_DATE, 18000, 300, 300, 540, 540, 100, 17460)`,
      'bookings_total_matches',
    );

    await mustReject(
      'alugar o proprio espaco e bloqueado',
      () => sql`
        INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, start_date,
          monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
          owner_fee_cents, total_charged_cents, owner_payout_cents)
        VALUES (${`MP-SELF-${tag.slice(-4)}`}, ${spaceId}, ${ownerId}, ${ownerId},
          'requested', CURRENT_DATE, 18000, 300, 300, 540, 540, 18540, 17460)`,
      'bookings_distinct_parties',
    );

    // Parte 12: a trava é por UNIDADE (restrição de exclusão), não por espaço.
    await mustReject(
      'duas locacoes vigentes na mesma unidade e bloqueado',
      () => sql`
        INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, start_date,
          group_id, unit_id,
          monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
          owner_fee_cents, total_charged_cents, owner_payout_cents)
        VALUES (${`MP-DUP-${tag.slice(-4)}`}, ${spaceId}, ${strangerId}, ${ownerId},
          'active', CURRENT_DATE, ${unidadePrincipal.groupId}, ${unidadePrincipal.unitIds[0]!},
          18000, 300, 300, 540, 540, 18540, 17460)`,
      'bookings_unit_no_overlap',
    );
    await mustReject(
      'reserva que ocupa sem unidade e bloqueada',
      () => sql`
        INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, start_date,
          monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
          owner_fee_cents, total_charged_cents, owner_payout_cents)
        VALUES (${`MP-SEMU-${tag.slice(-4)}`}, ${spaceId}, ${strangerId}, ${ownerId},
          'approved', CURRENT_DATE + 400, 18000, 300, 300, 540, 540, 18540, 17460)`,
      'bookings_occupying_has_unit',
    );

    console.log('\n\x1b[1m5. Avaliacoes\x1b[0m');
    await mustReject(
      'avaliar locacao ainda em andamento e bloqueado',
      () => sql`
        INSERT INTO reviews (booking_id, kind, author_id, space_id, rating, comment)
        VALUES (${bookingId}, 'renter_to_space', ${renterId}, ${spaceId}, 5, 'otimo')`,
      'apos o encerramento',
    );

    await sql`UPDATE bookings SET status = 'ended', ended_at = now() WHERE id = ${bookingId}`;

    await mustReject(
      'avaliar locacao de terceiro e bloqueado',
      () => sql`
        INSERT INTO reviews (booking_id, kind, author_id, space_id, rating, comment)
        VALUES (${bookingId}, 'renter_to_space', ${strangerId}, ${spaceId}, 1, 'fake')`,
      'Apenas o locatario',
    );

    await mustAccept(
      'locatario avalia apos o encerramento',
      () => sql`
        INSERT INTO reviews (booking_id, kind, author_id, space_id, rating, comment)
        VALUES (${bookingId}, 'renter_to_space', ${renterId}, ${spaceId}, 5, 'Espaco limpo e seguro.')`,
    );

    await mustReject(
      'avaliar duas vezes a mesma locacao e bloqueado',
      () => sql`
        INSERT INTO reviews (booking_id, kind, author_id, space_id, rating, comment)
        VALUES (${bookingId}, 'renter_to_space', ${renterId}, ${spaceId}, 1, 'mudei de ideia')`,
      'reviews_booking_author_kind_key',
    );

    await mustReject(
      'nota fora de 1..5 e bloqueada',
      () => sql`
        INSERT INTO reviews (booking_id, kind, author_id, target_user_id, rating)
        VALUES (${bookingId}, 'owner_to_renter', ${ownerId}, ${renterId}, 9)`,
      'reviews_rating_range',
    );

    const [rated] = await sql<{ rating_avg: string; rating_count: number }[]>`
      SELECT rating_avg, rating_count FROM spaces WHERE id = ${spaceId}`;
    if (Number(rated.rating_avg) === 5 && rated.rating_count === 1) {
      ok('media do anuncio atualizada por trigger', `${rated.rating_avg} (${rated.rating_count})`);
    } else {
      bad('media do anuncio', `avg=${rated.rating_avg} count=${rated.rating_count}`);
    }

    console.log('\n\x1b[1m6. Livro-razao e auditoria sao append-only\x1b[0m');
    const [entry] = await sql<{ id: string }[]>`
      INSERT INTO ledger_entries (type, booking_id, user_id, amount_cents, description)
      VALUES ('platform_fee_renter', ${bookingId}, NULL, ${amounts.renterFeeCents}, 'taxa do locatario')
      RETURNING id`;
    ok('lancamento inserido no livro-razao');

    await mustReject(
      'alterar lancamento passado e bloqueado',
      () => sql`UPDATE ledger_entries SET amount_cents = 1 WHERE id = ${entry.id}`,
      'append-only',
    );
    await mustReject(
      'apagar lancamento passado e bloqueado',
      () => sql`DELETE FROM ledger_entries WHERE id = ${entry.id}`,
      'append-only',
    );

    console.log('\n\x1b[1m7. Idempotencia de webhook\x1b[0m');
    await sql`
      INSERT INTO webhook_events (provider, provider_event_id, event_type, payload)
      VALUES ('asaas', ${`evt_${tag}`}, 'PAYMENT_RECEIVED', '{"ok":true}'::jsonb)`;
    await mustReject(
      'mesmo evento entregue duas vezes e recusado',
      () => sql`
        INSERT INTO webhook_events (provider, provider_event_id, event_type, payload)
        VALUES ('asaas', ${`evt_${tag}`}, 'PAYMENT_RECEIVED', '{"ok":true}'::jsonb)`,
      'webhook_events_provider_event_key',
    );

    console.log('\n\x1b[1m8. Mensagens\x1b[0m');
    const [conv] = await sql<{ id: string }[]>`
      INSERT INTO conversations (space_id, renter_id, owner_id)
      VALUES (${spaceId}, ${renterId}, ${ownerId}) RETURNING id`;
    await sql`
      INSERT INTO messages (conversation_id, sender_id, body)
      VALUES (${conv.id}, ${renterId}, 'E possivel guardar uma moto aqui?')`;
    const [touched] = await sql<{ last_message_at: Date | null }[]>`
      SELECT last_message_at FROM conversations WHERE id = ${conv.id}`;
    if (touched.last_message_at) ok('trigger atualizou last_message_at da conversa');
    else bad('trigger de conversa', 'last_message_at continua nulo');

    await mustReject(
      'mensagem vazia e bloqueada',
      () => sql`INSERT INTO messages (conversation_id, sender_id, body)
                VALUES (${conv.id}, ${renterId}, '   ')`,
      'messages_body_not_empty',
    );

    console.log('\n\x1b[1m9. Reincidencia e suspensao automatica (Fase 11)\x1b[0m');
    {
      const [{ value: limiteRaw }] = await sql<{ value: string }[]>`
        SELECT value FROM platform_settings WHERE key = 'safety.auto_suspend_upheld_threshold'`;
      const limite = Number(limiteRaw);

      // strangerId comeca sem denuncia nenhuma — confirma o ponto de partida.
      const insertUpheld = () => sql`
        INSERT INTO reports (target_type, target_user_id, reporter_id, reason, status, upheld, resolved_at)
        VALUES ('user', ${strangerId}, ${renterId}, 'assedio', 'resolved', true, now())`;

      for (let i = 1; i < limite; i++) await insertUpheld();
      const [abaixoDoLimite] = await sql<{ upheld_report_count: number; status: string }[]>`
        SELECT upheld_report_count, status FROM profiles WHERE id = ${strangerId}`;
      if (abaixoDoLimite.upheld_report_count === limite - 1 && abaixoDoLimite.status === 'active') {
        ok('contador sobe por trigger, sem suspender antes do limite', `${limite - 1}/${limite}`);
      } else {
        bad('contador antes do limite', JSON.stringify(abaixoDoLimite));
      }

      await insertUpheld();
      const [noLimite] = await sql<{ upheld_report_count: number; status: string; status_reason: string | null }[]>`
        SELECT upheld_report_count, status, status_reason FROM profiles WHERE id = ${strangerId}`;
      if (noLimite.status === 'suspended' && noLimite.status_reason?.includes(String(limite))) {
        ok('suspensao automatica ao atingir o limite', `motivo: ${noLimite.status_reason}`);
      } else {
        bad('suspensao automatica', JSON.stringify(noLimite));
      }

      // Corrigir uma denuncia (upheld -> false) derruba o contador, mas a
      // suspensao ja aplicada NAO reverte sozinha — so um admin reativa.
      const [ultima] = await sql<{ id: string }[]>`
        SELECT id FROM reports WHERE target_user_id = ${strangerId} AND upheld = true
        ORDER BY created_at DESC LIMIT 1`;
      await sql`UPDATE reports SET upheld = false WHERE id = ${ultima.id}`;
      const [depoisDaCorrecao] = await sql<{ upheld_report_count: number; status: string }[]>`
        SELECT upheld_report_count, status FROM profiles WHERE id = ${strangerId}`;
      if (depoisDaCorrecao.upheld_report_count === limite - 1 && depoisDaCorrecao.status === 'suspended') {
        ok('suspensao automatica nao reverte sozinha', 'contador caiu, status continua suspenso');
      } else {
        bad('reversao da suspensao', JSON.stringify(depoisDaCorrecao));
      }
    }

    console.log('\n\x1b[1m10. Classificacao de padrao do espaco (Fase 16)\x1b[0m');

    await mustAccept(
      'insercao valida (8x0,45 + 6x0,25 + 7x0,15 + 5x0,15 = 6,90) e aceita',
      () => sql`
        INSERT INTO space_quality_assessments
          (space_id, requested_by, conservation_state, age_years, renovated_recently,
           photos_score, location_score, structure_score, extras_score, base_score,
           conservation_factor, age_factor, renovation_factor, final_score, classification,
           ai_conservation_state, ai_findings, explanation)
        VALUES
          (${spaceId}, ${ownerId}, 'bom', 10, false,
           8.00, 6.00, 7.00, 5.00, 6.90, 1.00, 1.00, 1.00, 6.90, 'medio',
           'bom', ${sql.json({ acabamento: 7, modernidade: 6, sinaisDeDesgaste: [], resumo: 'teste' })}, 'teste verify-schema')`,
    );

    await mustReject(
      'base_score que nao bate com os 4 componentes e bloqueado',
      () => sql`
        INSERT INTO space_quality_assessments
          (space_id, requested_by, conservation_state, age_years, renovated_recently,
           photos_score, location_score, structure_score, extras_score, base_score,
           conservation_factor, age_factor, renovation_factor, final_score, classification,
           ai_conservation_state, ai_findings, explanation)
        VALUES
          (${spaceId}, ${ownerId}, 'bom', 10, false,
           8.00, 6.00, 7.00, 5.00, 5.00, 1.00, 1.00, 1.00, 5.00, 'medio',
           'bom', ${sql.json({ acabamento: 7, modernidade: 6, sinaisDeDesgaste: [], resumo: 'teste' })}, 'teste')`,
      'sqa_base_score_matches_components',
    );

    await mustReject(
      'final_score que nao bate com base x fatores e bloqueado',
      () => sql`
        INSERT INTO space_quality_assessments
          (space_id, requested_by, conservation_state, age_years, renovated_recently,
           photos_score, location_score, structure_score, extras_score, base_score,
           conservation_factor, age_factor, renovation_factor, final_score, classification,
           ai_conservation_state, ai_findings, explanation)
        VALUES
          (${spaceId}, ${ownerId}, 'bom', 10, false,
           8.00, 6.00, 7.00, 5.00, 6.90, 1.05, 1.00, 1.00, 6.90, 'medio',
           'bom', ${sql.json({ acabamento: 7, modernidade: 6, sinaisDeDesgaste: [], resumo: 'teste' })}, 'teste')`,
      'sqa_final_score_matches_formula',
    );

    await mustReject(
      'classificacao incoerente com o score final e bloqueada',
      () => sql`
        INSERT INTO space_quality_assessments
          (space_id, requested_by, conservation_state, age_years, renovated_recently,
           photos_score, location_score, structure_score, extras_score, base_score,
           conservation_factor, age_factor, renovation_factor, final_score, classification,
           ai_conservation_state, ai_findings, explanation)
        VALUES
          (${spaceId}, ${ownerId}, 'bom', 10, false,
           8.00, 6.00, 7.00, 5.00, 6.90, 1.00, 1.00, 1.00, 6.90, 'luxo',
           'bom', ${sql.json({ acabamento: 7, modernidade: 6, sinaisDeDesgaste: [], resumo: 'teste' })}, 'teste')`,
      'sqa_classification_matches_score',
    );

    await mustReject(
      'fator de conservacao fora da tabela fixa e bloqueado',
      () => sql`
        INSERT INTO space_quality_assessments
          (space_id, requested_by, conservation_state, age_years, renovated_recently,
           photos_score, location_score, structure_score, extras_score, base_score,
           conservation_factor, age_factor, renovation_factor, final_score, classification,
           ai_conservation_state, ai_findings, explanation)
        VALUES
          (${spaceId}, ${ownerId}, 'bom', 10, false,
           8.00, 6.00, 7.00, 5.00, 6.90, 0.95, 1.00, 1.00, 6.56, 'medio',
           'bom', ${sql.json({ acabamento: 7, modernidade: 6, sinaisDeDesgaste: [], resumo: 'teste' })}, 'teste')`,
      'sqa_conservation_factor_valid',
    );

    await mustReject(
      'idade fora da faixa (0..200) e bloqueada',
      () => sql`
        INSERT INTO space_quality_assessments
          (space_id, requested_by, conservation_state, age_years, renovated_recently,
           photos_score, location_score, structure_score, extras_score, base_score,
           conservation_factor, age_factor, renovation_factor, final_score, classification,
           ai_conservation_state, ai_findings, explanation)
        VALUES
          (${spaceId}, ${ownerId}, 'bom', 999, false,
           8.00, 6.00, 7.00, 5.00, 6.90, 1.00, 1.00, 1.00, 6.90, 'medio',
           'bom', ${sql.json({ acabamento: 7, modernidade: 6, sinaisDeDesgaste: [], resumo: 'teste' })}, 'teste')`,
      'sqa_age_years_range',
    );

    await mustReject(
      'score de componente fora de 0..10 e bloqueado',
      () => sql`
        INSERT INTO space_quality_assessments
          (space_id, requested_by, conservation_state, age_years, renovated_recently,
           photos_score, location_score, structure_score, extras_score, base_score,
           conservation_factor, age_factor, renovation_factor, final_score, classification,
           ai_conservation_state, ai_findings, explanation)
        VALUES
          (${spaceId}, ${ownerId}, 'bom', 10, false,
           11.00, 6.00, 7.00, 5.00, 8.25, 1.00, 1.00, 1.00, 8.25, 'alto_padrao',
           'bom', ${sql.json({ acabamento: 7, modernidade: 6, sinaisDeDesgaste: [], resumo: 'teste' })}, 'teste')`,
      'sqa_photos_score_range',
    );

    console.log('\n\x1b[1m11. Sugestao de valor de aluguel (Fase 17)\x1b[0m');
    const sqaPriceCols = `
      (space_id, requested_by, conservation_state, age_years, renovated_recently,
       photos_score, location_score, structure_score, extras_score, base_score,
       conservation_factor, age_factor, renovation_factor, final_score, classification,
       ai_conservation_state, ai_findings, explanation,
       price_comparables_count, price_low_confidence, price_base_cents,
       price_score_factor_bps, price_extras_factor_bps,
       suggested_price_ideal_cents, suggested_price_min_cents, suggested_price_max_cents,
       price_market_warning)`;
    const sqaAiFindings = sql.json({ acabamento: 7, modernidade: 6, sinaisDeDesgaste: [], resumo: 'teste' });

    await mustAccept(
      'insercao valida com preco (base 1000,00 x medio 1,0 x extras 5,00->1,075) e aceita',
      () => sql`
        INSERT INTO space_quality_assessments ${sql.unsafe(sqaPriceCols)}
        VALUES
          (${spaceId}, ${ownerId}, 'bom', 10, false,
           5.00, 5.00, 5.00, 5.00, 5.00, 1.00, 1.00, 1.00, 5.00, 'medio',
           'bom', ${sqaAiFindings}, 'teste preco',
           5, false, 100000,
           10000, 10750,
           107500, 96750, 118250,
           null)`,
    );

    await mustReject(
      'preco ideal que nao bate com base x fatores e bloqueado',
      () => sql`
        INSERT INTO space_quality_assessments ${sql.unsafe(sqaPriceCols)}
        VALUES
          (${spaceId}, ${ownerId}, 'bom', 10, false,
           5.00, 5.00, 5.00, 5.00, 5.00, 1.00, 1.00, 1.00, 5.00, 'medio',
           'bom', ${sqaAiFindings}, 'teste',
           5, false, 100000,
           10000, 10750,
           999999, 96750, 118250,
           null)`,
      'sqa_price_ideal_matches_formula',
    );

    await mustReject(
      'preco minimo que nao bate com ideal x 0,90 e bloqueado',
      () => sql`
        INSERT INTO space_quality_assessments ${sql.unsafe(sqaPriceCols)}
        VALUES
          (${spaceId}, ${ownerId}, 'bom', 10, false,
           5.00, 5.00, 5.00, 5.00, 5.00, 1.00, 1.00, 1.00, 5.00, 'medio',
           'bom', ${sqaAiFindings}, 'teste',
           5, false, 100000,
           10000, 10750,
           107500, 1, 118250,
           null)`,
      'sqa_price_min_matches_formula',
    );

    await mustReject(
      'preco maximo que nao bate com ideal x 1,10 e bloqueado',
      () => sql`
        INSERT INTO space_quality_assessments ${sql.unsafe(sqaPriceCols)}
        VALUES
          (${spaceId}, ${ownerId}, 'bom', 10, false,
           5.00, 5.00, 5.00, 5.00, 5.00, 1.00, 1.00, 1.00, 5.00, 'medio',
           'bom', ${sqaAiFindings}, 'teste',
           5, false, 100000,
           10000, 10750,
           107500, 96750, 1,
           null)`,
      'sqa_price_max_matches_formula',
    );

    await mustReject(
      'fator de score que nao bate com a classificacao desta linha e bloqueado',
      () => sql`
        INSERT INTO space_quality_assessments ${sql.unsafe(sqaPriceCols)}
        VALUES
          (${spaceId}, ${ownerId}, 'bom', 10, false,
           5.00, 5.00, 5.00, 5.00, 5.00, 1.00, 1.00, 1.00, 5.00, 'medio',
           'bom', ${sqaAiFindings}, 'teste',
           5, false, 100000,
           7000, 10750,
           75250, 67725, 82775,
           null)`,
      'sqa_price_score_factor_matches_classification',
    );

    await mustReject(
      'fator de extras que nao bate com extras_score desta linha e bloqueado',
      () => sql`
        INSERT INTO space_quality_assessments ${sql.unsafe(sqaPriceCols)}
        VALUES
          (${spaceId}, ${ownerId}, 'bom', 10, false,
           5.00, 5.00, 5.00, 5.00, 5.00, 1.00, 1.00, 1.00, 5.00, 'medio',
           'bom', ${sqaAiFindings}, 'teste',
           5, false, 100000,
           10000, 11000,
           110000, 99000, 121000,
           null)`,
      'sqa_price_extras_factor_matches_score',
    );

    await mustReject(
      'colunas de preco preenchidas so em parte (nao todas juntas) e bloqueado',
      () => sql`
        INSERT INTO space_quality_assessments
          (space_id, requested_by, conservation_state, age_years, renovated_recently,
           photos_score, location_score, structure_score, extras_score, base_score,
           conservation_factor, age_factor, renovation_factor, final_score, classification,
           ai_conservation_state, ai_findings, explanation, price_base_cents)
        VALUES
          (${spaceId}, ${ownerId}, 'bom', 10, false,
           5.00, 5.00, 5.00, 5.00, 5.00, 1.00, 1.00, 1.00, 5.00, 'medio',
           'bom', ${sqaAiFindings}, 'teste', 100000)`,
      'sqa_price_columns_null_together',
    );

    await mustReject(
      'price_low_confidence que nao bate com a contagem real de comparaveis e bloqueado',
      () => sql`
        INSERT INTO space_quality_assessments
          (space_id, requested_by, conservation_state, age_years, renovated_recently,
           photos_score, location_score, structure_score, extras_score, base_score,
           conservation_factor, age_factor, renovation_factor, final_score, classification,
           ai_conservation_state, ai_findings, explanation,
           price_comparables_count, price_low_confidence)
        VALUES
          (${spaceId}, ${ownerId}, 'bom', 10, false,
           5.00, 5.00, 5.00, 5.00, 5.00, 1.00, 1.00, 1.00, 5.00, 'medio',
           'bom', ${sqaAiFindings}, 'teste', 10, true)`,
      'sqa_price_low_confidence_matches_count',
    );

    await mustReject(
      'alerta de mercado "acima_da_media" sem o preco realmente estar acima e bloqueado',
      () => sql`
        INSERT INTO space_quality_assessments ${sql.unsafe(sqaPriceCols)}
        VALUES
          (${spaceId}, ${ownerId}, 'bom', 10, false,
           5.00, 5.00, 5.00, 5.00, 5.00, 1.00, 1.00, 1.00, 5.00, 'medio',
           'bom', ${sqaAiFindings}, 'teste',
           5, false, 100000,
           10000, 10750,
           107500, 96750, 118250,
           'acima_da_media')`,
      'sqa_price_market_warning_matches',
    );

    await mustAccept(
      'alerta "acima_da_media" quando o preco de fato passa 1,5x da media (luxo + extras no maximo) e aceito',
      () => sql`
        INSERT INTO space_quality_assessments ${sql.unsafe(sqaPriceCols)}
        VALUES
          (${spaceId}, ${ownerId}, 'excelente', 10, false,
           10.00, 10.00, 10.00, 10.00, 10.00, 1.10, 1.10, 1.10, 10.00, 'luxo',
           'excelente', ${sqaAiFindings}, 'teste',
           5, false, 100000,
           15000, 11500,
           172500, 155250, 189750,
           'acima_da_media')`,
    );

    console.log('\n\x1b[1m12. Notificação push (Fase 19)\x1b[0m');
    // Sem CHECK nesta tabela — a unica regra de dado que o banco protege
    // sozinho e o endpoint nao se repetir (o resto e NOT NULL simples).
    {
      const endpointPush = `https://fcm.googleapis.com/fcm/send/verify-${tag}`;
      await mustAccept(
        'inscrição de push válida é aceita',
        () => sql`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
          VALUES (${ownerId}, ${endpointPush}, 'chave-p256dh-de-teste', 'chave-auth-de-teste')`,
      );
      await mustReject(
        'o mesmo endpoint duas vezes é bloqueado (uma inscrição por endpoint, quem repete é o navegador renovando)',
        () => sql`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
          VALUES (${renterId}, ${endpointPush}, 'outra-chave', 'outro-auth')`,
        'push_subscriptions_endpoint_key',
      );
    }

    console.log('\n\x1b[1m13. Proteção contra dano / caução (Fase 20)\x1b[0m');
    {
      await mustReject(
        'deposit_cents negativo na reserva é bloqueado',
        () => sql`UPDATE bookings SET deposit_cents = -100 WHERE id=${bookingId}`,
        'bookings_deposit_non_negative',
      );
      await mustAccept(
        'deposit_cents = 1 mês de aluguel na reserva é aceito',
        () => sql`UPDATE bookings SET deposit_cents = 18000 WHERE id=${bookingId}`,
      );

      // Espaço/reserva PRÓPRIOS desta seção (não os de cima): booking_deposits
      // exige uma caução por reserva, então cada INSERT de teste abaixo
      // precisa da sua própria reserva livre, nunca a $bookingId já ocupada.
      const [espacoCaucao] = await sql<{ id: string }[]>`
        INSERT INTO spaces (owner_id, slug, type, status, title, description,
                            district, city, state, available_from, price_monthly_cents, location)
        VALUES (${ownerId}, ${`caucao-${tag}`}, 'garagem', 'draft',
                'Garagem para teste de caução',
                'Descricao com mais de vinte caracteres para passar na regra do banco.',
                'Centro', 'Colatina', 'ES', CURRENT_DATE, 20000,
                ST_SetSRID(ST_MakePoint(-40.6295, -19.5386), 4326))
        RETURNING id`;
      const unidadeCaucao = await garantirUnidadePadrao(sql, espacoCaucao.id);
      const [bookingCaucao] = await sql<{ id: string }[]>`
        INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, start_date,
          group_id, unit_id,
          monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
          owner_fee_cents, total_charged_cents, owner_payout_cents, deposit_cents)
        VALUES (${`MP-${tag.slice(-6).toUpperCase()}D`}, ${espacoCaucao.id}, ${renterId}, ${ownerId},
          'approved', CURRENT_DATE, ${unidadeCaucao.groupId}, ${unidadeCaucao.unitIds[0]!},
          20000, 300, 300, 600, 600, 20600, 19400, 20000)
        RETURNING id`;
      const bookingCaucaoId = bookingCaucao.id;

      await mustReject(
        'amount_cents zero ou negativo é bloqueado',
        () => sql`INSERT INTO booking_deposits (booking_id, amount_cents, provider, provider_payment_id)
          VALUES (${bookingCaucaoId}, 0, 'asaas', ${`pay_verify_${tag}_1`})`,
        'booking_deposits_amount_positive',
      );

      await mustReject(
        'released_cents preenchido com release_status "held" é bloqueado (held exige os dois nulos)',
        () => sql`INSERT INTO booking_deposits (booking_id, amount_cents, provider, provider_payment_id, release_status, released_cents)
          VALUES (${bookingCaucaoId}, 20000, 'asaas', ${`pay_verify_${tag}_2`}, 'held', 0)`,
        'booking_deposits_release_amounts_consistent',
      );

      await mustReject(
        'release_status "released" com soma released+forfeited diferente do total é bloqueado',
        () => sql`INSERT INTO booking_deposits (booking_id, amount_cents, provider, provider_payment_id, release_status, released_cents, forfeited_cents)
          VALUES (${bookingCaucaoId}, 20000, 'asaas', ${`pay_verify_${tag}_3`}, 'released', 15000, 0)`,
        'booking_deposits_release_amounts_consistent',
      );

      await mustReject(
        'release_status "released" com forfeited_cents > 0 é bloqueado (released não retém nada, por definição)',
        () => sql`INSERT INTO booking_deposits (booking_id, amount_cents, provider, provider_payment_id, release_status, released_cents, forfeited_cents)
          VALUES (${bookingCaucaoId}, 20000, 'asaas', ${`pay_verify_${tag}_4`}, 'released', 15000, 5000)`,
        'booking_deposits_release_status_matches_split',
      );

      await mustReject(
        'release_status "partially_forfeited" com released_cents = 0 é bloqueado (parcial exige as DUAS partes > 0)',
        () => sql`INSERT INTO booking_deposits (booking_id, amount_cents, provider, provider_payment_id, release_status, released_cents, forfeited_cents)
          VALUES (${bookingCaucaoId}, 20000, 'asaas', ${`pay_verify_${tag}_5`}, 'partially_forfeited', 0, 20000)`,
        'booking_deposits_release_status_matches_split',
      );

      /*
       * released_non_negative/forfeited_non_negative (as outras 2 CHECKs da
       * tabela) não têm como disparar isoladas: qualquer combinação que
       * deixe released ou forfeited negativo enquanto ainda soma o total
       * (release_amounts_consistent) força o outro lado a violar
       * release_status_matches_split primeiro (released<=0 nunca é válido
       * em "released"/"partially_forfeited", nem forfeited<0 em nenhum
       * status alcançável). São defesa-em-profundidade redundante das duas
       * CHECKs acima, não uma regra alcançável por si — por isso não têm
       * teste próprio aqui.
       */

      await mustAccept(
        'caução válida em custódia ("held", 1 mês de aluguel) é aceita',
        () => sql`INSERT INTO booking_deposits (booking_id, amount_cents, provider, provider_payment_id)
          VALUES (${bookingCaucaoId}, 20000, 'asaas', ${`pay_verify_${tag}_ok`})`,
      );

      await mustReject(
        'uma segunda caução para a MESMA reserva é bloqueada (uma por reserva)',
        () => sql`INSERT INTO booking_deposits (booking_id, amount_cents, provider, provider_payment_id)
          VALUES (${bookingCaucaoId}, 20000, 'asaas', ${`pay_verify_${tag}_dup`})`,
        'booking_deposits_booking_key',
      );

      const [espacoCaucao2] = await sql<{ id: string }[]>`
        INSERT INTO spaces (owner_id, slug, type, status, title, description,
                            district, city, state, available_from, price_monthly_cents, location)
        VALUES (${ownerId}, ${`caucao2-${tag}`}, 'garagem', 'draft',
                'Segunda garagem para teste de caução',
                'Descricao com mais de vinte caracteres para passar na regra do banco.',
                'Centro', 'Colatina', 'ES', CURRENT_DATE, 20000,
                ST_SetSRID(ST_MakePoint(-40.6295, -19.5386), 4326))
        RETURNING id`;
      const unidadeCaucao2 = await garantirUnidadePadrao(sql, espacoCaucao2.id);
      const [bookingCaucao2] = await sql<{ id: string }[]>`
        INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, start_date,
          group_id, unit_id,
          monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
          owner_fee_cents, total_charged_cents, owner_payout_cents, deposit_cents)
        VALUES (${`MP-${tag.slice(-6).toUpperCase()}E`}, ${espacoCaucao2.id}, ${renterId}, ${ownerId},
          'approved', CURRENT_DATE, ${unidadeCaucao2.groupId}, ${unidadeCaucao2.unitIds[0]!},
          20000, 300, 300, 600, 600, 20600, 19400, 20000)
        RETURNING id`;

      await mustReject(
        'o mesmo provider_payment_id em OUTRA reserva é bloqueado (id da cobrança é único por gateway)',
        () => sql`INSERT INTO booking_deposits (booking_id, amount_cents, provider, provider_payment_id)
          VALUES (${bookingCaucao2.id}, 20000, 'asaas', ${`pay_verify_${tag}_ok`})`,
        'booking_deposits_provider_id_key',
      );
    }

    console.log('\n\x1b[1m14. Confiança, perfil e verificações (Fase 21)\x1b[0m');
    {
      // --- Avaliação: quem recebeu vem da reserva, nunca de quem escreve ---
      const [avaliacaoDoEspaco] = await sql<{ id: string; reviewed_user_id: string }[]>`
        SELECT id, reviewed_user_id FROM reviews
        WHERE booking_id = ${bookingId} AND kind = 'renter_to_space'`;
      if (avaliacaoDoEspaco?.reviewed_user_id === ownerId) {
        ok('avaliação do espaço é atribuída ao proprietário da reserva', 'reviewed_user_id preenchido pela trigger');
      } else {
        bad('reviewed_user_id derivado (renter_to_space)', JSON.stringify(avaliacaoDoEspaco));
      }

      await mustReject(
        'avaliação que aponta outra pessoa como avaliada é bloqueada',
        () => sql`
          INSERT INTO reviews (booking_id, kind, author_id, target_user_id, reviewed_user_id, rating)
          VALUES (${bookingId}, 'owner_to_renter', ${ownerId}, ${renterId}, ${strangerId}, 1)`,
        'nao e a outra parte da reserva',
      );

      const [avaliacaoDoLocatario] = await sql<{ id: string; reviewed_user_id: string }[]>`
        INSERT INTO reviews (booking_id, kind, author_id, target_user_id, rating, comment)
        VALUES (${bookingId}, 'owner_to_renter', ${ownerId}, ${renterId}, 4, 'Pagou em dia.')
        RETURNING id, reviewed_user_id`;
      if (avaliacaoDoLocatario.reviewed_user_id === renterId) {
        ok('avaliação do locatário sem informar o avaliado recebe o locatário da reserva');
      } else {
        bad('reviewed_user_id derivado (owner_to_renter)', JSON.stringify(avaliacaoDoLocatario));
      }

      // --- Avaliação publicada não muda nem some ---
      await mustReject(
        'nota de avaliação publicada não pode ser alterada',
        () => sql`UPDATE reviews SET rating = 1 WHERE id = ${avaliacaoDoLocatario.id}`,
        'nao pode ser alterada',
      );
      await mustReject(
        'texto de avaliação publicada não pode ser alterado',
        () => sql`UPDATE reviews SET comment = 'Texto trocado depois' WHERE id = ${avaliacaoDoLocatario.id}`,
        'nao pode ser alterada',
      );
      await mustReject(
        'avaliação não pode ser apagada (a moderação só oculta)',
        () => sql`DELETE FROM reviews WHERE id = ${avaliacaoDoLocatario.id}`,
        'nao pode ser apagada',
      );

      // --- Média: uma casa decimal, arredondada uma única vez ---
      // Mais duas locações encerradas do mesmo espaço: notas 5 (seção 5), 5 e 4.
      const reservaEncerrada = async (sufixo: string) => {
        const [b] = await sql<{ id: string }[]>`
          INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, start_date, ended_at,
            monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
            owner_fee_cents, total_charged_cents, owner_payout_cents)
          VALUES (${`MP-${tag.slice(-6).toUpperCase()}${sufixo}`}, ${spaceId}, ${renterId}, ${ownerId},
            'ended', CURRENT_DATE - 90, now(), 18000, 300, 300, 540, 540, 18540, 17460)
          RETURNING id`;
        return b.id;
      };
      const reservaNota5 = await reservaEncerrada('F');
      const reservaNota4 = await reservaEncerrada('G');
      await sql`INSERT INTO reviews (booking_id, kind, author_id, space_id, rating)
                VALUES (${reservaNota5}, 'renter_to_space', ${renterId}, ${spaceId}, 5)`;
      const [avaliacaoNota4] = await sql<{ id: string }[]>`
        INSERT INTO reviews (booking_id, kind, author_id, space_id, rating)
        VALUES (${reservaNota4}, 'renter_to_space', ${renterId}, ${spaceId}, 4)
        RETURNING id`;
      const mediaDoEspaco = async () =>
        (await sql<{ rating_avg: string | null; rating_count: number }[]>`
          SELECT rating_avg::text AS rating_avg, rating_count FROM spaces WHERE id = ${spaceId}`)[0];

      const media3 = await mediaDoEspaco();
      if (Number(media3.rating_avg) === 4.7 && media3.rating_count === 3) {
        ok('notas 5, 5 e 4 (4,666…) viram 4,7 — uma casa, arredondada uma vez', `${media3.rating_avg} (${media3.rating_count})`);
      } else {
        bad('arredondamento da média', JSON.stringify(media3));
      }

      await mustAccept(
        'moderação oculta avaliação (hidden_at) — a única mudança permitida',
        () => sql`UPDATE reviews SET hidden_at = now(), hidden_reason = 'Teste de moderação'
                  WHERE id = ${avaliacaoNota4.id}`,
      );
      const media2 = await mediaDoEspaco();
      if (Number(media2.rating_avg) === 5 && media2.rating_count === 2) {
        ok('avaliação oculta sai da média e da contagem', `${media2.rating_avg} (${media2.rating_count})`);
      } else {
        bad('média sem a avaliação oculta', JSON.stringify(media2));
      }

      // --- Denúncia de avaliação ---
      await mustReject(
        'denúncia de avaliação sem a avaliação é bloqueada',
        () => sql`INSERT INTO reports (target_type, reporter_id, reason)
                  VALUES ('review', ${ownerId}, 'conteudo_ofensivo')`,
        'reports_target_matches_type',
      );
      await mustReject(
        'denúncia de avaliação que aponta também um usuário é bloqueada (um alvo por denúncia)',
        () => sql`INSERT INTO reports (target_type, review_id, target_user_id, reporter_id, reason)
                  VALUES ('review', ${avaliacaoDoEspaco.id}, ${renterId}, ${ownerId}, 'conteudo_ofensivo')`,
        'reports_target_matches_type',
      );
      const [denunciaAvaliacao] = await sql<{ id: string; evidence_snapshot: { rating?: number; comment?: string } | null }[]>`
        INSERT INTO reports (target_type, review_id, reporter_id, reason)
        VALUES ('review', ${avaliacaoDoEspaco.id}, ${ownerId}, 'conteudo_ofensivo')
        RETURNING id, evidence_snapshot`;
      if (
        denunciaAvaliacao.evidence_snapshot?.comment === 'Espaco limpo e seguro.' &&
        denunciaAvaliacao.evidence_snapshot.rating === 5
      ) {
        ok('evidência da avaliação denunciada é copiada na hora', 'nota e texto preservados');
      } else {
        bad('evidência da denúncia de avaliação', JSON.stringify(denunciaAvaliacao.evidence_snapshot));
      }
      await mustReject(
        'segunda denúncia aberta da mesma avaliação pela mesma pessoa é bloqueada',
        () => sql`INSERT INTO reports (target_type, review_id, reporter_id, reason)
                  VALUES ('review', ${avaliacaoDoEspaco.id}, ${ownerId}, 'spam')`,
        'reports_one_open_per_target',
      );
      const contadorDoAutor = async () =>
        (await sql<{ upheld_report_count: number }[]>`
          SELECT upheld_report_count FROM profiles WHERE id = ${renterId}`)[0].upheld_report_count;
      const antesDaDecisao = await contadorDoAutor();
      await sql`UPDATE reports SET status = 'resolved', upheld = true, resolved_at = now()
                WHERE id = ${denunciaAvaliacao.id}`;
      const depoisDaDecisao = await contadorDoAutor();
      if (depoisDaDecisao === antesDaDecisao + 1) {
        ok('denúncia procedente de avaliação conta contra quem a escreveu', `${antesDaDecisao} -> ${depoisDaDecisao}`);
      } else {
        bad('reincidência por avaliação', `${antesDaDecisao} -> ${depoisDaDecisao}`);
      }

      // --- Perfil público ---
      await mustReject(
        'nome de exibição com 1 caractere é bloqueado',
        () => sql`UPDATE profiles SET display_name = 'A' WHERE id = ${ownerId}`,
        'profiles_display_name_length',
      );
      await mustReject(
        'nome de exibição com mais de 40 caracteres é bloqueado',
        () => sql`UPDATE profiles SET display_name = ${'x'.repeat(41)} WHERE id = ${ownerId}`,
        'profiles_display_name_length',
      );
      await mustReject(
        'bio com mais de 500 caracteres é bloqueada',
        () => sql`UPDATE profiles SET bio = ${'a'.repeat(501)} WHERE id = ${ownerId}`,
        'profiles_bio_length',
      );
      await mustReject(
        'foto de perfil apontando para a pasta de outra pessoa é bloqueada',
        () => sql`UPDATE profiles SET avatar_path = ${`${renterId}/avatar/emprestada.webp`} WHERE id = ${ownerId}`,
        'profiles_avatar_path_own_folder',
      );
      await mustReject(
        '"identidade verificada" sem documento verificado é bloqueado',
        () => sql`UPDATE profiles SET identity_verification_status = 'verified' WHERE id = ${ownerId}`,
        'profiles_identity_status_matches',
      );

      await sql`UPDATE profiles SET full_name = 'Maria Aparecida Souza', display_name = NULL WHERE id = ${ownerId}`;
      const [semApelido] = await sql<{ public_name: string | null }[]>`SELECT public_name FROM profiles WHERE id = ${ownerId}`;
      await sql`UPDATE profiles SET display_name = '  Cida  ' WHERE id = ${ownerId}`;
      const [comApelido] = await sql<{ public_name: string | null }[]>`SELECT public_name FROM profiles WHERE id = ${ownerId}`;
      if (semApelido.public_name === 'Maria' && comApelido.public_name === 'Cida') {
        ok('nome público = nome de exibição ou só o primeiro nome (nunca o completo)', `"${semApelido.public_name}" -> "${comApelido.public_name}"`);
      } else {
        bad('nome público gerado', JSON.stringify({ semApelido, comApelido }));
      }

      // --- Telefone verificado ---
      await sql`UPDATE profiles SET phone = '+5527999990001', phone_verified_at = now() WHERE id = ${ownerId}`;
      await mustReject(
        'o mesmo telefone verificado em duas contas é bloqueado',
        () => sql`UPDATE profiles SET phone = '+5527999990001', phone_verified_at = now() WHERE id = ${renterId}`,
        'profiles_verified_phone_key',
      );
      // Pelo caminho do navegador (papel authenticated + JWT): trocar o
      // número é permitido, mas leva a verificação embora.
      await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE authenticated`;
        await tx`SELECT set_config('request.jwt.claim.sub', ${ownerId}, true)`;
        await tx`UPDATE profiles SET phone = '+5527999990002' WHERE id = ${ownerId}`;
      });
      const [telefone] = await sql<{ phone: string; phone_verified_at: Date | null }[]>`
        SELECT phone, phone_verified_at FROM profiles WHERE id = ${ownerId}`;
      if (telefone.phone === '+5527999990002' && telefone.phone_verified_at === null) {
        ok('trocar o telefone derruba a verificação do número anterior');
      } else {
        bad('troca de telefone', JSON.stringify(telefone));
      }

      // Segunda trava, independente do GRANT por coluna: mesmo com um papel
      // que tem o privilégio, requisição com JWT de usuário não mexe em selo.
      await mustReject(
        'com JWT de usuário, nem o próprio dono liga o selo de telefone (trigger, além do GRANT)',
        () => sql.begin(async (tx) => {
          await tx`SELECT set_config('request.jwt.claim.sub', ${renterId}, true)`;
          await tx`UPDATE profiles SET phone_verified_at = now() WHERE id = ${renterId}`;
        }),
        'nao podem ser alterados por esta via',
      );
      await mustReject(
        'navegador logado não lê o telefone de outra pessoa (GRANT por coluna)',
        () => sql.begin(async (tx) => {
          await tx`SET LOCAL ROLE authenticated`;
          await tx`SELECT set_config('request.jwt.claim.sub', ${renterId}, true)`;
          await tx`SELECT phone FROM profiles WHERE id = ${ownerId}`;
        }),
        'permission denied',
      );

      await mustReject(
        'verificação com telefone fora do formato internacional (E.164) é bloqueada',
        () => sql`INSERT INTO phone_verifications (user_id, phone, expires_at)
                  VALUES (${ownerId}, '27 99999-0002', now() + interval '10 minutes')`,
        'phone_verifications_phone_e164',
      );
      await mustAccept(
        'verificação de telefone pendente válida é aceita',
        () => sql`INSERT INTO phone_verifications (user_id, phone, expires_at)
                  VALUES (${ownerId}, '+5527999990002', now() + interval '10 minutes')`,
      );
      await mustReject(
        'duas verificações pendentes ao mesmo tempo para a mesma pessoa é bloqueado',
        () => sql`INSERT INTO phone_verifications (user_id, phone, expires_at)
                  VALUES (${ownerId}, '+5527999990003', now() + interval '10 minutes')`,
        'phone_verifications_one_pending_per_user',
      );
      await mustReject(
        'verificação aprovada sem data de conclusão é bloqueada',
        () => sql`INSERT INTO phone_verifications (user_id, phone, status, expires_at)
                  VALUES (${renterId}, '+5527999990004', 'approved', now() + interval '10 minutes')`,
        'phone_verifications_resolved_matches_status',
      );
      await mustReject(
        'mais de 10 tentativas de código na mesma verificação é bloqueado',
        () => sql`UPDATE phone_verifications SET check_attempts = 11 WHERE user_id = ${ownerId}`,
        'phone_verifications_attempts_range',
      );

      // --- E-mail verificado: cópia fiel do Supabase Auth ---
      await sql`UPDATE auth.users SET email_confirmed_at = now() WHERE id = ${ownerId}`;
      const [emailConfirmado] = await sql<{ email_verified_at: Date | null }[]>`
        SELECT email_verified_at FROM profiles WHERE id = ${ownerId}`;
      await sql`UPDATE auth.users SET email_confirmed_at = NULL WHERE id = ${ownerId}`;
      const [emailDesfeito] = await sql<{ email_verified_at: Date | null }[]>`
        SELECT email_verified_at FROM profiles WHERE id = ${ownerId}`;
      if (emailConfirmado.email_verified_at && emailDesfeito.email_verified_at === null) {
        ok('e-mail verificado acompanha auth.users.email_confirmed_at (liga e desliga junto)');
      } else {
        bad('espelho do e-mail verificado', JSON.stringify({ emailConfirmado, emailDesfeito }));
      }
      await sql`INSERT INTO auth.users (id, email, email_confirmed_at)
                VALUES (${confirmedId}, ${`confirmado-${tag}@example.com`}, now())`;
      const [nasceConfirmado] = await sql<{ email_verified_at: Date | null }[]>`
        SELECT email_verified_at FROM profiles WHERE id = ${confirmedId}`;
      if (nasceConfirmado?.email_verified_at) ok('cadastro já confirmado nasce com e-mail verificado');
      else bad('perfil de cadastro confirmado', JSON.stringify(nasceConfirmado));

      // --- Preferências de notificação: essenciais não desligam ---
      await mustReject(
        'categoria essencial (reservas) não pode ser desligada na central',
        () => sql`INSERT INTO notification_preferences (user_id, category, in_app, push)
                  VALUES (${ownerId}, 'reservas', false, true)`,
        'notification_preferences_essential_locked',
      );
      await mustReject(
        'categoria essencial (pagamentos) não pode ter o celular desligado',
        () => sql`INSERT INTO notification_preferences (user_id, category, in_app, push)
                  VALUES (${ownerId}, 'pagamentos', true, false)`,
        'notification_preferences_essential_locked',
      );
      await mustAccept(
        'categoria opcional (recomendações) pode ser desligada',
        () => sql`INSERT INTO notification_preferences (user_id, category, in_app, push)
                  VALUES (${ownerId}, 'recomendacoes', false, false)`,
      );

      // --- Notificação idempotente ---
      const chave = `review_available:${bookingId}`;
      await mustAccept(
        'notificação com chave de idempotência é aceita',
        () => sql`INSERT INTO notifications (user_id, type, title, dedupe_key)
                  VALUES (${ownerId}, 'review_available', 'Avalie sua locação', ${chave})`,
      );
      await mustReject(
        'o mesmo evento não gera duas notificações para a mesma pessoa',
        () => sql`INSERT INTO notifications (user_id, type, title, dedupe_key)
                  VALUES (${ownerId}, 'review_available', 'Avalie sua locação', ${chave})`,
        'notifications_user_dedupe_key',
      );
      await mustAccept(
        'a mesma chave para OUTRA pessoa é aceita (cada parte recebe a sua)',
        () => sql`INSERT INTO notifications (user_id, type, title, dedupe_key)
                  VALUES (${renterId}, 'review_available', 'Avalie sua locação', ${chave})`,
      );
      await mustAccept(
        'notificações sem chave seguem livres (cada mensagem nova é um aviso)',
        () => sql`INSERT INTO notifications (user_id, type, title)
                  VALUES (${ownerId}, 'new_message', 'Nova mensagem'), (${ownerId}, 'new_message', 'Nova mensagem')`,
      );
    }

    console.log('\n\x1b[1m15. Descoberta, disponibilidade e desempenho (Fase 23)\x1b[0m');
    {
      const statusDoEspaco = async () =>
        (await sql<{ status: string }[]>`SELECT status::text AS status FROM spaces WHERE id = ${spaceId}`)[0].status;
      const reserva = (sufixo: string, renter: string, inicioEmDias: number) => sql<{ id: string }[]>`
        INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, start_date,
          group_id, unit_id,
          monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
          owner_fee_cents, total_charged_cents, owner_payout_cents)
        VALUES (${`MP-${tag.slice(-6).toUpperCase()}${sufixo}`}, ${spaceId}, ${renter}, ${ownerId},
          'active', CURRENT_DATE + ${inicioEmDias}::int, ${unidadePrincipal.groupId}, ${unidadePrincipal.unitIds[0]!},
          ${amounts.monthlyRentCents}, ${amounts.renterFeeBps},
          ${amounts.ownerFeeBps}, ${amounts.renterFeeCents}, ${amounts.ownerFeeCents},
          ${amounts.totalChargedCents}, ${amounts.ownerPayoutCents})
        RETURNING id`;
      const bloquear = (de: number, ate: number) => sql<{ id: string }[]>`
        INSERT INTO space_availability_blocks (space_id, starts_on, ends_on, reason, created_by)
        VALUES (${spaceId}, CURRENT_DATE + ${de}::int, CURRENT_DATE + ${ate}::int, 'manutencao', ${ownerId})
        RETURNING id`;

      // --- Ocupação real: o status do anúncio acompanha a reserva ---
      const antes = await statusDoEspaco();
      const [ocupacao] = await reserva('R', strangerId, 0);
      const durante = await statusDoEspaco();
      if (antes === 'published' && durante === 'rented') {
        ok('reserva vigente tira o anúncio do ar sozinha', `${antes} -> ${durante}`);
      } else {
        bad('ocupação do espaço', `${antes} -> ${durante}`);
      }
      await sql`UPDATE spaces SET status = 'published' WHERE id = ${spaceId}`;
      expectEqual('republicar com reserva vigente continua "alugado"', await statusDoEspaco(), 'rented');
      await mustReject(
        'apagar foto de anúncio alugado abaixo do mínimo é bloqueado',
        () => sql`DELETE FROM space_images WHERE space_id = ${spaceId} AND position = 2`,
        'abaixo do minimo',
      );
      await mustReject(
        'bloquear datas por cima de reserva vigente é bloqueado',
        () => bloquear(100, 110),
        'Ha uma reserva vigente',
      );
      await sql`UPDATE bookings SET status = 'ended', ended_at = now() WHERE id = ${ocupacao.id}`;
      expectEqual('aluguel encerrado devolve o anúncio ao ar', await statusDoEspaco(), 'published');

      // --- Calendário: bloqueio manual × reserva ---
      await mustReject('bloqueio que termina antes de começar é bloqueado', () => bloquear(10, 5),
        'space_availability_blocks_dates_ordered');
      await mustReject('bloqueio de mais de um ano é bloqueado', () => bloquear(1, 400),
        'space_availability_blocks_max_length');
      await mustReject(
        'reserva vigente que termina antes de começar é bloqueada pela regra de datas',
        () => sql`
          INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, start_date, end_date,
            group_id, unit_id,
            monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
            owner_fee_cents, total_charged_cents, owner_payout_cents)
          VALUES (${`MP-${tag.slice(-6).toUpperCase()}U`}, ${spaceId}, ${strangerId}, ${ownerId},
            'active', CURRENT_DATE + 10, CURRENT_DATE + 5, ${unidadePrincipal.groupId}, ${unidadePrincipal.unitIds[0]!},
            ${amounts.monthlyRentCents}, ${amounts.renterFeeBps},
            ${amounts.ownerFeeBps}, ${amounts.renterFeeCents}, ${amounts.ownerFeeCents},
            ${amounts.totalChargedCents}, ${amounts.ownerPayoutCents})`,
        'bookings_dates_ordered',
      );
      const [bloqueio] = await bloquear(30, 40);
      ok('bloqueio de datas futuras é aceito');
      await mustReject('segundo bloqueio sobre as mesmas datas é bloqueado', () => bloquear(35, 45),
        'Ja existe um bloqueio');
      await mustReject('reserva que começa dentro de um bloqueio é bloqueada', () => reserva('S', strangerId, 32),
        'O proprietario bloqueou o espaco');
      await sql`UPDATE space_availability_blocks SET cancelled_at = now() WHERE id = ${bloqueio.id}`;
      let liberada = '';
      await mustAccept('bloqueio desfeito libera as datas para reserva', async () => {
        liberada = (await reserva('T', strangerId, 32))[0].id;
      });
      if (liberada) await sql`UPDATE bookings SET status = 'ended', ended_at = now() WHERE id = ${liberada}`;

      // --- Histórico de preço: gravado pelo banco, imutável ---
      // Parte 12: o proprietário muda o preço no grupo; o anúncio acompanha.
      await sql.begin(async (tx) => {
        await tx`SELECT set_config('myplace.actor_id', ${ownerId}, true)`;
        await tx`UPDATE space_unit_groups SET monthly_price_cents = 17000 WHERE id = ${unidadePrincipal.groupId}`;
      });
      const historico = await sql<{ id: string; old_price_cents: number; new_price_cents: number; changed_by: string | null }[]>`
        SELECT id, old_price_cents, new_price_cents, changed_by FROM space_price_history WHERE space_id = ${spaceId}`;
      expectEqual('mudança de preço de anúncio publicado vira histórico, com autor',
        historico.map((h) => [h.old_price_cents, h.new_price_cents, h.changed_by === ownerId]), [[18000, 17000, true]]);
      await sql`UPDATE space_unit_groups SET monthly_price_cents = 9000 WHERE space_id = ${semGeo.id}`;
      const [{ n: doRascunho }] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM space_price_history WHERE space_id = ${semGeo.id}`;
      expectEqual('rascunho nunca publicado não gera histórico (preço provisório não é histórico)', doRascunho, 0);
      await mustReject('linha do histórico de preço não pode ser alterada',
        () => sql`UPDATE space_price_history SET new_price_cents = 1 WHERE id = ${historico[0]?.id ?? null}`,
        'historico de preco e imutavel');
      await mustReject('linha do histórico de preço não pode ser apagada',
        () => sql`DELETE FROM space_price_history WHERE id = ${historico[0]?.id ?? null}`,
        'historico de preco e imutavel');
      await mustReject('histórico sem mudança real de preço é bloqueado',
        () => sql`INSERT INTO space_price_history (space_id, old_price_cents, new_price_cents, space_status)
                  VALUES (${spaceId}, 17000, 17000, 'published')`,
        'space_price_history_real_change');

      // --- Favoritos: preço de referência vem do anúncio, nunca do navegador ---
      await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE authenticated`;
        await tx`SELECT set_config('request.jwt.claim.sub', ${renterId}, true)`;
        await tx`INSERT INTO favorites (user_id, space_id, price_cents_at_favorite, price_alert_baseline_cents)
                 VALUES (${renterId}, ${spaceId}, 1, 1)`;
      });
      const [favorito] = await sql<{ p: number; b: number }[]>`
        SELECT price_cents_at_favorite AS p, price_alert_baseline_cents AS b
        FROM favorites WHERE user_id = ${renterId} AND space_id = ${spaceId}`;
      expectEqual('favorito pelo navegador grava o preço do anúncio, não o enviado', [favorito?.p, favorito?.b], [17000, 17000]);
      await mustReject(
        'com JWT de usuário, o preço de referência do aviso não muda (trigger, além do GRANT)',
        () => sql.begin(async (tx) => {
          await tx`SELECT set_config('request.jwt.claim.sub', ${renterId}, true)`;
          await tx`UPDATE favorites SET price_alert_baseline_cents = 1 WHERE user_id = ${renterId} AND space_id = ${spaceId}`;
        }),
        'Campos calculados pelo servidor',
      );
      await mustReject('preço de referência zero é bloqueado',
        () => sql`UPDATE favorites SET price_alert_baseline_cents = 0 WHERE user_id = ${renterId} AND space_id = ${spaceId}`,
        'favorites_price_alert_baseline_positive');

      // --- Lista de espera ---
      await mustReject('proprietário não entra na lista de espera do próprio espaço',
        () => sql`INSERT INTO waitlist_entries (user_id, space_id) VALUES (${ownerId}, ${spaceId})`,
        'O proprietario nao entra na lista de espera');
      await mustAccept('locatário entra na lista de espera',
        () => sql`INSERT INTO waitlist_entries (user_id, space_id) VALUES (${renterId}, ${spaceId})`);
      await mustReject('a mesma pessoa não fica duas vezes esperando o mesmo espaço',
        () => sql`INSERT INTO waitlist_entries (user_id, space_id) VALUES (${renterId}, ${spaceId})`,
        'waitlist_entries_one_waiting_per_user_space');
      await mustReject('"saiu da lista" sem a data de saída é bloqueado',
        () => sql`INSERT INTO waitlist_entries (user_id, space_id, status) VALUES (${strangerId}, ${spaceId}, 'left')`,
        'waitlist_entries_status_dates');
      await sql`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (${ownerId}, ${strangerId})`;
      await mustReject('quem está bloqueado pelo proprietário não entra na lista de espera',
        () => sql`INSERT INTO waitlist_entries (user_id, space_id) VALUES (${strangerId}, ${spaceId})`,
        'Ha bloqueio entre os usuarios');
      await sql`DELETE FROM user_blocks WHERE blocker_id = ${ownerId} AND blocked_id = ${strangerId}`;

      // --- Alertas de busca salva ---
      const alerta = (chave: string, status = 'active', label = 'Garagem em Colatina') => sql`
        INSERT INTO saved_searches (user_id, label, criteria, criteria_key, status)
        VALUES (${renterId}, ${label}, ${sql.json({ tipo: 'garagem', onde: chave })}, ${`${chave}-${tag}`}, ${status})`;
      await mustReject('alerta sem nome é bloqueado', () => alerta('sem-nome', 'active', ''),
        'saved_searches_label_length');
      await mustReject('critério de alerta que não é objeto é bloqueado',
        () => sql`INSERT INTO saved_searches (user_id, label, criteria, criteria_key)
                  VALUES (${renterId}, 'Lista', '[]'::jsonb, ${`lista-${tag}`})`,
        'saved_searches_criteria_object');
      const [{ limite }] = await sql<{ limite: number }[]>`
        SELECT COALESCE((SELECT (value #>> '{}')::int FROM platform_settings
                         WHERE key = 'alerts.saved_search_max_free'), 2) AS limite`;
      for (let i = 1; i <= limite; i++) await alerta(`a${i}`);
      ok(`conta sem Premium cria até ${limite} alertas ativos`);
      await mustReject(`o alerta ativo nº ${limite + 1} da conta sem Premium é bloqueado pelo banco`,
        () => alerta('excedente'), 'alertas ativos atingido');
      await mustAccept('alerta pausado não conta no limite', () => alerta('pausado', 'paused'));
      await mustReject('a mesma busca salva duas vezes pela mesma pessoa é bloqueada', () => alerta('a1', 'paused'),
        'saved_searches_user_criteria_key');

      // --- Contadores ---
      await mustReject('visualização negativa no contador diário é bloqueada',
        () => sql`INSERT INTO space_daily_stats (space_id, day, views) VALUES (${spaceId}, CURRENT_DATE, -1)`,
        'space_daily_stats_non_negative');
      await mustReject('uso negativo de IA no contador é bloqueado',
        () => sql`INSERT INTO ai_usage_counters (day, feature, calls) VALUES (CURRENT_DATE, ${`verify-${tag}`}, -1)`,
        'ai_usage_counters_calls_non_negative');

      // --- Nenhuma tabela nova é alcançável pelo navegador ---
      const tabelasNovas = [
        'space_price_history', 'waitlist_entries', 'space_availability_blocks', 'saved_searches',
        'saved_search_matches', 'listing_suggestions', 'space_daily_stats', 'ai_usage_counters',
      ];
      const alcancaveis: string[] = [];
      for (const t of tabelasNovas) {
        try {
          await sql.begin(async (tx) => {
            await tx`SET LOCAL ROLE authenticated`;
            await tx`SELECT set_config('request.jwt.claim.sub', ${renterId}, true)`;
            await tx`SELECT 1 FROM ${sql(t)} LIMIT 1`;
          });
          alcancaveis.push(t);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes('permission denied')) alcancaveis.push(`${t} (${msg.slice(0, 80)})`);
        }
      }
      const semRls = await sql<{ relname: string }[]>`
        SELECT relname FROM pg_class
        WHERE relnamespace = 'public'::regnamespace AND relname IN ${sql(tabelasNovas)} AND NOT relrowsecurity`;
      if (alcancaveis.length === 0 && semRls.length === 0) {
        ok(`as ${tabelasNovas.length} tabelas novas não são alcançáveis pelo navegador`, 'sem GRANT e com RLS');
      } else {
        bad('tabelas novas expostas', JSON.stringify({ alcancaveis, semRls: semRls.map((r) => r.relname) }));
      }

      // --- Configuração inicial ---
      const chaves = [
        'alerts.saved_search_max_free', 'alerts.saved_search_max_premium', 'alerts.digest_hours_free',
        'alerts.digest_hours_premium', 'alerts.price_drop_min_bps', 'alerts.price_drop_cooldown_hours',
        'ai.search_daily_limit', 'ai.listing_daily_limit', 'ai.listing_daily_limit_per_owner',
        'ai.listing_space_cooldown_minutes', 'analytics.views_counting_since',
        'premium.price_monthly_cents', 'premium.price_yearly_cents',
      ];
      const conf = new Map((await sql<{ key: string; value: unknown }[]>`
        SELECT key, value FROM platform_settings WHERE key IN ${sql(chaves)}`).map((r) => [r.key, r.value]));
      const faltando = chaves.filter((k) => !conf.has(k));
      if (faltando.length === 0) ok(`as ${chaves.length} configurações da Fase 23 existem`);
      else bad('configurações da Fase 23', `faltando: ${faltando.join(', ')}`);
      expectEqual('preço do Premium continua R$ 79,90/mês e R$ 759,05/ano (em centavos)',
        [conf.get('premium.price_monthly_cents'), conf.get('premium.price_yearly_cents')], [7990, 75905]);
      const desde = conf.get('analytics.views_counting_since');
      if (typeof desde === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(desde)) {
        ok('data de início da contagem de visualizações gravada', desde);
      } else {
        bad('analytics.views_counting_since', JSON.stringify(desde));
      }
    }

    console.log('\n\x1b[1m16. Unidades, aluguel temporário e prazos de pagamento (Parte 12)\x1b[0m');
    {
      // Anúncio próprio desta seção: 4 grupos com regras diferentes.
      const [p12] = await sql<{ id: string }[]>`
        INSERT INTO spaces (owner_id, slug, type, status, title, description,
                            district, city, state, available_from, location)
        VALUES (${ownerId}, ${`estacionamento-${tag}`}, 'garagem', 'draft',
                'Estacionamento com vagas rápidas e mensais',
                'Estacionamento coberto com vagas por hora, por dia e mensalistas.',
                'Centro', 'Colatina', 'ES', CURRENT_DATE,
                ST_SetSRID(ST_MakePoint(-40.6295, -19.5386), 4326))
        RETURNING id`;
      const p12Id = p12.id;
      for (const n of [0, 1, 2]) {
        await sql`INSERT INTO space_images (space_id, storage_path, position)
                  VALUES (${p12Id}, ${`${ownerId}/${p12Id}/f${n}.jpg`}, ${n})`;
      }
      const statusP12 = async () =>
        (await sql<{ status: string }[]>`SELECT status::text AS status FROM spaces WHERE id = ${p12Id}`)[0].status;
      const resumoP12 = async () =>
        (await sql<{ m: number | null; c: number | null; u: number | null; un: string | null }[]>`
          SELECT price_monthly_cents AS m, temp_from_cents AS c, temp_from_units AS u, temp_from_unit::text AS un
            FROM spaces WHERE id = ${p12Id}`)[0];

      // --- Regras do grupo ---
      const grupo = (campos: Record<string, unknown>) => sql`
        INSERT INTO space_unit_groups ${sql({ space_id: p12Id, name: `G-${crypto.randomUUID().slice(0, 6)}`, ...campos })}`;
      await mustReject('grupo sem nenhum modo é bloqueado',
        () => grupo({ allows_continuous: false, allows_temporary: false }), 'space_unit_groups_some_mode');
      await mustReject('grupo mensal sem preço é bloqueado',
        () => grupo({ allows_continuous: true }), 'space_unit_groups_continuous_price');
      await mustReject('grupo temporário sem regra de tempo é bloqueado',
        () => grupo({ allows_continuous: false, allows_temporary: true }), 'space_unit_groups_temporary_rule');
      await mustReject('proporcional por hora é bloqueado (só dia ou semana)',
        () => grupo({ allows_continuous: false, allows_temporary: true, temp_pricing_mode: 'per_period',
          temp_unit: 'hour', temp_price_cents: 5000, temp_max_units: 5, temp_allow_fraction: true }),
        'space_unit_groups_fraction_rule');
      await mustReject('horário com abertura depois do fechamento é bloqueado',
        () => grupo({ monthly_price_cents: 30000, hours_mode: 'daily', opens_at: '21:00', closes_at: '07:00' }),
        'space_unit_groups_hours');
      await mustReject('horário de funcionamento com diária é bloqueado (temporário com horário é por hora)',
        () => grupo({ allows_continuous: false, allows_temporary: true, temp_pricing_mode: 'per_period',
          temp_unit: 'day', temp_price_cents: 20000, temp_max_units: 3, hours_mode: 'daily', opens_at: '07:00', closes_at: '21:00' }),
        'space_unit_groups_hours_temporary');
      const pacotes = (lista: unknown) => grupo({ allows_continuous: false, allows_temporary: true,
        temp_pricing_mode: 'packages', temp_unit: 'hour', temp_packages: sql.json(lista as never) });
      await mustReject('pacotes com a mesma duração são bloqueados',
        () => pacotes([{ units: 1, priceCents: 5000 }, { units: 1, priceCents: 6000 }]), 'space_unit_groups_packages_ordered');
      await mustReject('pacotes fora de ordem são bloqueados',
        () => pacotes([{ units: 5, priceCents: 12000 }, { units: 1, priceCents: 5000 }]), 'space_unit_groups_packages_ordered');
      await mustReject('pacote mais longo mais barato que um mais curto é bloqueado',
        () => pacotes([{ units: 1, priceCents: 5000 }, { units: 5, priceCents: 4000 }]), 'space_unit_groups_packages_ordered');
      await mustReject('pacote com duração fracionada é bloqueado',
        () => pacotes([{ units: 1.5, priceCents: 5000 }]), 'space_unit_groups_packages_valid');
      await mustReject('pacote sem preço é bloqueado',
        () => pacotes([{ units: 2 }]), 'space_unit_groups_packages_valid');

      const novoGrupo = async (campos: Record<string, unknown>) =>
        (await sql<{ id: string }[]>`
          INSERT INTO space_unit_groups ${sql({ space_id: p12Id, ...campos })} RETURNING id`)[0].id;
      const novaUnidade = async (groupId: string, label: string) =>
        (await sql<{ id: string }[]>`
          INSERT INTO space_units (space_id, group_id, label) VALUES (${p12Id}, ${groupId}, ${label}) RETURNING id`)[0].id;

      const gRapidas = await novoGrupo({ name: 'Vagas rápidas', allows_continuous: false, allows_temporary: true,
        temp_pricing_mode: 'per_period', temp_unit: 'hour', temp_price_cents: 5000, temp_max_units: 5,
        hours_mode: 'daily', opens_at: '07:00', closes_at: '21:00' });
      await mustReject('dois grupos com o mesmo nome no anúncio são bloqueados',
        () => novoGrupo({ name: 'vagas RÁPIDAS', monthly_price_cents: 30000 }), 'space_unit_groups_space_name_key');
      const gMensais = await novoGrupo({ name: 'Mensalistas', monthly_price_cents: 30000 });
      const gDiarias = await novoGrupo({ name: 'Diárias', allows_continuous: false, allows_temporary: true,
        temp_pricing_mode: 'per_period', temp_unit: 'day', temp_price_cents: 20000, temp_max_units: 3,
        temp_allow_fraction: true, renewal_allowed: false });
      const gPacotes = await novoGrupo({ name: 'Pacotes', allows_continuous: false, allows_temporary: true,
        temp_pricing_mode: 'packages', temp_unit: 'hour',
        temp_packages: sql.json([{ units: 1, priceCents: 5000 }, { units: 5, priceCents: 12000 }, { units: 10, priceCents: 18000 }]) });

      await mustReject('anúncio sem unidade não vai ao ar',
        () => sql`UPDATE spaces SET status = 'published', published_at = now() WHERE id = ${p12Id}`,
        'spaces_published_requires_units');
      const a1 = await novaUnidade(gRapidas, 'Vaga 1');
      const a2 = await novaUnidade(gRapidas, 'Vaga 2');
      const b1 = await novaUnidade(gMensais, 'Vaga 3');
      const b2 = await novaUnidade(gMensais, 'Vaga 4');
      const c1 = await novaUnidade(gDiarias, 'Vaga 5');
      const d1 = await novaUnidade(gPacotes, 'Vaga 6');
      await mustReject('duas unidades com o mesmo nome no anúncio são bloqueadas',
        () => novaUnidade(gMensais, 'Vaga 3'), 'space_units_space_label_key');
      await mustAccept('anúncio com unidades vai ao ar',
        () => sql`UPDATE spaces SET status = 'published', published_at = now() WHERE id = ${p12Id}`);

      expectEqual('resumo de preço vem dos grupos (mensal mais barato + entrada temporária por hora)',
        await resumoP12(), { m: 30000, c: 5000, u: 1, un: 'hour' });
      await mustReject('gravar preço direto no anúncio com grupos é bloqueado (a vitrine não pode mentir)',
        () => sql`UPDATE spaces SET price_monthly_cents = 100 WHERE id = ${p12Id}`, 'spaces_price_from_units');

      // Unidade de outro anúncio não entra no grupo deste (chave composta).
      await mustReject('unidade não pode apontar para grupo de outro anúncio',
        () => sql`INSERT INTO space_units (space_id, group_id, label) VALUES (${spaceId}, ${gRapidas}, 'Intrusa')`,
        'space_units_group_same_space_fk');

      // --- Preço calculado pelo banco (mesma regra do servidor) ---
      const cotacao = async (groupId: string, n: number, un: string) =>
        (await sql<{ v: number | null }[]>`SELECT public.temporary_rent_cents(${groupId}, ${n}, ${un}::rental_time_unit) AS v`)[0].v;
      expectEqual('por hora: 3 horas a R$ 50 = R$ 150', await cotacao(gRapidas, 3, 'hour'), 15000);
      expectEqual('por hora: acima do máximo (6 de 5 horas) não tem preço', await cotacao(gRapidas, 6, 'hour'), null);
      expectEqual('diária proporcional: 6 horas de R$ 200/dia = R$ 50', await cotacao(gDiarias, 6, 'hour'), 5000);
      expectEqual('diária proporcional: 5 horas de R$ 200/dia = R$ 41,67 (meio para cima, uma vez)', await cotacao(gDiarias, 5, 'hour'), 4167);
      expectEqual('diária: 2 dias = R$ 400', await cotacao(gDiarias, 2, 'day'), 40000);
      expectEqual('diária: 73 horas passa do máximo de 3 dias', await cotacao(gDiarias, 73, 'hour'), null);
      expectEqual('pacote: "até 5 horas" = R$ 120', await cotacao(gPacotes, 5, 'hour'), 12000);
      expectEqual('pacote: duração que não é pacote não tem preço', await cotacao(gPacotes, 3, 'hour'), null);
      expectEqual('grupo só mensal não tem preço temporário', await cotacao(gMensais, 1, 'hour'), null);

      // --- Reservas ---
      const [{ amanha10 }] = await sql<{ amanha10: Date }[]>`
        SELECT ((CURRENT_DATE + 1)::timestamp + time '10:00') AT TIME ZONE 'America/Sao_Paulo' AS amanha10`;
      const horas = (h: number) => new Date(amanha10.getTime() + h * 3_600_000);
      let seq = 0;
      const temporaria = (o: {
        unitId: string; groupId: string; renter?: string; inicio: Date; n: number; un?: string;
        rent: number; status?: string; hold?: Date | null; fim?: Date; renewedFrom?: string; chave?: string;
      }) => {
        const v = computeBookingAmounts(o.rent, { renterFeeBps: 300, ownerFeeBps: 300 });
        const un = o.un ?? 'hour';
        const passo = un === 'hour' ? 3_600_000 : un === 'day' ? 86_400_000 : 604_800_000;
        const fim = o.fim ?? new Date(o.inicio.getTime() + o.n * passo);
        const status = o.status ?? 'awaiting_payment';
        const hold = o.hold === undefined ? (status === 'awaiting_payment' ? new Date(Date.now() + 10 * 60_000) : null) : o.hold;
        seq++;
        return sql<{ id: string }[]>`
          INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, kind, group_id, unit_id,
            starts_at, ends_at, duration_units, duration_unit, hold_expires_at, renewed_from_id, idempotency_key,
            start_date, monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
            owner_fee_cents, total_charged_cents, owner_payout_cents)
          VALUES (${`MP-T${seq}${tag.slice(-5).toUpperCase()}`}, ${p12Id}, ${o.renter ?? renterId}, ${ownerId},
            ${status}, 'temporary', ${o.groupId}, ${o.unitId},
            ${o.inicio}, ${fim}, ${o.n}, ${un}::rental_time_unit, ${hold}, ${o.renewedFrom ?? null}, ${o.chave ?? null},
            CURRENT_DATE, ${v.monthlyRentCents}, 300, 300, ${v.renterFeeCents},
            ${v.ownerFeeCents}, ${v.totalChargedCents}, ${v.ownerPayoutCents})
          RETURNING id`;
      };

      await mustReject('valor diferente do calculado pelas regras é bloqueado (navegador nunca manda preço)',
        () => temporaria({ unitId: a1, groupId: gRapidas, inicio: horas(0), n: 2, rent: 5000 }), 'bookings_rent_matches_group');
      await mustReject('duração acima do máximo é bloqueada',
        () => temporaria({ unitId: a1, groupId: gRapidas, inicio: horas(0), n: 6, rent: 30000 }), 'bookings_temporary_rules');
      await mustReject('fim diferente de início + duração é bloqueado',
        () => temporaria({ unitId: a1, groupId: gRapidas, inicio: horas(0), n: 2, rent: 10000, fim: horas(3) }), 'bookings_temporary_rules');
      await mustReject('aluguel abaixo do mínimo por cobrança (R$ 35) é bloqueado',
        () => temporaria({ unitId: c1, groupId: gDiarias, inicio: horas(0), n: 1, rent: 833 }), 'bookings_temporary_minimum');
      await mustReject('reserva que termina depois do fechamento é bloqueada com o horário',
        () => temporaria({ unitId: a1, groupId: gRapidas, inicio: horas(8), n: 4, rent: 20000 }), 'fecha as 21:00');
      await mustReject('reserva que começa antes da abertura é bloqueada com o horário',
        () => temporaria({ unitId: a1, groupId: gRapidas, inicio: horas(-4), n: 2, rent: 10000 }), 'abre as 07:00');
      await mustReject('reserva temporária que começou há horas é bloqueada',
        () => temporaria({ unitId: c1, groupId: gDiarias, inicio: new Date(Date.now() - 3 * 3_600_000), n: 1, un: 'day', rent: 20000 }),
        'bookings_temporary_window');
      await mustReject('reserva temporária a mais de 30 dias é bloqueada',
        () => temporaria({ unitId: c1, groupId: gDiarias, inicio: horas(24 * 40), n: 1, un: 'day', rent: 20000 }),
        'bookings_temporary_window');
      await mustReject('prazo para pagar maior que o configurado é bloqueado',
        () => temporaria({ unitId: a1, groupId: gRapidas, inicio: horas(0), n: 2, rent: 10000, hold: new Date(Date.now() + 3 * 3_600_000) }),
        'bookings_temporary_hold');

      const [t1] = await temporaria({ unitId: a1, groupId: gRapidas, inicio: horas(0), n: 2, rent: 10000, chave: `k-${tag}` });
      ok('reserva temporária válida é aceita', '2 horas na Vaga 1, R$ 100');
      const [t1Linha] = await sql<{ sd: string; ed: string; ou: Date; ra: boolean }[]>`
        SELECT start_date::text AS sd, end_date::text AS ed, occupied_until AS ou, renewal_allowed AS ra FROM bookings WHERE id = ${t1.id}`;
      expectEqual('banco deriva os dias tocados e a proteção de 7 min para renovar',
        [t1Linha.sd < t1Linha.ed, t1Linha.ou.getTime() - horas(2).getTime(), t1Linha.ra], [true, 7 * 60_000, true]);
      await mustReject('mesmo envio repetido (mesma chave) não cria segunda reserva',
        () => temporaria({ unitId: a2, groupId: gRapidas, inicio: horas(0), n: 2, rent: 10000, chave: `k-${tag}` }),
        'bookings_renter_idempotency_key');
      await mustReject('outra pessoa na mesma vaga e no mesmo horário é bloqueada',
        () => temporaria({ unitId: a1, groupId: gRapidas, renter: strangerId, inicio: horas(1), n: 2, rent: 10000 }),
        'bookings_unit_no_overlap');
      await mustReject('outra pessoa na janela de 7 min de renovação é bloqueada (a vaga fica protegida)',
        () => temporaria({ unitId: a1, groupId: gRapidas, renter: strangerId, inicio: horas(2), n: 1, rent: 5000 }),
        'bookings_unit_no_overlap');
      let depoisDaJanela = '';
      await mustAccept('logo depois da janela de renovação a vaga aceita outra pessoa', async () => {
        depoisDaJanela = (await temporaria({ unitId: a1, groupId: gRapidas, renter: strangerId,
          inicio: new Date(horas(2).getTime() + 7 * 60_000), n: 1, rent: 5000 }))[0].id;
      });
      await mustAccept('outra vaga do mesmo grupo no mesmo horário é aceita',
        () => temporaria({ unitId: a2, groupId: gRapidas, renter: strangerId, inicio: horas(0), n: 2, rent: 10000 }));
      await mustReject('vaga de outro grupo não entra numa reserva deste grupo',
        () => temporaria({ unitId: b1, groupId: gRapidas, inicio: horas(0), n: 2, rent: 10000 }), 'bookings_unit_same_group_fk');
      await mustReject('reserva temporária não muda de horário depois de criada',
        () => sql`UPDATE bookings SET ends_at = ends_at + interval '1 hour' WHERE id = ${t1.id}`, 'bookings_temporary_frozen');
      await mustReject('a proteção depois do fim não pode crescer',
        () => sql`UPDATE bookings SET occupied_until = occupied_until + interval '1 minute' WHERE id = ${t1.id}`, 'bookings_temporary_frozen');

      // Diária sem renovação: sem janela de 7 min.
      const [tc] = await temporaria({ unitId: c1, groupId: gDiarias, inicio: horas(0), n: 6, un: 'hour', rent: 5000 });
      const [tcLinha] = await sql<{ igual: boolean; ra: boolean }[]>`
        SELECT occupied_until = ends_at AS igual, renewal_allowed AS ra FROM bookings WHERE id = ${tc.id}`;
      expectEqual('grupo sem renovação não protege depois do fim', [tcLinha.igual, tcLinha.ra], [true, false]);

      // Contínuo e temporário na mesma vaga: o mensal ocupa do início em diante.
      const mensal = (sufixo: string, unitId: string, status: string, rent = 30000, renter = renterId, inicio = 'CURRENT_DATE') => {
        const v = computeBookingAmounts(rent, { renterFeeBps: 300, ownerFeeBps: 300 });
        return sql<{ id: string }[]>`
          INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, kind, group_id, unit_id,
            start_date, monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
            owner_fee_cents, total_charged_cents, owner_payout_cents)
          VALUES (${`MP-M${sufixo}${tag.slice(-5).toUpperCase()}`}, ${p12Id}, ${renter}, ${ownerId},
            ${status}, 'continuous', ${gMensais}, ${unitId}, ${sql.unsafe(inicio)}, ${v.monthlyRentCents}, 300, 300,
            ${v.renterFeeCents}, ${v.ownerFeeCents}, ${v.totalChargedCents}, ${v.ownerPayoutCents})
          RETURNING id`;
      };
      await mustReject('mensalidade diferente do preço do grupo é bloqueada',
        () => mensal('X', b1, 'requested', 25000), 'bookings_rent_matches_group');
      const [m1] = await mensal('A', b1, 'active');
      expectEqual('com 1 de 2 vagas mensais alugada, o anúncio continua no ar', await statusP12(), 'published');
      const [m2] = await mensal('B', b2, 'active', 30000, strangerId);
      expectEqual('com as vagas de grupo só por hora livres, o anúncio continua no ar', await statusP12(), 'published');
      await mustReject('mensalista ocupa a vaga do início em diante (sem fim)',
        () => mensal('C', b1, 'approved', 30000, strangerId, 'CURRENT_DATE + 200'), 'bookings_unit_no_overlap');
      await mustReject('desativar vaga com aluguel em andamento é bloqueado',
        () => sql`UPDATE space_units SET active = false WHERE id = ${b1}`, 'space_units_keep_live_rental');
      await mustReject('apagar vaga com histórico de reserva é bloqueado',
        () => sql`DELETE FROM space_units WHERE id = ${b1}`, 'bookings_unit_same_group_fk');
      await mustAccept('desativar vaga livre é aceito', () => sql`UPDATE space_units SET active = false WHERE id = ${d1}`);
      expectEqual('grupo sem vaga ativa sai do resumo de preço', (await resumoP12()).c, 5000);
      await sql`UPDATE space_units SET active = true WHERE id = ${d1}`;

      // Todas as vagas de um anúncio só mensal alugadas = alugado.
      const [soMensal] = await sql<{ id: string }[]>`
        INSERT INTO spaces (owner_id, slug, type, status, title, description, district, city, state, available_from, location)
        VALUES (${ownerId}, ${`mensal-${tag}`}, 'garagem', 'draft', 'Garagem com duas vagas mensais',
                'Duas vagas cobertas para mensalistas, com portão automático.', 'Centro', 'Colatina', 'ES', CURRENT_DATE,
                ST_SetSRID(ST_MakePoint(-40.6295, -19.5386), 4326))
        RETURNING id`;
      for (const n of [0, 1, 2]) {
        await sql`INSERT INTO space_images (space_id, storage_path, position) VALUES (${soMensal.id}, ${`${ownerId}/${soMensal.id}/f${n}.jpg`}, ${n})`;
      }
      const [gSo] = await sql<{ id: string }[]>`
        INSERT INTO space_unit_groups (space_id, name, monthly_price_cents) VALUES (${soMensal.id}, 'Padrão', 20000) RETURNING id`;
      const [u1] = await sql<{ id: string }[]>`INSERT INTO space_units (space_id, group_id, label) VALUES (${soMensal.id}, ${gSo.id}, 'Vaga A') RETURNING id`;
      const [u2] = await sql<{ id: string }[]>`INSERT INTO space_units (space_id, group_id, label) VALUES (${soMensal.id}, ${gSo.id}, 'Vaga B') RETURNING id`;
      await sql`UPDATE spaces SET status = 'published', published_at = now() WHERE id = ${soMensal.id}`;
      const statusSo = async () => (await sql<{ s: string }[]>`SELECT status::text AS s FROM spaces WHERE id = ${soMensal.id}`)[0].s;
      const mensalSo = (sufixo: string, unitId: string, renter: string) => {
        const v = computeBookingAmounts(20000, { renterFeeBps: 300, ownerFeeBps: 300 });
        return sql<{ id: string }[]>`
          INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, group_id, unit_id, start_date,
            monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents, owner_fee_cents, total_charged_cents, owner_payout_cents)
          VALUES (${`MP-S${sufixo}${tag.slice(-5).toUpperCase()}`}, ${soMensal.id}, ${renter}, ${ownerId}, 'active', ${gSo.id}, ${unitId},
            CURRENT_DATE, 20000, 300, 300, ${v.renterFeeCents}, ${v.ownerFeeCents}, ${v.totalChargedCents}, ${v.ownerPayoutCents})
          RETURNING id`;
      };
      const [sA] = await mensalSo('A', u1.id, renterId);
      expectEqual('1 de 2 vagas alugadas: continua no ar', await statusSo(), 'published');
      await mensalSo('B', u2.id, strangerId);
      expectEqual('2 de 2 vagas alugadas: anúncio alugado', await statusSo(), 'rented');
      await mustReject('anúncio no ar não fica sem nenhuma vaga ativa',
        () => sql`UPDATE space_unit_groups SET active = false WHERE id = ${gSo.id}`, 'space_units_keep_live_rental');
      await sql`UPDATE bookings SET status = 'ended', ended_at = now(), end_reason = 'cancelled_by_renter' WHERE id = ${sA.id}`;
      expectEqual('uma vaga liberada: anúncio volta ao ar', await statusSo(), 'published');

      // --- Pagamento pendente: janela fixa de 40 min + 1 h ---
      await mustReject('pagamento pendente sem prazo é bloqueado',
        () => sql`UPDATE bookings SET status = 'past_due' WHERE id = ${m1.id}`, 'bookings_payment_window');
      await mustReject('pagamento pendente com prazo diferente de 40 min + 1 h é bloqueado',
        () => sql`UPDATE bookings SET status = 'past_due', payment_issue_started_at = now(),
                  payment_issue_deadline_at = now() + interval '3 hours' WHERE id = ${m1.id}`, 'bookings_payment_window');
      await mustAccept('pagamento pendente com o prazo fixo é aceito',
        () => sql`UPDATE bookings SET status = 'past_due', payment_issue_started_at = now(),
                  payment_issue_deadline_at = now() + interval '100 minutes' WHERE id = ${m1.id}`);
      await mustReject('voltar a ativo sem limpar o prazo é bloqueado',
        () => sql`UPDATE bookings SET status = 'active' WHERE id = ${m1.id}`, 'bookings_payment_window');
      await mustAccept('pagamento confirmado na janela: volta a ativo e o prazo some',
        () => sql`UPDATE bookings SET status = 'active', payment_issue_started_at = NULL, payment_issue_deadline_at = NULL WHERE id = ${m1.id}`);
      await mustReject('temporário não entra em pagamento pendente (só a recorrência)',
        () => sql`UPDATE bookings SET status = 'past_due', payment_issue_started_at = now(),
                  payment_issue_deadline_at = now() + interval '100 minutes' WHERE id = ${t1.id}`, 'bookings_payment_window');
      await mustReject('motivo de encerramento em reserva ativa é bloqueado',
        () => sql`UPDATE bookings SET end_reason = 'completed' WHERE id = ${m2.id}`, 'bookings_end_reason_matches');

      // --- Renovação ---
      await sql`UPDATE bookings SET status = 'active', hold_expires_at = NULL WHERE id = ${t1.id}`;
      await mustReject('renovação que não começa no fim da anterior é bloqueada',
        () => temporaria({ unitId: a1, groupId: gRapidas, inicio: horas(3), n: 1, rent: 5000, renewedFrom: t1.id }),
        'bookings_renewal_rules');
      await mustReject('renovação em outra vaga é bloqueada',
        () => temporaria({ unitId: a2, groupId: gRapidas, inicio: horas(2), n: 1, rent: 5000, renewedFrom: t1.id }),
        'bookings_renewal_rules');
      // A vaga depois da janela já foi alugada por outra pessoa: a renovação
      // não pode passar por cima (o banco recusa, não o código).
      await sql`UPDATE bookings SET occupied_until = ends_at WHERE id = ${t1.id}`;
      await mustReject('renovação que invade a reserva seguinte de outra pessoa é bloqueada',
        () => temporaria({ unitId: a1, groupId: gRapidas, inicio: horas(2), n: 1, rent: 5000, renewedFrom: t1.id }),
        'bookings_unit_no_overlap');
      await sql`UPDATE bookings SET status = 'cancelled', hold_expires_at = NULL WHERE id = ${depoisDaJanela}`;
      let renovacao = '';
      await mustAccept('renovação começando onde a anterior termina é aceita', async () => {
        renovacao = (await temporaria({ unitId: a1, groupId: gRapidas, inicio: horas(2), n: 1, rent: 5000, renewedFrom: t1.id }))[0].id;
      });
      await mustReject('segunda renovação da mesma reserva é bloqueada (duas abas)',
        () => temporaria({ unitId: a1, groupId: gRapidas, inicio: horas(2), n: 1, rent: 5000, renewedFrom: t1.id, renter: renterId }),
        'bookings_one_live_renewal');

      // --- O que venceu é encerrado pelo relógio do banco ---
      // Viagem no tempo só no teste: a trigger que recusa início no passado
      // fica desligada dentro desta transação, para criar o cenário "já passou".
      const noPassado = async (fn: (tx: postgres.TransactionSql) => Promise<unknown>) => {
        await sql.begin(async (tx) => {
          await tx`ALTER TABLE bookings DISABLE TRIGGER bookings_derive_rental_shape`;
          await fn(tx);
          await tx`ALTER TABLE bookings ENABLE TRIGGER bookings_derive_rental_shape`;
        });
      };
      // (a) reserva temporária não paga no prazo
      const vHold = computeBookingAmounts(5000, { renterFeeBps: 300, ownerFeeBps: 300 });
      let holdVencido = '';
      await noPassado(async (tx) => {
        const [r] = await tx<{ id: string }[]>`
          INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, kind, group_id, unit_id,
            starts_at, ends_at, occupied_until, duration_units, duration_unit, hold_expires_at,
            start_date, end_date, monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
            owner_fee_cents, total_charged_cents, owner_payout_cents)
          VALUES (${`MP-H${tag.slice(-6).toUpperCase()}`}, ${p12Id}, ${strangerId}, ${ownerId}, 'awaiting_payment', 'temporary',
            ${gPacotes}, ${d1}, now() + interval '1 hour', now() + interval '2 hours', now() + interval '2 hours 7 minutes',
            1, 'hour', now() - interval '1 minute', CURRENT_DATE, CURRENT_DATE + 1, 5000, 300, 300,
            ${vHold.renterFeeCents}, ${vHold.ownerFeeCents}, ${vHold.totalChargedCents}, ${vHold.ownerPayoutCents})
          RETURNING id`;
        holdVencido = r.id;
        await tx`INSERT INTO payments (booking_id, provider, provider_payment_id, status, method, amount_cents, due_date)
                 VALUES (${r.id}, 'asaas', ${`pay_hold_${tag}`}, 'pending', 'pix', ${vHold.totalChargedCents}, CURRENT_DATE)`;
      });
      // (b) temporário que acabou e passou a janela de renovação
      let acabou = '';
      await noPassado(async (tx) => {
        const [r] = await tx<{ id: string }[]>`
          INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, kind, group_id, unit_id,
            starts_at, ends_at, occupied_until, duration_units, duration_unit,
            start_date, end_date, monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
            owner_fee_cents, total_charged_cents, owner_payout_cents, activated_at)
          VALUES (${`MP-E${tag.slice(-6).toUpperCase()}`}, ${p12Id}, ${strangerId}, ${ownerId}, 'active', 'temporary',
            ${gPacotes}, ${d1}, now() - interval '3 hours', now() - interval '2 hours', now() - interval '1 hour 53 minutes',
            1, 'hour', CURRENT_DATE, CURRENT_DATE + 1, 5000, 300, 300,
            ${vHold.renterFeeCents}, ${vHold.ownerFeeCents}, ${vHold.totalChargedCents}, ${vHold.ownerPayoutCents}, now() - interval '3 hours')
          RETURNING id`;
        acabou = r.id;
      });
      // (c) pagamento pendente que passou do prazo
      await sql`UPDATE bookings SET status = 'past_due', payment_issue_started_at = now() - interval '2 hours',
                payment_issue_deadline_at = now() - interval '2 hours' + interval '100 minutes' WHERE id = ${m2.id}`;
      const [assinaturaM2] = await sql<{ id: string }[]>`
        INSERT INTO subscriptions (booking_id, provider, provider_subscription_id, status, method, amount_cents, billing_day)
        VALUES (${m2.id}, 'asaas', ${`sub_${tag}`}, 'past_due', 'credit_card', 30900, 5) RETURNING id`;

      await mustReject('o navegador não chama a função que encerra aluguéis',
        () => sql.begin(async (tx) => {
          await tx`SET LOCAL ROLE authenticated`;
          await tx`SELECT public.release_expired_rentals(NULL)`;
        }), 'permission denied');
      const [{ n: liberadas }] = await sql<{ n: number }[]>`SELECT public.release_expired_rentals(${p12Id}) AS n`;
      expectEqual('encerramento por prazo pegou os 3 casos', liberadas, 3);
      const estado = async (id: string) =>
        (await sql<{ s: string; r: string | null }[]>`SELECT status::text AS s, end_reason::text AS r FROM bookings WHERE id = ${id}`)[0];
      expectEqual('reserva não paga no prazo: expirada', await estado(holdVencido), { s: 'expired', r: 'hold_expired' });
      const [cobrancaVencida] = await sql<{ marcada: boolean }[]>`
        SELECT delete_requested_at IS NOT NULL AS marcada FROM payments WHERE booking_id = ${holdVencido}`;
      expectEqual('a cobrança que não pode mais ser paga fica marcada para excluir no gateway', cobrancaVencida?.marcada, true);
      expectEqual('temporário que acabou: encerrado como concluído', await estado(acabou), { s: 'ended', r: 'completed' });
      expectEqual('pagamento pendente sem pagamento no prazo: encerrado', await estado(m2.id), { s: 'ended', r: 'payment_not_received' });
      const [assin] = await sql<{ s: string; p: Date | null }[]>`
        SELECT status::text AS s, provider_cancelled_at AS p FROM subscriptions WHERE id = ${assinaturaM2.id}`;
      expectEqual('recorrência marcada como cancelada, aguardando confirmação do gateway', [assin.s, assin.p], ['cancelled', null]);
      expectEqual('rodar de novo não encerra nada a mais', (await sql<{ n: number }[]>`SELECT public.release_expired_rentals(${p12Id}) AS n`)[0].n, 0);
      if (renovacao) await sql`UPDATE bookings SET status = 'cancelled', hold_expires_at = NULL WHERE id = ${renovacao}`;

      // --- Tabelas e funções fora do alcance do navegador ---
      const novasP12 = ['space_unit_groups', 'space_units'];
      const abertas: string[] = [];
      for (const t of novasP12) {
        try {
          await sql.begin(async (tx) => {
            await tx`SET LOCAL ROLE authenticated`;
            await tx`SELECT 1 FROM ${sql(t)} LIMIT 1`;
          });
          abertas.push(t);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes('permission denied')) abertas.push(`${t} (${msg.slice(0, 80)})`);
        }
      }
      const semRlsP12 = await sql<{ relname: string }[]>`
        SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname IN ${sql(novasP12)} AND NOT relrowsecurity`;
      if (abertas.length === 0 && semRlsP12.length === 0) ok('grupos e unidades não são alcançáveis pelo navegador', 'sem GRANT e com RLS');
      else bad('tabelas da Parte 12 expostas', JSON.stringify({ abertas, semRlsP12 }));

      const confP12 = new Map((await sql<{ key: string; value: unknown }[]>`
        SELECT key, value FROM platform_settings WHERE key IN ('rental.hold_minutes', 'rental.max_advance_days', 'booking.min_rent_cents')`)
        .map((r) => [r.key, r.value]));
      expectEqual('prazos configuráveis: 15 min para pagar, 30 dias de antecedência, mínimo de R$ 35 por cobrança',
        [confP12.get('rental.hold_minutes'), confP12.get('rental.max_advance_days'), confP12.get('booking.min_rent_cents')], [15, 30, 3500]);
    }
  } finally {
    // Limpeza: apagar o usuario cascateia para perfil, espacos, reservas etc.
    // ledger_entries e append-only, entao sai antes, por fora do trigger.
    await sql`ALTER TABLE ledger_entries DISABLE TRIGGER ledger_entries_append_only`;
    await sql`DELETE FROM ledger_entries WHERE booking_id IN (
                SELECT id FROM bookings WHERE owner_id = ${ownerId})`;
    await sql`ALTER TABLE ledger_entries ENABLE TRIGGER ledger_entries_append_only`;
    // Avaliacao nao se apaga (Fase 21, `guard_review_immutable`) — so com a
    // chave de manutencao explicita, valida apenas dentro desta transacao.
    await sql.begin(async (tx) => {
      await tx`SET LOCAL myplace.allow_review_delete = 'on'`;
      await tx`DELETE FROM reviews WHERE author_id IN (${ownerId}, ${renterId}, ${strangerId})`;
    });
    // Fase 23: o que a seção 15 cria fora do anúncio.
    await sql`DELETE FROM saved_searches WHERE user_id IN (${ownerId}, ${renterId}, ${strangerId})`;
    await sql`DELETE FROM waitlist_entries WHERE user_id IN (${ownerId}, ${renterId}, ${strangerId})`;
    await sql`DELETE FROM user_blocks WHERE blocker_id IN (${ownerId}, ${renterId}, ${strangerId})`;
    await sql`DELETE FROM ai_usage_counters WHERE feature = ${`verify-${tag}`}`;
    // Parte 12: cobranças e assinaturas da seção 16 (booking_id e RESTRICT).
    await sql`DELETE FROM payments WHERE booking_id IN (
                SELECT id FROM bookings WHERE owner_id = ${ownerId})`;
    await sql`DELETE FROM subscriptions WHERE booking_id IN (
                SELECT id FROM bookings WHERE owner_id = ${ownerId})`;
    // booking_deposits.booking_id e RESTRICT — precisa sair antes de bookings (Fase 20).
    await sql`DELETE FROM booking_deposits WHERE booking_id IN (
                SELECT id FROM bookings WHERE owner_id = ${ownerId})`;
    await sql`DELETE FROM bookings WHERE owner_id = ${ownerId}`;
    await sql`DELETE FROM spaces WHERE owner_id = ${ownerId}`;
    await sql`DELETE FROM webhook_events WHERE provider_event_id LIKE ${`evt_verify-%`}`;
    await sql`DELETE FROM auth.users WHERE id IN (${ownerId}, ${renterId}, ${strangerId}, ${confirmedId})`;
  }

  console.log(
    `\n\x1b[1mResultado:\x1b[0m \x1b[32m${passed} passaram\x1b[0m` +
      (failed ? `, \x1b[31m${failed} falharam\x1b[0m` : '') + '\n',
  );
  await sql.end();
  if (failed > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error('\n\x1b[31mErro fatal na verificacao:\x1b[0m', err);
  await sql.end();
  process.exit(1);
});
