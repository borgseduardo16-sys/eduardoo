/**
 * Verificacao do limitador de taxa compartilhado (Upstash Redis — Fase 12).
 *
 * Prova a diferenca que a Fase 12 promete: sem Upstash configurado, o
 * contador e um `Map` local (nao serve pra multiplas instancias); com
 * Upstash configurado, o contador e EXTERNO ao processo — provado aqui
 * manipulando o "Redis" do testbed por fora e confirmando que a proxima
 * chamada enxerga a mudanca, e nao um contador proprio esquecido em memoria.
 *
 *   pnpm tsx scripts/verify-rate-limit.ts
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: ['.env.local', '.env'], quiet: true });

import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
req.cache[req.resolve('server-only')] = {
  id: 'server-only', filename: 'server-only', loaded: true, exports: {},
} as never;

import { startTestbed, type Testbed } from './testbed/server';

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
function assert(name: string, condicao: boolean, detalhe = '') {
  if (condicao) ok(name, detalhe);
  else bad(name, detalhe || 'condicao falsa');
}
function expect(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) ok(name, JSON.stringify(actual));
  else bad(name, `esperava ${JSON.stringify(expected)}, veio ${JSON.stringify(actual)}`);
}
function secao(titulo: string) {
  console.log(`\n\x1b[1m${titulo}\x1b[0m`);
}

async function main() {
  let testbed: Testbed | null = null;

  // ===========================================================================
  secao('1. Sem Upstash configurado — limitador local, isolado por processo');
  // ===========================================================================
  {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const { rateLimit, usingSharedStore } = await import('../src/lib/rate-limit');
    assert('usingSharedStore() e false sem as variaveis', !usingSharedStore());

    const chave = `teste-local-${Date.now()}`;
    const r1 = await rateLimit(chave, { limit: 2, windowSeconds: 60 });
    const r2 = await rateLimit(chave, { limit: 2, windowSeconds: 60 });
    const r3 = await rateLimit(chave, { limit: 2, windowSeconds: 60 });
    assert('1a chamada permitida', r1.allowed);
    assert('2a chamada permitida (no limite)', r2.allowed);
    assert('3a chamada bloqueada (passou do limite)', !r3.allowed);
    assert('bloqueio informa retryAfterSeconds > 0', r3.retryAfterSeconds > 0, `${r3.retryAfterSeconds}s`);
  }

  // ===========================================================================
  secao('2. Com Upstash configurado — contador compartilhado de verdade');
  // ===========================================================================
  {
    testbed = await startTestbed();
    ok('testbed (fake do Upstash) no ar', testbed.url);

    process.env.UPSTASH_REDIS_REST_URL = testbed.url;
    process.env.UPSTASH_REDIS_REST_TOKEN = testbed.upstashToken;

    // Re-importa o modulo do zero: `isIntegrationConfigured`/`requireIntegration`
    // leem `process.env` na hora da chamada, entao nao precisa de cache-bust —
    // mas o teste teria falso positivo se dependesse de estado do modulo
    // anterior. Confirmando explicitamente que agora usa o Redis:
    const { rateLimit, usingSharedStore } = await import('../src/lib/rate-limit');
    assert('usingSharedStore() vira true com as variaveis definidas', usingSharedStore());

    const chave = `teste-upstash-${Date.now()}`;
    const r1 = await rateLimit(chave, { limit: 3, windowSeconds: 60 });
    expect('1a chamada: contagem 1, permitida', [r1.allowed, r1.remaining], [true, 2]);

    const [, linhaNoRedis] = [null, testbed.redisStore.get(chave)];
    assert('o testbed realmente gravou a chave no "Redis"', Boolean(linhaNoRedis));
    expect('contagem no Redis bate com o que a acao viu', linhaNoRedis?.count, 1);

    /*
     * A prova real de que isto e um contador COMPARTILHADO, nao um `Map`
     * esquecido dentro do modulo: mexemos no "Redis" por fora — como se
     * outra instancia do app tivesse incrementado — e confirmamos que a
     * PROXIMA chamada enxerga esse incremento externo. Um limitador em
     * memoria jamais veria isso, porque nunca consultou nada fora de si.
     */
    testbed.redisStore.set(chave, { ...linhaNoRedis!, count: 3 });
    const r2 = await rateLimit(chave, { limit: 3, windowSeconds: 60 });
    assert(
      'a chamada seguinte ve o incremento feito por fora (prova de contador compartilhado)',
      !r2.allowed,
      JSON.stringify(r2),
    );

    // --- limite realmente aplicado end-to-end, sem interferencia externa ---
    const chave2 = `teste-upstash-limite-${Date.now()}`;
    const resultados = [];
    for (let i = 0; i < 4; i++) resultados.push(await rateLimit(chave2, { limit: 3, windowSeconds: 60 }));
    expect('4 chamadas com limite 3: as 3 primeiras passam, a 4a bloqueia',
      resultados.map((r) => r.allowed), [true, true, true, false]);

    // --- token errado no Upstash: a acao nao quebra, cai pro limitador local ---
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token-errado-de-proposito';
    const chave3 = `teste-upstash-fallback-${Date.now()}`;
    let naoQuebrou = true;
    let resultadoFallback;
    try {
      resultadoFallback = await rateLimit(chave3, { limit: 5, windowSeconds: 60 });
    } catch {
      naoQuebrou = false;
    }
    assert('Upstash rejeitando o token nao derruba a acao (cai pro limitador local)', naoQuebrou);
    assert('e o resultado do fallback ainda e valido', Boolean(resultadoFallback?.allowed));
    process.env.UPSTASH_REDIS_REST_TOKEN = testbed.upstashToken;
  }

  await testbed?.close();

  console.log(`\n\x1b[1mResultado:\x1b[0m ${passed} passaram, ${failed} falharam`);
  if (failed) console.log(`Falhas: ${falhas.join(' | ')}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('\n\x1b[31mERRO\x1b[0m', err);
  process.exit(1);
});
