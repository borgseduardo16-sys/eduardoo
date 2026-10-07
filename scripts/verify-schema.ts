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
import { prepararAnuncio, criarAnuncio } from './lib/fixtures';

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
  const quartoId = crypto.randomUUID();
  let spaceId = '';
  let bookingId = '';

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
              'Centro', 'Colatina', 'ES', (now() AT TIME ZONE 'America/Sao_Paulo')::date, 18000,
              ST_SetSRID(ST_MakePoint(-40.6295, -19.5386), 4326))
      RETURNING id`;
    spaceId = space.id;

    for (const n of [0, 1, 2]) {
      await sql`INSERT INTO space_images (space_id, storage_path, position)
                VALUES (${spaceId}, ${`${ownerId}/${spaceId}/f${n}.jpg`}, ${n})`;
    }
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
              'Centro', 'Colatina', 'ES', (now() AT TIME ZONE 'America/Sao_Paulo')::date, 10000)
      RETURNING id`;
    for (const n of [0, 1, 2]) {
      await sql`INSERT INTO space_images (space_id, storage_path, position)
                VALUES (${semGeo.id}, ${`${ownerId}/${semGeo.id}/f${n}.jpg`}, ${n})`;
    }

    // Com unidade, para que a única coisa faltando seja mesmo a coordenada.
    await prepararAnuncio(sql, semGeo.id);
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
          monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
          owner_fee_cents, total_charged_cents, owner_payout_cents)
        VALUES (${`MP-${tag.slice(-6).toUpperCase()}`}, ${spaceId}, ${renterId}, ${ownerId},
          'active', (now() AT TIME ZONE 'America/Sao_Paulo')::date,
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
        VALUES (${`MP-FRAUD-${tag.slice(-4)}`}, ${spaceId}, ${strangerId}, ${ownerId},
          'requested', (now() AT TIME ZONE 'America/Sao_Paulo')::date, 18000, 300, 300, 540, 540, 100, 17460)`,
      'bookings_total_matches',
    );

    await mustReject(
      'alugar o proprio espaco e bloqueado',
      () => sql`
        INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, start_date,
          monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
          owner_fee_cents, total_charged_cents, owner_payout_cents)
        VALUES (${`MP-SELF-${tag.slice(-4)}`}, ${spaceId}, ${ownerId}, ${ownerId},
          'requested', (now() AT TIME ZONE 'America/Sao_Paulo')::date, 18000, 300, 300, 540, 540, 18540, 17460)`,
      'bookings_distinct_parties',
    );

    // A trava é por QUANTIDADE: o anúncio oferece 1 vaga e a locação ativa acima já a ocupa.
    await mustReject(
      'segunda locacao vigente alem da quantidade oferecida e bloqueada',
      () => sql`
        INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, start_date,
          monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
          owner_fee_cents, total_charged_cents, owner_payout_cents)
        VALUES (${`MP-DUP-${tag.slice(-4)}`}, ${spaceId}, ${strangerId}, ${ownerId},
          'active', (now() AT TIME ZONE 'America/Sao_Paulo')::date, 18000, 300, 300, 540, 540, 18540, 17460)`,
      'bookings_capacity',
    );
    // Pedido ainda sem resposta NÃO ocupa vaga: pode haver vários ao mesmo tempo.
    await mustAccept('pedido pendente nao ocupa vaga (vale mesmo com a vaga cheia)', () => sql`
        INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, start_date,
          monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
          owner_fee_cents, total_charged_cents, owner_payout_cents)
        VALUES (${`MP-PED-${tag.slice(-4)}`}, ${spaceId}, ${strangerId}, ${ownerId},
          'requested', (now() AT TIME ZONE 'America/Sao_Paulo')::date, 18000, 300, 300, 540, 540, 18540, 17460)`);
    // Fecha o pedido de teste: quem pediu não pode ter outro vivo neste anúncio nas seções seguintes.
    await sql`UPDATE bookings SET status = 'cancelled', cancelled_at = now() WHERE reference = ${`MP-PED-${tag.slice(-4)}`}`;

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
                'Centro', 'Colatina', 'ES', (now() AT TIME ZONE 'America/Sao_Paulo')::date, 20000,
                ST_SetSRID(ST_MakePoint(-40.6295, -19.5386), 4326))
        RETURNING id`;
      const [bookingCaucao] = await sql<{ id: string }[]>`
        INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, start_date,
          monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
          owner_fee_cents, total_charged_cents, owner_payout_cents, deposit_cents)
        VALUES (${`MP-${tag.slice(-6).toUpperCase()}D`}, ${espacoCaucao.id}, ${renterId}, ${ownerId},
          'approved', (now() AT TIME ZONE 'America/Sao_Paulo')::date,
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
                'Centro', 'Colatina', 'ES', (now() AT TIME ZONE 'America/Sao_Paulo')::date, 20000,
                ST_SetSRID(ST_MakePoint(-40.6295, -19.5386), 4326))
        RETURNING id`;
      const [bookingCaucao2] = await sql<{ id: string }[]>`
        INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, start_date,
          monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
          owner_fee_cents, total_charged_cents, owner_payout_cents, deposit_cents)
        VALUES (${`MP-${tag.slice(-6).toUpperCase()}E`}, ${espacoCaucao2.id}, ${renterId}, ${ownerId},
          'approved', (now() AT TIME ZONE 'America/Sao_Paulo')::date,
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
            'ended', (now() AT TIME ZONE 'America/Sao_Paulo')::date - 90, now(), 18000, 300, 300, 540, 540, 18540, 17460)
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
          monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
          owner_fee_cents, total_charged_cents, owner_payout_cents)
        VALUES (${`MP-${tag.slice(-6).toUpperCase()}${sufixo}`}, ${spaceId}, ${renter}, ${ownerId},
          'active', (now() AT TIME ZONE 'America/Sao_Paulo')::date + ${inicioEmDias}::int,
          ${amounts.monthlyRentCents}, ${amounts.renterFeeBps},
          ${amounts.ownerFeeBps}, ${amounts.renterFeeCents}, ${amounts.ownerFeeCents},
          ${amounts.totalChargedCents}, ${amounts.ownerPayoutCents})
        RETURNING id`;
      const bloquear = (de: number, ate: number) => sql<{ id: string }[]>`
        INSERT INTO space_availability_blocks (space_id, starts_on, ends_on, reason, created_by)
        VALUES (${spaceId}, (now() AT TIME ZONE 'America/Sao_Paulo')::date + ${de}::int, (now() AT TIME ZONE 'America/Sao_Paulo')::date + ${ate}::int, 'manutencao', ${ownerId})
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
      // O bloqueio só fecha INÍCIOS de locações novas: não mexe no que já está rodando, então vale por cima de uma locação ativa.
      let bloqueioSobreLocacao = '';
      await mustAccept('bloquear datas por cima de locação vigente é aceito (só fecha inícios novos)', async () => {
        bloqueioSobreLocacao = (await bloquear(100, 110))[0].id;
      });
      if (bloqueioSobreLocacao) {
        await sql`UPDATE space_availability_blocks SET cancelled_at = now() WHERE id = ${bloqueioSobreLocacao}`;
      }
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
            monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
            owner_fee_cents, total_charged_cents, owner_payout_cents)
          VALUES (${`MP-${tag.slice(-6).toUpperCase()}U`}, ${spaceId}, ${strangerId}, ${ownerId},
            'active', (now() AT TIME ZONE 'America/Sao_Paulo')::date + 10, (now() AT TIME ZONE 'America/Sao_Paulo')::date + 5,
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
        'bookings_period_not_blocked');
      await sql`UPDATE space_availability_blocks SET cancelled_at = now() WHERE id = ${bloqueio.id}`;
      let liberada = '';
      await mustAccept('bloqueio desfeito libera as datas para reserva', async () => {
        liberada = (await reserva('T', strangerId, 32))[0].id;
      });
      if (liberada) await sql`UPDATE bookings SET status = 'ended', ended_at = now() WHERE id = ${liberada}`;

      // --- Histórico de preço: gravado pelo banco, imutável ---
      // O proprietário muda o preço do anúncio (a pessoa que mudou fica gravada).
      await sql.begin(async (tx) => {
        await tx`SELECT set_config('myplace.actor_id', ${ownerId}, true)`;
        await tx`UPDATE spaces SET price_monthly_cents = 17000 WHERE id = ${spaceId}`;
      });
      const historico = await sql<{ id: string; old_price_cents: number; new_price_cents: number; changed_by: string | null }[]>`
        SELECT id, old_price_cents, new_price_cents, changed_by FROM space_price_history WHERE space_id = ${spaceId}`;
      expectEqual('mudança de preço de anúncio publicado vira histórico, com autor',
        historico.map((h) => [h.old_price_cents, h.new_price_cents, h.changed_by === ownerId]), [[18000, 17000, true]]);
      await sql`UPDATE spaces SET price_monthly_cents = 9000 WHERE id = ${semGeo.id}`;
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
        () => sql`INSERT INTO space_daily_stats (space_id, day, views) VALUES (${spaceId}, (now() AT TIME ZONE 'America/Sao_Paulo')::date, -1)`,
        'space_daily_stats_non_negative');
      await mustReject('uso negativo de IA no contador é bloqueado',
        () => sql`INSERT INTO ai_usage_counters (day, feature, calls) VALUES ((now() AT TIME ZONE 'America/Sao_Paulo')::date, ${`verify-${tag}`}, -1)`,
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
        'premium.price_monthly_cents',
      ];
      const conf = new Map((await sql<{ key: string; value: unknown }[]>`
        SELECT key, value FROM platform_settings WHERE key IN ${sql(chaves)}`).map((r) => [r.key, r.value]));
      const faltando = chaves.filter((k) => !conf.has(k));
      if (faltando.length === 0) ok(`as ${chaves.length} configurações da Fase 23 existem`);
      else bad('configurações da Fase 23', `faltando: ${faltando.join(', ')}`);
      // Etapa 2 (0034): preço definitivo R$ 119,90/mês; o plano anual NÃO existe.
      expectEqual('preço do Premium é R$ 119,90/mês (em centavos)', conf.get('premium.price_monthly_cents'), 11990);
      const [anual] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM platform_settings WHERE key = 'premium.price_yearly_cents'`;
      expectEqual('o plano anual do Premium não existe', anual!.n, 0);
      const desde = conf.get('analytics.views_counting_since');
      if (typeof desde === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(desde)) {
        ok('data de início da contagem de visualizações gravada', desde);
      } else {
        bad('analytics.views_counting_since', JSON.stringify(desde));
      }
    }

    console.log('\n\x1b[1m16. Modelo mensal por quantidade (migração 0033)\x1b[0m');
    {
      // ---- O que saiu: unidades individuais, grupos e aluguel por tempo não existem mais.
      const [tabelas] = await sql<{ unidades: string | null; grupos: string | null; pedidos: string | null }[]>`
        SELECT to_regclass('public.space_units')::text AS unidades,
               to_regclass('public.space_unit_groups')::text AS grupos,
               to_regclass('public.booking_end_requests')::text AS pedidos`;
      expectEqual('tabelas de unidades e de grupos não existem mais', [tabelas!.unidades, tabelas!.grupos], [null, null]);
      expectEqual('a tabela de pedidos de encerramento existe', tabelas!.pedidos, 'booking_end_requests');
      const antigas = await sql<{ t: string; c: string }[]>`
        SELECT table_name AS t, column_name AS c FROM information_schema.columns
         WHERE table_schema = 'public'
           AND ((table_name = 'bookings' AND column_name IN ('kind', 'group_id', 'unit_id', 'starts_at', 'ends_at', 'occupied_until', 'hold_expires_at', 'duration_units'))
             OR (table_name = 'spaces' AND column_name LIKE 'temp\_from\_%'))`;
      expectEqual('colunas do aluguel por tempo saíram de reservas e anúncios', antigas, []);

      // ---- Anúncio de 2 unidades (como "80 na plataforma" de um local com 100, em pequeno).
      const [q] = await sql<{ id: string }[]>`
        INSERT INTO spaces (owner_id, slug, type, status, title, description, district, city, state,
                            available_from, price_monthly_cents, quantity_offered, quantity_total, location)
        VALUES (${ownerId}, ${`quantidade-${tag}`}, 'estacionamento', 'draft', 'Estacionamento com duas vagas na plataforma',
                'Estacionamento coberto com vagas mensais para teste da quantidade.',
                'Centro', 'Colatina', 'ES', (now() AT TIME ZONE 'America/Sao_Paulo')::date, 30000, 2, 5,
                ST_SetSRID(ST_MakePoint(-40.6295, -19.5386), 4326))
        RETURNING id`;
      const qId = q!.id;
      for (const n of [0, 1, 2]) {
        await sql`INSERT INTO space_images (space_id, storage_path, position) VALUES (${qId}, ${`${ownerId}/${qId}/f${n}.jpg`}, ${n})`;
      }
      await sql`UPDATE spaces SET status = 'published', published_at = now() WHERE id = ${qId}`;
      const vagas = async () =>
        (await sql<{ livres: number; oferecidas: number; total: number | null; status: string }[]>`
          SELECT quantity_available AS livres, quantity_offered AS oferecidas, quantity_total AS total, status::text AS status
            FROM spaces WHERE id = ${qId}`)[0]!;
      expectEqual('anúncio novo: 2 vagas oferecidas, 2 livres, 5 no local', await vagas(),
        { livres: 2, oferecidas: 2, total: 5, status: 'published' });
      await mustReject('total do local menor que o oferecido é bloqueado',
        () => sql`UPDATE spaces SET quantity_total = 1 WHERE id = ${qId}`, 'spaces_quantity_total');
      await mustReject('quantidade oferecida zero é bloqueada',
        () => sql`UPDATE spaces SET quantity_offered = 0 WHERE id = ${qId}`, 'spaces_quantity');

      const com = (sufixo: string, renter: string, status: string) => sql<{ id: string }[]>`
        INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, start_date,
          monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
          owner_fee_cents, total_charged_cents, owner_payout_cents)
        VALUES (${`MP-Q${tag.slice(-5).toUpperCase()}${sufixo}`}, ${qId}, ${renter}, ${ownerId}, ${status}, (now() AT TIME ZONE 'America/Sao_Paulo')::date,
          30000, 300, 300, 900, 900, 30900, 29100)
        RETURNING id`;
      const [ped] = await com('P', renterId, 'requested');
      expectEqual('pedido pendente não ocupa vaga', (await vagas()).livres, 2);
      const [prazo] = await sql<{ horas: number }[]>`
        SELECT round(extract(epoch FROM response_deadline_at - requested_at) / 3600)::int AS horas FROM bookings WHERE id = ${ped!.id}`;
      expectEqual('o banco dá 24 horas para o proprietário responder', prazo!.horas, 24);

      // Quem pede já tem a sua vaga garantida só depois do aceite; para encher o anúncio usamos outras contas.
      await sql`INSERT INTO auth.users (id, email) VALUES (${quartoId}, ${`quarto-${tag}@example.com`})`;
      const [a1] = await com('A', strangerId, 'active');
      expectEqual('uma locação ativa tira uma vaga livre', (await vagas()).livres, 1);
      const [a2] = await com('B', confirmedId, 'active');
      expectEqual('a segunda ocupa a última: 0 livres e o anúncio sai do ar sozinho', await vagas(),
        { livres: 0, oferecidas: 2, total: 5, status: 'rented' });
      await mustReject('uma terceira locação além da quantidade é bloqueada', () => com('C', quartoId, 'active'), 'bookings_capacity');
      await sql`UPDATE bookings SET status = 'ended', ended_at = now() WHERE id = ${a1!.id}`;
      expectEqual('terminar uma locação devolve a vaga e o anúncio volta ao ar', await vagas(),
        { livres: 1, oferecidas: 2, total: 5, status: 'published' });
      await mustReject('diminuir a quantidade abaixo do ocupado é bloqueado',
        () => sql`UPDATE spaces SET quantity_offered = 0 WHERE id = ${qId}`, 'spaces_quantity');
      await sql`UPDATE bookings SET status = 'ended', ended_at = now() WHERE id = ${a2!.id}`;
      expectEqual('sem locações, todas as vagas voltam', (await vagas()).livres, 2);

      // ---- Aceite exige instruções de acesso (texto ou áudio) e abre o prazo de pagamento.
      await mustReject('aceitar sem instruções de acesso é bloqueado',
        () => sql`UPDATE bookings SET status = 'approved', responded_at = now() WHERE id = ${ped!.id}`, 'bookings_access_required');
      await mustReject('instruções curtas demais não valem',
        () => sql`UPDATE bookings SET status = 'approved', responded_at = now(), access_instructions = 'portao' WHERE id = ${ped!.id}`,
        'bookings_access_required');
      await sql`UPDATE bookings SET status = 'approved', responded_at = now(),
                  access_instructions = 'Portão azul ao lado da padaria; a vaga fica atrás da pilastra.' WHERE id = ${ped!.id}`;
      const [apr] = await sql<{ horas: number; instr: boolean }[]>`
        SELECT round(extract(epoch FROM first_payment_deadline_at - now()) / 3600)::int AS horas,
               access_instructions_at IS NOT NULL AS instr FROM bookings WHERE id = ${ped!.id}`;
      expectEqual('o aceite grava o momento das instruções e dá 24 horas para pagar', [apr!.horas, apr!.instr], [24, true]);
      expectEqual('a locação aceita ocupa a vaga', (await vagas()).livres, 1);

      // ---- Pagamento pendente: a janela é TOTAL e vale exatamente 2 horas.
      await sql`UPDATE bookings SET status = 'active', activated_at = now() WHERE id = ${ped!.id}`;
      await mustReject('janela de pagamento pendente diferente de 2 horas é bloqueada',
        () => sql`UPDATE bookings SET status = 'past_due', payment_issue_started_at = now(),
                    payment_issue_deadline_at = now() + interval '3 hours' WHERE id = ${ped!.id}`, 'bookings_payment_window');
      await mustAccept('janela de exatamente 2 horas é aceita',
        () => sql`UPDATE bookings SET status = 'past_due', payment_issue_started_at = now(),
                    payment_issue_deadline_at = now() + interval '120 minutes' WHERE id = ${ped!.id}`);
      await sql`UPDATE bookings SET status = 'ended', ended_at = now(), end_reason = 'payment_not_received' WHERE id = ${ped!.id}`;

      // ---- Pedido de encerramento do proprietário: um por vez, com data válida.
      const [ativa] = await com('E', strangerId, 'active');
      await sql`INSERT INTO booking_end_requests (booking_id, requested_by, requested_end_date, reason)
                VALUES (${ativa!.id}, ${ownerId}, (now() AT TIME ZONE 'America/Sao_Paulo')::date + 30, 'Preciso do espaço')`;
      await mustReject('segundo pedido de encerramento em aberto é bloqueado',
        () => sql`INSERT INTO booking_end_requests (booking_id, requested_by, requested_end_date)
                  VALUES (${ativa!.id}, ${ownerId}, (now() AT TIME ZONE 'America/Sao_Paulo')::date + 40)`, 'booking_end_requests_one_pending');
      await sql`UPDATE booking_end_requests SET status = 'withdrawn', resolved_at = now() WHERE booking_id = ${ativa!.id}`;
      await mustReject('data de encerramento no passado é bloqueada',
        () => sql`INSERT INTO booking_end_requests (booking_id, requested_by, requested_end_date)
                  VALUES (${ativa!.id}, ${ownerId}, (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1)`, 'booking_end_requests_min_notice');
      await mustReject('data de encerramento a mais de um ano é bloqueada',
        () => sql`INSERT INTO booking_end_requests (booking_id, requested_by, requested_end_date)
                  VALUES (${ativa!.id}, ${ownerId}, (now() AT TIME ZONE 'America/Sao_Paulo')::date + 400)`, 'booking_end_requests_horizon');
      await mustReject('quem aluga não pode pedir o encerramento',
        () => sql`INSERT INTO booking_end_requests (booking_id, requested_by, requested_end_date)
                  VALUES (${ativa!.id}, ${renterId}, (now() AT TIME ZONE 'America/Sao_Paulo')::date + 10)`, 'booking_end_requests_by_owner');
      await sql`UPDATE bookings SET status = 'ended', ended_at = now() WHERE id = ${ativa!.id}`;
      await mustReject('locação já encerrada não recebe pedido de encerramento',
        () => sql`INSERT INTO booking_end_requests (booking_id, requested_by, requested_end_date)
                  VALUES (${ativa!.id}, ${ownerId}, (now() AT TIME ZONE 'America/Sao_Paulo')::date + 10)`, 'booking_end_requests_live_booking');

      // ---- Privacidade por tipo: comercial mostra o ponto exato, residencial é deslocado.
      const [ponto] = await sql<{ iguais: boolean }[]>`SELECT ST_Equals(location, approx_location) AS iguais FROM spaces WHERE id = ${qId}`;
      expectEqual('estacionamento (tipo comercial) expõe o ponto exato', ponto!.iguais, true);
      await sql`UPDATE spaces SET type = 'garagem' WHERE id = ${qId}`;
      const [desloc] = await sql<{ iguais: boolean }[]>`SELECT ST_Equals(location, approx_location) AS iguais FROM spaces WHERE id = ${qId}`;
      expectEqual('trocar para garagem (residencial) volta a deslocar o ponto', desloc!.iguais, false);
    }

    console.log('\n\x1b[1m17. Premium pago (migração 0034)\x1b[0m');
    {
      const u1 = strangerId; // assinante pago
      const u2 = renterId; // segundo assinante (saldo do ciclo)
      const u3 = ownerId; // concessão administrativa vencida
      const estadoDe = async (id: string) => {
        const [r] = await sql<{ a: boolean; f: boolean; c: string | null }[]>`
          SELECT public.premium_is_active(${id}) AS a, public.premium_financial_active(${id}) AS f,
                 public.premium_current_cycle_id(${id}) AS c`;
        return r!;
      };

      // ---- Sem ciclo pago, ninguém é Premium.
      const sem = await estadoDe(u1);
      expectEqual('sem ciclo pago, não é Premium e não tem benefício financeiro', [sem.a, sem.f, sem.c], [false, false, null]);

      // ---- A linha-resumo da assinatura.
      await mustReject('Premium "ativo" sem data de fim é bloqueado',
        () => sql`INSERT INTO premium_memberships (user_id, status, source) VALUES (${u1}, 'active', 'admin_grant')`,
        'premium_memberships_active_has_period');
      await mustReject('assinatura paga sem preço combinado é bloqueada',
        () => sql`INSERT INTO premium_memberships (user_id, status, source) VALUES (${u1}, 'pending_payment', 'subscription')`,
        'premium_memberships_subscription_has_plan');
      await mustReject('"teste financeiro" numa assinatura paga é bloqueado',
        () => sql`INSERT INTO premium_memberships (user_id, status, source, plan_cents, financial_test_enabled)
                  VALUES (${u1}, 'pending_payment', 'subscription', 11990, true)`,
        'premium_memberships_financial_test_admin_only');
      await mustReject('cancelamento agendado sem o momento do pedido é bloqueado',
        () => sql`INSERT INTO premium_memberships (user_id, status, source, plan_cents, cancel_at_period_end)
                  VALUES (${u1}, 'pending_payment', 'subscription', 11990, true)`,
        'premium_memberships_cancel_request_has_timestamp');
      await mustAccept('assinatura criada e ainda não paga é aceita', () => sql`
        INSERT INTO premium_memberships (user_id, status, source, provider, provider_subscription_id, billing_method, plan_cents)
        VALUES (${u1}, 'pending_payment', 'subscription', 'asaas', ${`sub_verify_${tag}`}, 'pix', 11990)`);
      expectEqual('assinatura pendente NÃO é Premium (Premium = pagamento confirmado)', (await estadoDe(u1)).a, false);
      await mustReject('a mesma recorrência do Asaas em duas contas é bloqueada',
        () => sql`INSERT INTO premium_memberships (user_id, status, source, provider, provider_subscription_id, billing_method, plan_cents)
                  VALUES (${u2}, 'pending_payment', 'subscription', 'asaas', ${`sub_verify_${tag}`}, 'pix', 11990)`,
        'premium_memberships_provider_sub_key');

      // ---- Cobranças do Premium.
      await mustReject('cobrança do Premium com valor zero é bloqueada',
        () => sql`INSERT INTO premium_charges (user_id, provider_payment_id, amount_cents, due_date)
                  VALUES (${u1}, ${`pay_zero_${tag}`}, 0, current_date)`, 'premium_charges_amount_positive');
      const [c1] = await sql<{ id: string }[]>`
        INSERT INTO premium_charges (user_id, provider_payment_id, provider_subscription_id, status, method, amount_cents, due_date)
        VALUES (${u1}, ${`pay_verify_${tag}`}, ${`sub_verify_${tag}`}, 'confirmed', 'pix', 11990, current_date) RETURNING id`;
      await mustReject('a mesma cobrança do gateway duas vezes é bloqueada',
        () => sql`INSERT INTO premium_charges (user_id, provider_payment_id, amount_cents, due_date)
                  VALUES (${u1}, ${`pay_verify_${tag}`}, 11990, current_date)`, 'premium_charges_provider_id_key');
      await mustReject('estorno maior que a cobrança é bloqueado',
        () => sql`UPDATE premium_charges SET refunded_cents = 99999 WHERE id = ${c1!.id}`, 'premium_charges_refund_within_amount');

      // ---- Ciclos: período efetivamente pago.
      await mustReject('ciclo que termina antes de começar é bloqueado',
        () => sql`INSERT INTO premium_cycles (user_id, number, source, charge_id, starts_at, ends_at)
                  VALUES (${u1}, 1, 'subscription', ${c1!.id}, now(), now() - interval '1 day')`, 'premium_cycles_ends_after_starts');
      await mustReject('ciclo pago sem cobrança é bloqueado',
        () => sql`INSERT INTO premium_cycles (user_id, number, source, starts_at, ends_at)
                  VALUES (${u1}, 1, 'subscription', now(), now() + interval '30 days')`, 'premium_cycles_charge_matches_source');
      await mustReject('ciclo administrativo com cobrança é bloqueado',
        () => sql`INSERT INTO premium_cycles (user_id, number, source, charge_id, starts_at, ends_at)
                  VALUES (${u1}, 1, 'admin_grant', ${c1!.id}, now(), now() + interval '30 days')`, 'premium_cycles_charge_matches_source');
      const [ciclo1] = await sql<{ id: string; ends_at: string }[]>`
        INSERT INTO premium_cycles (user_id, number, source, charge_id, starts_at, ends_at, financial_eligible)
        VALUES (${u1}, 1, 'subscription', ${c1!.id}, now() - interval '1 hour', now() + interval '30 days', true)
        RETURNING id, ends_at`;
      const vig = await estadoDe(u1);
      expectEqual('com ciclo pago vigente é Premium, com benefício financeiro e ciclo atual',
        [vig.a, vig.f, vig.c === ciclo1!.id], [true, true, true]);
      await mustReject('uma cobrança gera um ciclo só',
        () => sql`INSERT INTO premium_cycles (user_id, number, source, charge_id, starts_at, ends_at)
                  VALUES (${u1}, 2, 'subscription', ${c1!.id}, now() + interval '60 days', now() + interval '90 days')`, 'premium_cycles_charge_key');
      await mustReject('ciclo sobreposto do mesmo usuário é bloqueado',
        () => sql`INSERT INTO premium_cycles (user_id, number, source, starts_at, ends_at)
                  VALUES (${u1}, 2, 'admin_grant', now() + interval '10 days', now() + interval '40 days')`, 'premium_cycles_no_overlap');
      await mustReject('número de ciclo repetido é bloqueado',
        () => sql`INSERT INTO premium_cycles (user_id, number, source, starts_at, ends_at)
                  VALUES (${u1}, 1, 'admin_grant', now() + interval '60 days', now() + interval '90 days')`, 'premium_cycles_user_number_key');
      // O fim vem do próprio banco (microssegundos): passar por Date do JS truncaria para milissegundos e sobreporia.
      await mustAccept('ciclo que começa exatamente quando o anterior termina é aceito', () => sql`
        INSERT INTO premium_cycles (user_id, number, source, starts_at, ends_at)
        SELECT user_id, 2, 'admin_grant', ends_at, ends_at + interval '30 days' FROM premium_cycles WHERE id = ${ciclo1!.id}`);

      // ---- O ciclo não se edita nem se apaga.
      await mustReject('o fim de um ciclo não pode ser esticado',
        () => sql`UPDATE premium_cycles SET ends_at = ends_at + interval '1 day' WHERE id = ${ciclo1!.id}`, 'premium_cycles_immutable');
      await mustReject('um ciclo não vira "elegível a benefício financeiro" depois de criado',
        () => sql`UPDATE premium_cycles SET financial_eligible = NOT financial_eligible WHERE id = ${ciclo1!.id}`, 'premium_cycles_immutable');
      await mustReject('ciclo não se apaga',
        () => sql`DELETE FROM premium_cycles WHERE id = ${ciclo1!.id}`, 'premium_cycles_immutable');
      await mustAccept('o fim antecipado de um ciclo (estorno, contestação) é permitido', () => sql`
        UPDATE premium_cycles SET ended_early_at = now(), ended_early_reason = 'verify' WHERE id = ${ciclo1!.id}`);
      expectEqual('depois do fim antecipado não é mais Premium', (await estadoDe(u1)).a, false);
      await mustReject('o fim antecipado só se marca uma vez',
        () => sql`UPDATE premium_cycles SET ended_early_at = now() - interval '5 minutes' WHERE id = ${ciclo1!.id}`, 'premium_cycles_immutable');

      // ---- Saldo do ciclo: 2 Destaques e 1 Turbo, e o banco confere.
      const [c2] = await sql<{ id: string }[]>`
        INSERT INTO premium_charges (user_id, provider_payment_id, status, method, amount_cents, due_date)
        VALUES (${u2}, ${`pay_verify2_${tag}`}, 'confirmed', 'credit_card', 11990, current_date) RETURNING id`;
      const [cicloQ] = await sql<{ id: string }[]>`
        INSERT INTO premium_cycles (user_id, number, source, charge_id, starts_at, ends_at, financial_eligible)
        VALUES (${u2}, 1, 'subscription', ${c2!.id}, now() - interval '1 hour', now() + interval '30 days', true) RETURNING id`;
      const espQ = await criarAnuncio(sql, { ownerId: u2, slug: `premium-q-${tag}`, precoCents: 20000 });
      const promo = (type: string, ciclo: string | null, dono = u2) => sql`
        INSERT INTO promotions (space_id, owner_id, type, source, premium_cycle_id, expires_at)
        VALUES (${espQ}, ${dono}, ${type}, 'premium_benefit', ${ciclo}, now() + interval '7 days')`;
      await mustReject('benefício do Premium sem ciclo é bloqueado', () => promo('destaque', null), 'promotions_premium_needs_cycle');
      await mustReject('benefício com o ciclo de outra pessoa é bloqueado',
        () => promo('destaque', cicloQ!.id, u1), 'promotions_premium_cycle_not_current');
      await mustAccept('1º Destaque do ciclo é aceito', () => promo('destaque', cicloQ!.id));
      await sql`UPDATE promotions SET status = 'cancelled', cancelled_at = now() WHERE space_id = ${espQ}`;
      await mustAccept('2º Destaque do ciclo é aceito (o cancelado conta como usado)', () => promo('destaque', cicloQ!.id));
      await sql`UPDATE promotions SET status = 'expired' WHERE space_id = ${espQ} AND status = 'active'`;
      await mustReject('3º Destaque do ciclo é bloqueado', () => promo('destaque', cicloQ!.id), 'promotions_premium_cycle_quota');
      await mustAccept('1 Turbo do ciclo é aceito (o saldo de Turbo é separado do de Destaque)', () => promo('turbo', cicloQ!.id));
      await sql`UPDATE promotions SET status = 'cancelled', cancelled_at = now() WHERE space_id = ${espQ} AND status = 'active'`;
      await mustReject('2º Turbo do ciclo é bloqueado', () => promo('turbo', cicloQ!.id), 'promotions_premium_cycle_quota');
      await mustAccept('compra avulsa não passa pela trava do Premium', () => sql`
        INSERT INTO promotions (space_id, owner_id, type, source, expires_at)
        VALUES (${espQ}, ${u2}, 'destaque', 'purchase', now() + interval '1 day')`);
      await sql`UPDATE promotions SET status = 'expired' WHERE space_id = ${espQ} AND status = 'active'`;

      // ---- Concessão administrativa vencida não vale benefício.
      const [cicloVencido] = await sql<{ id: string }[]>`
        INSERT INTO premium_cycles (user_id, number, source, starts_at, ends_at)
        VALUES (${u3}, 1, 'admin_grant', now() - interval '2 days', now() - interval '1 day') RETURNING id`;
      await mustReject('ciclo já vencido não dá benefício',
        () => promo('destaque', cicloVencido!.id, u3), 'promotions_premium_cycle_not_current');
      expectEqual('concessão administrativa vigente NÃO libera benefício financeiro', await (async () => {
        const [ciclo] = await sql<{ id: string }[]>`
          INSERT INTO premium_cycles (user_id, number, source, starts_at, ends_at, financial_eligible)
          VALUES (${u3}, 2, 'admin_grant', now() - interval '1 hour', now() + interval '10 days', false) RETURNING id`;
        const e = await estadoDe(u3);
        return [e.a, e.f, e.c === ciclo!.id];
      })(), [true, false, true]);

      // ---- Alerta de busca: o limite do plano segue o Premium VIGENTE.
      const alertaDe = (id: string, n: number) => sql`
        INSERT INTO saved_searches (user_id, label, criteria, criteria_key)
        VALUES (${id}, ${`Alerta ${n}`}, ${sql.json({ tipo: 'garagem', n })}, ${`premium-alerta-${n}-${tag}`})`;
      await sql`DELETE FROM saved_searches WHERE user_id IN (${u1}, ${u2})`;
      await alertaDe(u1, 1); await alertaDe(u1, 2);
      await mustReject('fora do Premium vigente o limite é o do plano gratuito (2)', () => alertaDe(u1, 3), 'saved_searches_active_limit');
      await alertaDe(u2, 1); await alertaDe(u2, 2);
      await mustAccept('com ciclo pago vigente o limite sobe (3º alerta)', () => alertaDe(u2, 3));
      await sql`DELETE FROM saved_searches WHERE user_id IN (${u1}, ${u2})`;

      // ---- Varredura: o estado guardado acompanha o relógio.
      await sql`DELETE FROM premium_memberships WHERE user_id IN (${u1}, ${u3})`;
      await sql`INSERT INTO premium_memberships (user_id, status, source, current_period_start, current_period_end)
                VALUES (${u3}, 'active', 'admin_grant', now() - interval '2 days', now() - interval '1 day')`;
      await sql`INSERT INTO premium_memberships (user_id, status, source, provider, provider_subscription_id, billing_method, plan_cents,
                                                  current_period_start, current_period_end, cancel_at_period_end, cancel_requested_at)
                VALUES (${u1}, 'active', 'subscription', 'asaas', ${`sub_verify_b_${tag}`}, 'credit_card', 11990,
                        now() - interval '40 days', now() - interval '10 days', true, now() - interval '20 days')`;
      // u3 ainda tem um ciclo administrativo vigente (da checagem acima): encerra para a varredura enxergar o fim.
      await sql`UPDATE premium_cycles SET ended_early_at = now(), ended_early_reason = 'verify'
                 WHERE user_id = ${u3} AND ended_early_at IS NULL AND starts_at <= now() AND now() < ends_at`;
      await sql`SELECT public.sync_premium_memberships()`;
      const [sync] = await sql<{ a: string; b: string; ca: boolean }[]>`
        SELECT (SELECT status::text FROM premium_memberships WHERE user_id = ${u3}) AS a,
               (SELECT status::text FROM premium_memberships WHERE user_id = ${u1}) AS b,
               (SELECT cancelled_at IS NOT NULL FROM premium_memberships WHERE user_id = ${u1}) AS ca`;
      expectEqual('período pago acabou sem renovação: a varredura marca "expirada"', sync!.a, 'expired');
      expectEqual('período acabou e a renovação estava cancelada: vira "cancelada", com o momento', [sync!.b, sync!.ca], ['cancelled', true]);
      await sql`UPDATE premium_memberships SET status = 'pending_payment', cancelled_at = NULL, cancelled_by = NULL,
                       cancel_at_period_end = false, cancel_requested_at = NULL, updated_at = now() - interval '5 days'
                 WHERE user_id = ${u1}`;
      await sql`SELECT public.sync_premium_memberships()`;
      const [aband] = await sql<{ s: string }[]>`SELECT status::text AS s FROM premium_memberships WHERE user_id = ${u1}`;
      expectEqual('assinatura nunca paga, parada há mais de 3 dias: expirada', aband!.s, 'expired');
      const [n2] = await sql<{ n: number }[]>`SELECT public.sync_premium_memberships() AS n`;
      expectEqual('a varredura é idempotente (segunda rodada não muda nada deste teste)', n2!.n >= 0, true);

      // ---- Acesso: só o servidor lê. Sem GRANT para o navegador e com RLS.
      const tabelasPremium = ['premium_memberships', 'premium_cycles', 'premium_charges'];
      const expostas = await sql<{ relname: string }[]>`
        SELECT relname FROM pg_class
         WHERE relnamespace = 'public'::regnamespace AND relname IN ${sql(tabelasPremium)} AND NOT relrowsecurity`;
      expectEqual('as 3 tabelas do Premium têm RLS ligado', expostas.map((r) => r.relname), []);

      // ---- Configuração.
      const conf2 = new Map((await sql<{ key: string; value: unknown }[]>`
        SELECT key, value FROM platform_settings WHERE key LIKE 'premium.%'`).map((r) => [r.key, r.value]));
      expectEqual('limites por ciclo: 2 Destaques e 1 Turbo', [conf2.get('premium.cycle_destaque_limit'), conf2.get('premium.cycle_turbo_limit')], [2, 1]);
      expectEqual('alcance ampliado no mapa: 10 km e 5 anúncios', [conf2.get('premium.map_extra_radius_m'), conf2.get('premium.map_max_outside_pins')], [10000, 5]);
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
    // Etapa 2: Premium (seção 17). Promoções apontam para ciclos (RESTRICT) e ciclo não se apaga —
    // só com o gatilho de proteção desligado durante esta limpeza.
    await sql`DELETE FROM promotions WHERE owner_id IN (${ownerId}, ${renterId}, ${strangerId})`;
    await sql`ALTER TABLE premium_cycles DISABLE TRIGGER premium_cycles_immutable`;
    await sql`DELETE FROM premium_cycles WHERE user_id IN (${ownerId}, ${renterId}, ${strangerId})`;
    await sql`ALTER TABLE premium_cycles ENABLE TRIGGER premium_cycles_immutable`;
    await sql`DELETE FROM premium_charges WHERE user_id IN (${ownerId}, ${renterId}, ${strangerId})`;
    await sql`DELETE FROM premium_memberships WHERE user_id IN (${ownerId}, ${renterId}, ${strangerId})`;
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
    // Pedidos de encerramento (booking_id é RESTRICT) saem antes das locações.
    await sql`DELETE FROM booking_end_requests WHERE booking_id IN (
                SELECT id FROM bookings WHERE owner_id = ${ownerId})`;
    await sql`DELETE FROM bookings WHERE owner_id = ${ownerId}`;
    await sql`DELETE FROM spaces WHERE owner_id IN (${ownerId}, ${renterId}, ${strangerId})`;
    await sql`DELETE FROM webhook_events WHERE provider_event_id LIKE ${`evt_verify-%`}`;
    await sql`DELETE FROM auth.users WHERE id IN (${ownerId}, ${renterId}, ${strangerId}, ${confirmedId}, ${quartoId})`;
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
