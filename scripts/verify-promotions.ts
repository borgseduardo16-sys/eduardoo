/**
 * Verificacao do sistema de Destaques/Turbo/Premium (Fase 13 — Parte 5)
 * contra Postgres real.
 *
 * Chama as Server Actions de verdade (`activatePromotionAction`,
 * `cancelPromotionAction`), nao so o schema — prova que a regra de negocio
 * (autorizacao, cota mensal, Premium, concorrencia) esta realmente
 * aplicada no codigo, nao so no banco.
 *
 *   pnpm tsx scripts/verify-promotions.ts
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: ['.env.local', '.env'], quiet: true });

import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
req.cache[req.resolve('server-only')] = {
  id: 'server-only', filename: 'server-only', loaded: true, exports: {},
} as never;

import postgres from 'postgres';
import { PG_CONNECTION_PARAMS } from '../src/db/connection';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL nao definida.');
const sql = postgres(url, { max: 5, onnotice: () => {}, connection: PG_CONNECTION_PARAMS });

let passed = 0;
let failed = 0;
const falhas: string[] = [];

function ok(name: string, detail = '') {
  passed++;
  console.log(`  \x1b[32mOK\x1b[0m ${name}${detail ? ` \x1b[2m${detail}\x1b[0m` : ''}`);
}
function bad(name: string, detail: string) {
  failed++;
  falhas.push(name);
  console.log(`  \x1b[31mFALHOU\x1b[0m ${name}\n      ${detail}`);
}
function expect(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) ok(name, JSON.stringify(actual));
  else bad(name, `esperava ${JSON.stringify(expected)}, veio ${JSON.stringify(actual)}`);
}
function assert(name: string, condicao: boolean, detalhe = '') {
  if (condicao) ok(name, detalhe);
  else bad(name, detalhe || 'condicao falsa');
}
function secao(titulo: string) {
  console.log(`\n\x1b[1m${titulo}\x1b[0m`);
}

// ---------------------------------------------------------------------------

const tag = `promo-${Date.now()}`;
const dono1Id = crypto.randomUUID(); // Premium
const dono2Id = crypto.randomUUID(); // nao Premium
const outroId = crypto.randomUUID(); // tenta mexer no espaco alheio

type Identidade = { id: string; role: 'user' | 'owner' | 'admin'; fullName: string; email: string };
let identidadeAtual: Identidade = { id: '', role: 'user', fullName: '', email: '' };
function entrarComo(id: string, role: Identidade['role'], fullName: string) {
  identidadeAtual = { id, role, fullName, email: `${id}@exemplo.invalid` };
}

async function seedPerfis() {
  await sql`INSERT INTO auth.users (id, email) VALUES
    (${dono1Id}, ${`${tag}-dono1@exemplo.invalid`}),
    (${dono2Id}, ${`${tag}-dono2@exemplo.invalid`}),
    (${outroId}, ${`${tag}-outro@exemplo.invalid`})`;
  await sql`UPDATE profiles SET role='owner', full_name='Dono Premium' WHERE id=${dono1Id}`;
  await sql`UPDATE profiles SET role='owner', full_name='Dono Sem Premium' WHERE id=${dono2Id}`;
  await sql`UPDATE profiles SET role='owner', full_name='Outro Dono' WHERE id=${outroId}`;
  await sql`INSERT INTO premium_memberships (user_id, status, source, granted_by)
    VALUES (${dono1Id}, 'active', 'admin_grant', ${dono1Id})`;
}

/*
 * Coordenada ISOLADA de proposito — nunca a de CENTRO_COLATINA
 * (-19.5386,-40.6295) que verify-busca.ts usa como fixture e conta com
 * exatidao por raio. Anuncio publicado aqui, uma vez com promocao,
 * atravessa `expireStalePromotions`/auditoria e pode ficar como residuo
 * (mesma razao documentada em verify-payments.ts) — se caisse no mesmo
 * ponto, contaminaria pra sempre a contagem de qualquer busca por raio de
 * QUALQUER execucao futura de verify-busca.ts. Ja aconteceu nesta sessao
 * (rodadas que quebraram no meio, antes deste comentario existir, deixaram
 * 23 anuncios orfaos exatamente no centro de Colatina — limpos manualmente).
 */
const PONTO_ISOLADO = { lat: -18.777, lng: -40.222 };

async function seedEspacoPublicado(ownerId: string, sufixo: string): Promise<string> {
  const slug = `${tag}-${sufixo}`;
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO spaces (owner_id, slug, type, title, description, district, city, state,
      available_from, price_monthly_cents, size_m2, location)
    VALUES (${ownerId}, ${slug}, 'garagem', ${`Garagem de teste ${sufixo}`},
      'Descricao com mais de vinte caracteres para passar na regra do banco.',
      'Centro', 'Colatina', 'ES', CURRENT_DATE, 25000, 20,
      ST_SetSRID(ST_MakePoint(${PONTO_ISOLADO.lng}, ${PONTO_ISOLADO.lat}), 4326))
    RETURNING id`;
  const id = row!.id;
  for (const n of [0, 1, 2]) {
    await sql`INSERT INTO space_images (space_id, storage_path, position)
      VALUES (${id}, ${`${ownerId}/${id}/f${n}.jpg`}, ${n})`;
  }
  await sql`UPDATE spaces SET status='published', published_at=now() WHERE id=${id}`;
  return id;
}

async function seedEspacoRascunho(ownerId: string, sufixo: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO spaces (owner_id, slug, type, title, description, district, city, state,
      available_from, price_monthly_cents, size_m2, location, status)
    VALUES (${ownerId}, ${`${tag}-${sufixo}`}, 'garagem', ${`Espaco ${sufixo}`},
      'Descricao com mais de vinte caracteres para passar na regra do banco.',
      'Centro', 'Colatina', 'ES', CURRENT_DATE, 25000, 20,
      ST_SetSRID(ST_MakePoint(${PONTO_ISOLADO.lng}, ${PONTO_ISOLADO.lat}), 4326), 'draft')
    RETURNING id`;
  return row!.id;
}

/*
 * So `DELETE FROM spaces` — nunca `space_images` a parte. A trigger
 * `guard_delete_photo_of_published` so libera apagar foto de anuncio
 * publicado quando o proprio anuncio ja sumiu de `spaces` (cascata
 * verdadeira, checada dentro da propria trigger); apagar a foto ANTES,
 * com o anuncio ainda 'published', e exatamente o que ela existe para
 * barrar. `promotions`/`space_images` cascateiam sozinhas de `spaces`.
 *
 * `profiles`/`auth.users` podem falhar ao apagar: toda action deste
 * arquivo grava em `audit_logs` (append-only de verdade, protegida por
 * trigger), e apagar o perfil tentaria um UPDATE ali (actor_id -> NULL por
 * ON DELETE SET NULL) — que a trigger recusa. Mesmo padrao ja aceito em
 * `verify-integracoes.ts`: fica como residuo inerte, o teste nao trava.
 */
async function limpar(ids: string[]) {
  await sql`DELETE FROM premium_memberships WHERE user_id = ANY(${ids})`;
  await sql`DELETE FROM spaces WHERE owner_id = ANY(${ids})`;
  try {
    await sql`DELETE FROM profiles WHERE id = ANY(${ids})`;
    await sql`DELETE FROM auth.users WHERE id = ANY(${ids})`;
  } catch (err) {
    console.log(`  \x1b[2mperfil(is) de teste com lancamento em audit_logs — fica como residuo inerte (esperado): ${String(err).slice(0, 140)}\x1b[0m`);
  }
}

async function main() {
  secao('0. Semente');
  await seedPerfis();
  const espacoA = await seedEspacoPublicado(dono1Id, 'a');
  const espacoB = await seedEspacoPublicado(dono1Id, 'b');
  const espacoC = await seedEspacoPublicado(dono1Id, 'c');
  const espacoRascunho = await seedEspacoRascunho(dono1Id, 'rascunho');
  const espacoDono2 = await seedEspacoPublicado(dono2Id, 'dono2');
  ok('semente criada', `2 donos (1 premium), 4 espacos publicados + 1 rascunho`);

  // Mock da DAL (identidade) e do next/cache — mesmo padrao de verify-payments.ts.
  const dalPath = req.resolve('../src/lib/auth/dal.ts');
  req.cache[dalPath] = {
    id: dalPath, filename: dalPath, loaded: true,
    exports: {
      requireUserOrThrow: async () => {
        if (!identidadeAtual.id) throw new Error('Voce precisa entrar para continuar.');
        return {
          id: identidadeAtual.id, role: identidadeAtual.role, email: identidadeAtual.email,
          fullName: identidadeAtual.fullName, avatarPath: null, status: 'active',
          statusReason: null, acceptedTermsAt: new Date(),
        };
      },
      getCurrentUser: async () => null,
    },
  } as never;

  const cachePath = req.resolve('next/cache');
  req.cache[cachePath] = {
    id: cachePath, filename: cachePath, loaded: true,
    exports: { revalidatePath: () => {}, revalidateTag: () => {} },
  } as never;

  const { activatePromotionAction, cancelPromotionAction } = await import('../src/lib/promotions/actions');
  const { getMonthlyBenefitUsage, getActivePromotionForSpace, listFeaturedSpaces, expireStalePromotions } =
    await import('../src/lib/promotions/queries');

  function fd(campos: Record<string, string>): FormData {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  }

  // =========================================================================
  secao('1. Ativacao basica');
  // =========================================================================

  entrarComo(dono1Id, 'owner', 'Dono Premium');
  const rAtivaDestaque = await activatePromotionAction(undefined, fd({ spaceId: espacoA, type: 'destaque' }));
  assert('ativa Destaque no proprio espaco publicado', rAtivaDestaque.ok, rAtivaDestaque.message ?? '');

  const ativa = await getActivePromotionForSpace(espacoA);
  assert('promocao gravada como active', ativa?.status === 'active', JSON.stringify(ativa));
  expect('tipo gravado e destaque', ativa?.type, 'destaque');
  assert('expiresAt e depois de startedAt', (ativa?.expiresAt.getTime() ?? 0) > (ativa?.startedAt.getTime() ?? 0));

  const uso1 = await getMonthlyBenefitUsage(dono1Id);
  expect('uso mensal reflete 1 destaque usado', uso1.destaque.used, 1);
  expect('uso mensal mostra premium=true', uso1.premium, true);

  // =========================================================================
  secao('2. Autorizacao — so o dono promove o proprio anuncio');
  // =========================================================================

  entrarComo(outroId, 'user', 'Outro');
  const rOutroTentaEspacoAlheio = await activatePromotionAction(undefined, fd({ spaceId: espacoB, type: 'destaque' }));
  assert('outro usuario NAO consegue promover espaco de dono1', !rOutroTentaEspacoAlheio.ok, rOutroTentaEspacoAlheio.message ?? '');

  const semPromocao = await getActivePromotionForSpace(espacoB);
  assert('espaco B continua sem promocao apos a tentativa', semPromocao === null);

  const rEspacoInexistente = await activatePromotionAction(
    undefined,
    fd({ spaceId: crypto.randomUUID(), type: 'destaque' }),
  );
  assert('espaco inexistente e recusado', !rEspacoInexistente.ok, rEspacoInexistente.message ?? '');

  // =========================================================================
  secao('3. So anuncio PUBLICADO pode ser promovido');
  // =========================================================================

  entrarComo(dono1Id, 'owner', 'Dono Premium');
  const rRascunho = await activatePromotionAction(undefined, fd({ spaceId: espacoRascunho, type: 'destaque' }));
  assert('rascunho nao pode ser destacado', !rRascunho.ok, rRascunho.message ?? '');

  await sql`UPDATE spaces SET status='paused' WHERE id=${espacoC}`;
  const rPausado = await activatePromotionAction(undefined, fd({ spaceId: espacoC, type: 'destaque' }));
  assert('anuncio pausado nao pode ser destacado', !rPausado.ok, rPausado.message ?? '');
  await sql`UPDATE spaces SET status='published' WHERE id=${espacoC}`;

  // =========================================================================
  secao('4. Usuario sem Premium nao usa beneficio nenhum');
  // =========================================================================

  entrarComo(dono2Id, 'owner', 'Dono Sem Premium');
  const rSemPremium = await activatePromotionAction(undefined, fd({ spaceId: espacoDono2, type: 'destaque' }));
  assert('dono sem Premium e recusado', !rSemPremium.ok, rSemPremium.message ?? '');
  assert('mensagem menciona Premium', (rSemPremium.message ?? '').toLowerCase().includes('premium'));

  // =========================================================================
  secao('5. Cota mensal — 2 Destaques, nao acumula, nao inventa saldo');
  // =========================================================================

  entrarComo(dono1Id, 'owner', 'Dono Premium');
  const rSegundoDestaque = await activatePromotionAction(undefined, fd({ spaceId: espacoB, type: 'destaque' }));
  assert('2o Destaque do mes (espaco diferente) e aceito', rSegundoDestaque.ok, rSegundoDestaque.message ?? '');

  const rTerceiroDestaque = await activatePromotionAction(undefined, fd({ spaceId: espacoC, type: 'destaque' }));
  assert('3o Destaque do mes e recusado — cota e 2', !rTerceiroDestaque.ok, rTerceiroDestaque.message ?? '');

  const uso2 = await getMonthlyBenefitUsage(dono1Id);
  expect('uso mensal trava em 2, nao sobe com a tentativa recusada', uso2.destaque.used, 2);
  expect('restante do mes e zero', uso2.destaque.remaining, 0);

  // =========================================================================
  secao('6. Turbo — cota de 1, hierarquia propria');
  // =========================================================================

  const rTurbo = await activatePromotionAction(undefined, fd({ spaceId: espacoC, type: 'turbo' }));
  assert('1o Turbo do mes e aceito (espaco C ainda sem promocao)', rTurbo.ok, rTurbo.message ?? '');

  const espacoExtra = await seedEspacoPublicado(dono1Id, 'extra-turbo');
  const rSegundoTurbo = await activatePromotionAction(undefined, fd({ spaceId: espacoExtra, type: 'turbo' }));
  assert('2o Turbo do mes e recusado — cota e 1', !rSegundoTurbo.ok, rSegundoTurbo.message ?? '');

  // =========================================================================
  secao('7. Nao sobrepor promocao no MESMO espaco');
  // =========================================================================

  const rSobrepoe = await activatePromotionAction(undefined, fd({ spaceId: espacoA, type: 'turbo' }));
  assert('nao da pra promover um espaco que ja tem promocao ativa', !rSobrepoe.ok, rSobrepoe.message ?? '');

  // =========================================================================
  secao('8. Cancelamento — nao devolve credito');
  // =========================================================================

  const espacoC_promo = await getActivePromotionForSpace(espacoC);
  const rCancela = await cancelPromotionAction(undefined, fd({ promotionId: espacoC_promo!.id }));
  assert('dono cancela a propria promocao', rCancela.ok, rCancela.message ?? '');

  const depoisCancelar = await getActivePromotionForSpace(espacoC);
  assert('espaco C fica sem promocao vigente apos cancelar', depoisCancelar === null);

  const [statusNoBanco] = await sql<{ status: string; cancelled_by: string | null }[]>`
    SELECT status, cancelled_by FROM promotions WHERE id=${espacoC_promo!.id}`;
  expect('status gravado como cancelled', statusNoBanco!.status, 'cancelled');
  expect('cancelled_by e quem cancelou', statusNoBanco!.cancelled_by, dono1Id);

  const usoAposCancelar = await getMonthlyBenefitUsage(dono1Id);
  expect('cancelar NAO devolve o Turbo consumido', usoAposCancelar.turbo.used, 1);

  const rCancelaDeNovo = await cancelPromotionAction(undefined, fd({ promotionId: espacoC_promo!.id }));
  assert('cancelar a mesma promocao de novo e recusado', !rCancelaDeNovo.ok, rCancelaDeNovo.message ?? '');

  entrarComo(outroId, 'user', 'Outro');
  const promoEspacoA = await getActivePromotionForSpace(espacoA);
  const rOutroCancela = await cancelPromotionAction(undefined, fd({ promotionId: promoEspacoA!.id }));
  assert('outro usuario nao cancela promocao alheia', !rOutroCancela.ok, rOutroCancela.message ?? '');

  // =========================================================================
  secao('9. Concorrencia real');
  // =========================================================================

  /*
   * As duas travas de concorrencia protegem coisas DIFERENTES — testadas
   * separadamente, cada uma com cota fresca, para nao confundir "recusado
   * porque a cota ja estava zerada antes da corrida" com "recusado porque a
   * trava funcionou durante a corrida".
   */

  // --- 9a. Duas pessoas^Wo MESMO dono tentando gastar o ULTIMO credito do
  // mes em DOIS anuncios diferentes ao mesmo tempo — trava e o FOR UPDATE em
  // premium_memberships. Sem ela, as duas transacoes poderiam ler "0 usados"
  // antes de qualquer uma commitar, e as duas passariam (cota furada).
  const dono4Id = crypto.randomUUID();
  await sql`INSERT INTO auth.users (id, email) VALUES (${dono4Id}, ${`${tag}-dono4@exemplo.invalid`})`;
  await sql`UPDATE profiles SET role='owner', full_name='Dono Quatro' WHERE id=${dono4Id}`;
  await sql`INSERT INTO premium_memberships (user_id, status, source, granted_by)
    VALUES (${dono4Id}, 'active', 'admin_grant', ${dono4Id})`;
  const espacoRaceX = await seedEspacoPublicado(dono4Id, 'race-x');
  const espacoRaceY = await seedEspacoPublicado(dono4Id, 'race-y');

  entrarComo(dono4Id, 'owner', 'Dono Quatro');
  const [respostaCotaX, respostaCotaY] = await Promise.all([
    activatePromotionAction(undefined, fd({ spaceId: espacoRaceX, type: 'turbo' })),
    activatePromotionAction(undefined, fd({ spaceId: espacoRaceY, type: 'turbo' })),
  ]);
  const sucessosCota = [respostaCotaX, respostaCotaY].filter((r) => r.ok).length;
  expect('cota de 1 Turbo: EXATAMENTE uma das duas corridas simultaneas venceu', sucessosCota, 1);

  const usoDono4 = await getMonthlyBenefitUsage(dono4Id);
  expect('a cota nao foi furada pela corrida — continua em 1 usado', usoDono4.turbo.used, 1);

  // --- 9b. Duas ativacoes simultaneas no MESMO anuncio (cota abundante, so
  // uma pessoa) — trava e o indice unico parcial `promotions_one_active_per_space`.
  // dono1 ja esgotou a propria cota nas secoes 5/6 — reusa dono4 (cota fresca).
  const espacoRaceZ = await seedEspacoPublicado(dono4Id, 'race-z');
  entrarComo(dono4Id, 'owner', 'Dono Quatro');
  const [respostaEspacoA, respostaEspacoB] = await Promise.all([
    activatePromotionAction(undefined, fd({ spaceId: espacoRaceZ, type: 'destaque' })),
    activatePromotionAction(undefined, fd({ spaceId: espacoRaceZ, type: 'destaque' })),
  ]);
  const sucessosMesmoEspaco = [respostaEspacoA, respostaEspacoB].filter((r) => r.ok).length;
  expect('mesmo espaco: EXATAMENTE uma das duas ativacoes simultaneas venceu', sucessosMesmoEspaco, 1);

  const [{ n: promocoesNoEspacoZ }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM promotions WHERE space_id=${espacoRaceZ} AND status IN ('scheduled','active')`;
  expect('o banco tem exatamente UMA promocao vigente no espaco', promocoesNoEspacoZ, 1);

  await limpar([dono4Id]);

  // =========================================================================
  secao('10. Vitrine publica — hierarquia Turbo > Destaque, so publicado');
  // =========================================================================

  // Neste ponto: espacoA=destaque ativo, espacoB=destaque ativo.
  // Cria um Turbo de verdade concedendo mais Premium a um dono a parte,
  // para nao brigar com a cota ja esgotada de dono1.
  const dono3Id = crypto.randomUUID();
  await sql`INSERT INTO auth.users (id, email) VALUES (${dono3Id}, ${`${tag}-dono3@exemplo.invalid`})`;
  await sql`UPDATE profiles SET role='owner', full_name='Dono Tres' WHERE id=${dono3Id}`;
  await sql`INSERT INTO premium_memberships (user_id, status, source, granted_by)
    VALUES (${dono3Id}, 'active', 'admin_grant', ${dono3Id})`;
  const espacoTurbo = await seedEspacoPublicado(dono3Id, 'turbo-vitrine');

  entrarComo(dono3Id, 'owner', 'Dono Tres');
  const rTurboVitrine = await activatePromotionAction(undefined, fd({ spaceId: espacoTurbo, type: 'turbo' }));
  assert('turbo da vitrine ativado', rTurboVitrine.ok, rTurboVitrine.message ?? '');

  const vitrine = await listFeaturedSpaces(20);
  const idsVitrine = vitrine.map((v) => v.id);
  assert('espaco com Turbo aparece na vitrine', idsVitrine.includes(espacoTurbo));
  assert('espaco A (Destaque) aparece na vitrine', idsVitrine.includes(espacoA));
  const posTurbo = idsVitrine.indexOf(espacoTurbo);
  const posDestaqueA = idsVitrine.indexOf(espacoA);
  assert('Turbo aparece ANTES de Destaque na vitrine', posTurbo < posDestaqueA,
    `turbo=${posTurbo} destaque=${posDestaqueA}`);
  assert('anuncio pausado com promocao cancelada nao aparece', !idsVitrine.includes(espacoC));

  // =========================================================================
  secao('11. Expiracao preguicosa');
  // =========================================================================

  const [promoVencidaId] = await sql<{ id: string }[]>`
    INSERT INTO promotions (space_id, owner_id, type, status, source, started_at, expires_at)
    VALUES (${espacoRascunho}, ${dono1Id}, 'destaque', 'active', 'premium_benefit',
      now() - interval '10 days', now() - interval '3 days')
    RETURNING id`.then((r) => r as { id: string }[]);
  for (const n of [0, 1, 2]) {
    await sql`INSERT INTO space_images (space_id, storage_path, position)
      VALUES (${espacoRascunho}, ${`${dono1Id}/${espacoRascunho}/f${n}.jpg`}, ${n})`;
  }
  await sql`UPDATE spaces SET status='published', published_at=now() WHERE id=${espacoRascunho}`;

  const varridas = await expireStalePromotions();
  assert('a varredura encontrou a promocao vencida', varridas >= 1, `${varridas}`);

  const [statusPosVarredura] = await sql<{ status: string }[]>`
    SELECT status FROM promotions WHERE id=${promoVencidaId!.id}`;
  expect('promocao vencida virou expired', statusPosVarredura!.status, 'expired');

  const vitrineDepois = await listFeaturedSpaces(20);
  assert('espaco com promocao vencida some da vitrine', !vitrineDepois.map((v) => v.id).includes(espacoRascunho));

  // =========================================================================
  await limpar([dono3Id, dono1Id, dono2Id, outroId]);

  console.log(`\n\x1b[1mResultado:\x1b[0m ${passed} passaram, ${failed} falharam`);
  if (failed > 0) {
    console.log('Falharam:', falhas.join(', '));
  }
  await sql.end();
  if (failed > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
