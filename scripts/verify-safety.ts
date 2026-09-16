/**
 * Verificacao do subsistema de seguranca.
 *
 * Duas metades:
 *   1. Funcoes puras (documentos, detector de contato) — entrada e saida
 *   2. Invariantes no banco (bloqueio, denuncia, reincidencia) — tenta violar
 *      cada regra e confirma que o Postgres recusa
 *
 *   pnpm tsx scripts/verify-safety.ts
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: ['.env.local', '.env'], quiet: true });

import postgres from 'postgres';
import { isValidCpf, isValidCnpj, isBrazilianPhone, maskDocument } from '../src/lib/safety/documents';
import { detectContactInfo, buildFlagReason } from '../src/lib/safety/contact-detection';
import { severityFor, isReasonValidForTarget, reasonsForTarget } from '../src/lib/safety/report-config';
import { computeBookingAmounts, platformNetCents, formatBRL } from '../src/lib/money';

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
function expect(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) ok(name);
  else bad(name, `esperava ${JSON.stringify(expected)}, veio ${JSON.stringify(actual)}`);
}

async function mustReject(name: string, fn: () => Promise<unknown>, fragment: string) {
  try {
    await fn();
    bad(name, 'o banco ACEITOU algo que deveria recusar');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes(fragment.toLowerCase())) ok(name, `bloqueado: ${fragment}`);
    else bad(name, `recusou por outro motivo: ${msg.slice(0, 160)}`);
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
  const tag = `sec-${Date.now()}`;
  const ana = crypto.randomUUID();
  const bruno = crypto.randomUUID();
  const carla = crypto.randomUUID();
  let spaceId = '';
  let convId = '';
  let msgId = '';

  try {
    // =====================================================================
    console.log('\n\x1b[1m1. Validacao de CPF e CNPJ\x1b[0m');
    expect('CPF valido aceito', isValidCpf('111.444.777-35'), true);
    expect('CPF com digito errado recusado', isValidCpf('111.444.777-36'), false);
    expect('CPF de digito repetido recusado', isValidCpf('111.111.111-11'), false);
    expect('CPF curto recusado', isValidCpf('1114447773'), false);
    expect('CNPJ valido aceito', isValidCnpj('11.222.333/0001-81'), true);
    expect('CNPJ com digito errado recusado', isValidCnpj('11.222.333/0001-82'), false);
    expect('mascara nao expoe o documento', maskDocument('11144477735'), '***.444.777-**');
    expect('celular com DDD valido reconhecido', isBrazilianPhone('27999998888'), true);
    expect('numero com DDD inexistente recusado', isBrazilianPhone('00999998888'), false);
    expect('sequencia curta nao e telefone', isBrazilianPhone('12345'), false);

    // =====================================================================
    console.log('\n\x1b[1m2. Detector de contato — deve DETECTAR\x1b[0m');
    const positivos: [string, string][] = [
      ['meu whatsapp e (27) 99999-8888', 'telefone'],
      ['manda um email pra joao.silva@gmail.com', 'email'],
      ['meu email e joao silva arroba gmail ponto com', 'email'],
      ['minha chave pix e o cpf 111.444.777-35', 'cpf'],
      ['me chama no zap que a gente resolve', 'rede_social'],
      ['segue la instagram.com/meuperfil', 'rede_social'],
      ['me manda um pix de sinal que eu seguro pra voce', 'mencao_pagamento_externo'],
      ['a gente combina por fora e foge da taxa', 'mencao_pagamento_externo'],
      ['pode pagar em dinheiro na mao quando vier', 'mencao_pagamento_externo'],
    ];
    for (const [texto, esperado] of positivos) {
      const r = detectContactInfo(texto);
      if (r.kinds.includes(esperado as never)) {
        ok(`detecta ${esperado}`, `"${texto.slice(0, 44)}…"`);
      } else {
        bad(`detecta ${esperado}`, `"${texto}" → ${JSON.stringify(r.kinds)}`);
      }
    }

    console.log('\n\x1b[1m3. Detector de contato — NAO pode dar falso positivo\x1b[0m');
    const negativos = [
      'o aluguel e R$ 1.500,00 por mes',
      'o espaco tem 18 m2 e pe direito de 3,5 m',
      'o CEP do local e 29700-000',
      'reserva de 16/09/2026 ate 16/03/2027',
      'posso pagar por Pix aqui pelo aplicativo?',
      'tem vaga para 2 carros e 1 moto',
      'o valor total ficou R$ 12.345.678,90',
    ];
    for (const texto of negativos) {
      const r = detectContactInfo(texto);
      if (r.matches.length === 0) ok('nao sinaliza', `"${texto.slice(0, 46)}…"`);
      else bad('falso positivo', `"${texto}" → ${JSON.stringify(r.kinds)}`);
    }

    console.log('\n\x1b[1m4. Detector — combinacao de contato + pagamento\x1b[0m');
    {
      const r = detectContactInfo('me chama no 27 99999-8888 que te passo o pix');
      if (r.kinds.includes('telefone') && r.kinds.includes('mencao_pagamento_externo')) {
        ok('telefone + pix na mesma mensagem vira alerta forte');
      } else {
        bad('telefone + pix', JSON.stringify(r.kinds));
      }
      expect('shouldWarn ligado', r.shouldWarn, true);
      const flag = buildFlagReason(r);
      if (flag?.startsWith('contato:') && !flag.includes('99999')) {
        ok('flag_reason guarda o tipo, nao o dado', flag);
      } else {
        bad('flag_reason', String(flag));
      }
    }

    // =====================================================================
    console.log('\n\x1b[1m5. Motivos e severidade de denuncia\x1b[0m');
    expect('assedio e critico', severityFor('assedio'), 'critical');
    expect('spam e baixo', severityFor('spam'), 'low');
    expect('"nao compareceu" nao serve para anuncio', isReasonValidForTarget('nao_compareceu', 'space'), false);
    expect('"anuncio falso" serve para anuncio', isReasonValidForTarget('anuncio_falso', 'space'), true);
    {
      const rs = reasonsForTarget('message');
      if (rs.length > 0 && rs.every((r) => isReasonValidForTarget(r.value, 'message'))) {
        ok('lista de motivos por alvo e coerente', `${rs.length} motivos para mensagem`);
      } else {
        bad('motivos por alvo', JSON.stringify(rs));
      }
    }

    // =====================================================================
    console.log('\n\x1b[1m6. Taxas vigentes no banco\x1b[0m');
    {
      const rows = await sql<{ key: string; value: number }[]>`
        SELECT key, value::text::int AS value FROM platform_settings
        WHERE key IN ('fees.renter_fee_bps','fees.owner_fee_bps','booking.min_rent_cents')`;
      const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      expect('taxa do locatario = 3%', cfg['fees.renter_fee_bps'], 300);
      expect('taxa do proprietario = 3%', cfg['fees.owner_fee_bps'], 300);
      expect('aluguel minimo = R$ 35,00', cfg['booking.min_rent_cents'], 3500);

      const a = computeBookingAmounts(cfg['booking.min_rent_cents']!, {
        renterFeeBps: cfg['fees.renter_fee_bps']!,
        ownerFeeBps: cfg['fees.owner_fee_bps']!,
      });
      const pix = platformNetCents(a, 199);
      const card = platformNetCents(a, Math.round(a.totalChargedCents * 0.0299) + 49);
      if (pix >= 0 && card >= 0) {
        ok('no minimo, a plataforma nao perde dinheiro', `Pix ${formatBRL(pix)} · cartao ${formatBRL(card)}`);
      } else {
        bad('minimo abaixo do equilibrio', `Pix ${formatBRL(pix)} · cartao ${formatBRL(card)}`);
      }
    }

    // =====================================================================
    console.log('\n\x1b[1m7. Bloqueio entre usuarios\x1b[0m');
    await sql`INSERT INTO auth.users (id, email) VALUES
      (${ana}, ${`ana-${tag}@example.com`}),
      (${bruno}, ${`bruno-${tag}@example.com`}),
      (${carla}, ${`carla-${tag}@example.com`})`;
    await sql`UPDATE profiles SET role='owner' WHERE id=${ana}`;

    const [space] = await sql<{ id: string }[]>`
      INSERT INTO spaces (owner_id, slug, type, status, title, city, state,
                          price_monthly_cents, location, approx_location, published_at)
      VALUES (${ana}, ${`box-${tag}`}, 'deposito', 'published', 'Deposito seco no centro',
              'Colatina', 'ES', 25000,
              ST_SetSRID(ST_MakePoint(-40.6295, -19.5386), 4326),
              ST_SetSRID(ST_MakePoint(-40.6320, -19.5410), 4326), now())
      RETURNING id`;
    spaceId = space.id;

    const [conv] = await sql<{ id: string }[]>`
      INSERT INTO conversations (space_id, renter_id, owner_id)
      VALUES (${spaceId}, ${bruno}, ${ana}) RETURNING id`;
    convId = conv.id;

    const [msg] = await sql<{ id: string }[]>`
      INSERT INTO messages (conversation_id, sender_id, body)
      VALUES (${convId}, ${bruno}, 'Da pra guardar uma moto ai?') RETURNING id`;
    msgId = msg.id;
    ok('conversa e mensagem criadas normalmente');

    await mustReject(
      'estranho nao envia mensagem em conversa alheia',
      () => sql`INSERT INTO messages (conversation_id, sender_id, body)
                VALUES (${convId}, ${carla}, 'oi')`,
      'nao participa desta conversa',
    );

    // Ana bloqueia Bruno.
    await sql`INSERT INTO user_blocks (blocker_id, blocked_id, reason)
              VALUES (${ana}, ${bruno}, 'insistiu em pagar por fora')`;

    const [fechada] = await sql<{ closed_at: Date | null }[]>`
      SELECT closed_at FROM conversations WHERE id = ${convId}`;
    if (fechada.closed_at) ok('bloquear encerrou a conversa existente');
    else bad('bloqueio', 'a conversa continuou aberta');

    await mustReject(
      'bloqueado nao envia mais mensagem',
      () => sql`INSERT INTO messages (conversation_id, sender_id, body)
                VALUES (${convId}, ${bruno}, 'oi de novo')`,
      'encerrada',
    );

    await mustReject(
      'bloqueado nao inicia nova conversa',
      () => sql`INSERT INTO conversations (space_id, renter_id, owner_id)
                VALUES (${spaceId}, ${bruno}, ${ana})`,
      'bloqueio entre os usuarios',
    );

    await mustReject(
      'bloqueado nao reserva o espaco',
      () => sql`
        INSERT INTO bookings (reference, space_id, renter_id, owner_id, status, start_date,
          monthly_rent_cents, renter_fee_bps, owner_fee_bps, renter_fee_cents,
          owner_fee_cents, total_charged_cents, owner_payout_cents)
        VALUES (${`MP-BLK-${tag.slice(-4)}`}, ${spaceId}, ${bruno}, ${ana}, 'requested',
          CURRENT_DATE, 25000, 300, 300, 750, 750, 25750, 24250)`,
      'bloqueio entre os usuarios',
    );

    await mustReject(
      'ninguem bloqueia a si mesmo',
      () => sql`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (${ana}, ${ana})`,
      'user_blocks_distinct',
    );

    await mustAccept('mensagem do sistema ainda passa', () =>
      sql`INSERT INTO messages (conversation_id, sender_id, body, is_system)
          VALUES (${convId}, ${ana}, 'Conversa encerrada por bloqueio.', true)`,
    );

    // =====================================================================
    console.log('\n\x1b[1m8. Denuncias\x1b[0m');
    await mustAccept('denunciar um anuncio', () =>
      sql`INSERT INTO reports (target_type, space_id, reporter_id, reason, severity)
          VALUES ('space', ${spaceId}, ${carla}, 'anuncio_falso', 'high')`,
    );

    await mustAccept('denunciar um usuario', () =>
      sql`INSERT INTO reports (target_type, target_user_id, reporter_id, reason, severity, details)
          VALUES ('user', ${ana}, ${carla}, 'assedio', 'critical', 'Mensagens insistentes.')`,
    );

    await mustAccept('denunciar uma mensagem', () =>
      sql`INSERT INTO reports (target_type, message_id, reporter_id, reason, severity)
          VALUES ('message', ${msgId}, ${ana}, 'pagamento_fora_plataforma', 'high')`,
    );

    await mustReject(
      'denuncia sem alvo coerente e recusada',
      () => sql`INSERT INTO reports (target_type, reporter_id, reason)
                VALUES ('space', ${carla}, 'spam')`,
      'reports_target_matches_type',
    );

    await mustReject(
      'denuncia com dois alvos e recusada',
      () => sql`INSERT INTO reports (target_type, space_id, target_user_id, reporter_id, reason)
                VALUES ('space', ${spaceId}, ${ana}, ${carla}, 'spam')`,
      'reports_target_matches_type',
    );

    await mustReject(
      'autodenuncia e recusada',
      () => sql`INSERT INTO reports (target_type, target_user_id, reporter_id, reason)
                VALUES ('user', ${carla}, ${carla}, 'spam')`,
      'reports_no_self_report',
    );

    await mustReject(
      'denuncia duplicada em aberto e recusada',
      () => sql`INSERT INTO reports (target_type, space_id, reporter_id, reason)
                VALUES ('space', ${spaceId}, ${carla}, 'spam')`,
      'reports_one_open_per_target',
    );

    // Evidencia capturada por trigger
    const [ev] = await sql<{ evidence_snapshot: Record<string, unknown> | null }[]>`
      SELECT evidence_snapshot FROM reports
      WHERE target_type='message' AND message_id=${msgId} LIMIT 1`;
    if (ev?.evidence_snapshot && 'body' in ev.evidence_snapshot) {
      ok('evidencia da mensagem foi capturada', `body: "${String(ev.evidence_snapshot.body).slice(0, 30)}…"`);
    } else {
      bad('evidencia', JSON.stringify(ev?.evidence_snapshot));
    }

    // A evidencia sobrevive ao conteudo original sumir
    await sql`UPDATE messages SET body='texto editado depois' WHERE id=${msgId}`;
    const [ev2] = await sql<{ evidence_snapshot: Record<string, unknown> | null }[]>`
      SELECT evidence_snapshot FROM reports
      WHERE target_type='message' AND message_id=${msgId} LIMIT 1`;
    if (String(ev2?.evidence_snapshot?.body).includes('moto')) {
      ok('evidencia sobrevive a edicao do conteudo denunciado');
    } else {
      bad('evidencia', 'foi perdida quando a mensagem mudou');
    }

    // =====================================================================
    console.log('\n\x1b[1m9. Reincidencia\x1b[0m');
    const antes = await sql<{ upheld_report_count: number }[]>`
      SELECT upheld_report_count FROM profiles WHERE id=${ana}`;
    await sql`UPDATE reports SET upheld = true, status='resolved', resolved_at=now()
              WHERE target_type='user' AND target_user_id=${ana}`;
    const depois = await sql<{ upheld_report_count: number }[]>`
      SELECT upheld_report_count FROM profiles WHERE id=${ana}`;

    if (depois[0]!.upheld_report_count > antes[0]!.upheld_report_count) {
      ok(
        'denuncia procedente aumenta a contagem do denunciado',
        `${antes[0]!.upheld_report_count} → ${depois[0]!.upheld_report_count}`,
      );
    } else {
      bad('reincidencia', `contagem nao mudou (${depois[0]!.upheld_report_count})`);
    }
  } finally {
    await sql`DELETE FROM reports WHERE reporter_id IN (${ana}, ${bruno}, ${carla})`;
    await sql`DELETE FROM messages WHERE conversation_id = ${convId || crypto.randomUUID()}`;
    await sql`DELETE FROM conversations WHERE space_id = ${spaceId || crypto.randomUUID()}`;
    await sql`DELETE FROM bookings WHERE owner_id = ${ana}`;
    await sql`DELETE FROM spaces WHERE owner_id = ${ana}`;
    await sql`DELETE FROM auth.users WHERE id IN (${ana}, ${bruno}, ${carla})`;
  }

  console.log(
    `\n\x1b[1mResultado:\x1b[0m \x1b[32m${passed} passaram\x1b[0m` +
      (failed ? `, \x1b[31m${failed} falharam\x1b[0m` : '') + '\n',
  );
  await sql.end();
  if (failed > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error('\n\x1b[31mErro fatal:\x1b[0m', err);
  await sql.end();
  process.exit(1);
});
