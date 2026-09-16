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

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL nao definida.');
const sql = postgres(url, { max: 1, onnotice: () => {} });

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
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes(expectFragment.toLowerCase())) {
      ok(name, `bloqueado por: ${expectFragment}`);
    } else {
      bad(name, `rejeitou, mas por outro motivo: ${msg.slice(0, 160)}`);
    }
  }
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
    const [space] = await sql<{ id: string }[]>`
      INSERT INTO spaces (owner_id, slug, type, status, title, city, state,
                          price_monthly_cents, location, approx_location, published_at)
      VALUES (${ownerId}, ${`garagem-${tag}`}, 'garagem', 'published',
              'Garagem coberta perto do centro', 'Colatina', 'ES', 18000,
              ST_SetSRID(ST_MakePoint(-40.6295, -19.5386), 4326),
              ST_SetSRID(ST_MakePoint(-40.6320, -19.5410), 4326),
              now())
      RETURNING id`;
    spaceId = space.id;
    ok('anuncio publicado com coordenada');

    await mustReject(
      'publicar sem coordenada e bloqueado',
      () => sql`
        INSERT INTO spaces (owner_id, slug, type, status, title, price_monthly_cents)
        VALUES (${ownerId}, ${`sem-geo-${tag}`}, 'deposito', 'published', 'Sem geo', 10000)`,
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
          'active', CURRENT_DATE, ${amounts.monthlyRentCents}, ${amounts.renterFeeBps},
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

    await mustReject(
      'duas locacoes vigentes no mesmo espaco e bloqueado',
      () => sql`
        INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, start_date,
          monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
          owner_fee_cents, total_charged_cents, owner_payout_cents)
        VALUES (${`MP-DUP-${tag.slice(-4)}`}, ${spaceId}, ${strangerId}, ${ownerId},
          'active', CURRENT_DATE, 18000, 300, 300, 540, 540, 18540, 17460)`,
      'bookings_one_active_per_space',
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
  } finally {
    // Limpeza: apagar o usuario cascateia para perfil, espacos, reservas etc.
    // ledger_entries e append-only, entao sai antes, por fora do trigger.
    await sql`ALTER TABLE ledger_entries DISABLE TRIGGER ledger_entries_append_only`;
    await sql`DELETE FROM ledger_entries WHERE booking_id IN (
                SELECT id FROM bookings WHERE owner_id = ${ownerId})`;
    await sql`ALTER TABLE ledger_entries ENABLE TRIGGER ledger_entries_append_only`;
    await sql`DELETE FROM reviews WHERE author_id IN (${ownerId}, ${renterId}, ${strangerId})`;
    await sql`DELETE FROM bookings WHERE owner_id = ${ownerId}`;
    await sql`DELETE FROM spaces WHERE owner_id = ${ownerId}`;
    await sql`DELETE FROM webhook_events WHERE provider_event_id LIKE ${`evt_verify-%`}`;
    await sql`DELETE FROM auth.users WHERE id IN (${ownerId}, ${renterId}, ${strangerId})`;
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
