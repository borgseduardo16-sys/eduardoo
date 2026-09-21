/**
 * Checklist de prontidao para producao (Fase 12).
 *
 * Nao e um teste — nao falha o build nem faz parte de `pnpm verify`. E um
 * RELATORIO do que falta antes de aceitar o primeiro usuario real, lendo o
 * mesmo `.env.local` que o app le. Cobre em codigo o que dava pra automatizar
 * da checklist manual em docs/SETUP.md; o resto (documentos juridicos,
 * plano pago, backup testado) continua exigindo julgamento humano, e por
 * isso aparece aqui como lembrete, nao como checagem.
 *
 *   pnpm check:producao
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: ['.env.local', '.env'], quiet: true });

import postgres from 'postgres';
import { PG_CONNECTION_PARAMS } from '../src/db/connection';

const VERDE = '\x1b[32m';
const VERMELHO = '\x1b[31m';
const AMARELO = '\x1b[33m';
const FRACO = '\x1b[2m';
const FORTE = '\x1b[1m';
const FIM = '\x1b[0m';

let bloqueantes = 0;
let avisos = 0;

function pronto(label: string, detalhe = '') {
  console.log(`  ${VERDE}✓${FIM} ${label}${detalhe ? ` ${FRACO}${detalhe}${FIM}` : ''}`);
}
function faltando(label: string, detalhe: string) {
  bloqueantes++;
  console.log(`  ${VERMELHO}✗${FIM} ${label}\n      ${detalhe}`);
}
function lembrete(label: string, detalhe: string) {
  avisos++;
  console.log(`  ${AMARELO}!${FIM} ${label}\n      ${detalhe}`);
}
function secao(titulo: string) {
  console.log(`\n${FORTE}${titulo}${FIM}`);
}

function configurado(...vars: string[]): boolean {
  return vars.every((v) => Boolean(process.env[v]?.trim()));
}

async function main() {
  secao('1. Integracoes externas');

  if (configurado('ASAAS_API_KEY', 'ASAAS_ENV', 'ASAAS_WEBHOOK_TOKEN')) {
    if (process.env.ASAAS_ENV === 'production') {
      pronto('Asaas configurado em PRODUCAO', 'confirme que o KYC da subconta foi aprovado antes do primeiro repasse real');
    } else {
      lembrete('Asaas configurado, mas ainda em sandbox', 'troque ASAAS_ENV=production quando for cobrar de verdade');
    }
  } else {
    faltando('Asaas nao configurado', 'sem isso nao ha cobranca real — ver docs/SETUP.md §4');
  }

  if (configurado('RESEND_API_KEY', 'EMAIL_FROM')) {
    pronto('Resend configurado (e-mails transacionais)');
  } else {
    faltando('Resend nao configurado', 'notificacoes de reserva/mensagem nao serao enviadas — ver docs/SETUP.md §5');
  }

  if (configurado('UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN')) {
    pronto('Upstash configurado', 'rate limiting com contador compartilhado entre instancias');
  } else {
    faltando('Upstash nao configurado', 'o rate limiting cai pro limitador em memoria, que nao protege nada em serverless com mais de uma instancia — ver docs/SETUP.md §6');
  }

  if (configurado('NEXT_PUBLIC_SENTRY_DSN')) {
    pronto('Sentry configurado (monitoramento de erro)');
  } else {
    faltando('Sentry nao configurado', 'falhas em producao so aparecem se um usuario reclamar — ver docs/SETUP.md §7');
  }

  if (configurado('GEOCODING_PROVIDER')) {
    pronto('Geocodificacao de endereco configurada', String(process.env.GEOCODING_PROVIDER));
  } else {
    lembrete('Geocodificacao de endereco nao configurada', 'busca por CEP continua funcionando; busca por texto livre de endereco fica limitada — ver docs/SETUP.md §3.4');
  }

  if (configurado('GOOGLE_PLACES_API_KEY')) {
    pronto('Google Places API configurada', 'area de prospeccao (/prospectar) pode buscar empresas de verdade');
  } else {
    lembrete('Google Places API nao configurada', 'a busca de empresas em /prospectar falha com mensagem explicita ate a chave existir — ver docs/SETUP.md §8');
  }

  secao('2. Ambiente e infraestrutura');

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  if (/localhost|127\.0\.0\.1/.test(siteUrl)) {
    faltando('NEXT_PUBLIC_SITE_URL ainda aponta para localhost', `valor atual: ${siteUrl || '(vazio)'}`);
  } else if (siteUrl.startsWith('https://')) {
    pronto('NEXT_PUBLIC_SITE_URL aponta para um dominio real com HTTPS', siteUrl);
  } else {
    faltando('NEXT_PUBLIC_SITE_URL nao usa HTTPS', siteUrl || '(vazio)');
  }

  const dbUrl = process.env.DATABASE_URL ?? '';
  if (/localhost|127\.0\.0\.1/.test(dbUrl)) {
    faltando('DATABASE_URL ainda aponta para o Postgres local', 'aponte para o pooler do Supabase (porta 6543) em producao');
  } else if (dbUrl) {
    pronto('DATABASE_URL nao aponta para o Postgres local');
    if (!/:6543\b/.test(dbUrl)) {
      lembrete('DATABASE_URL nao parece usar o pooler (porta 6543)', 'serverless sem pooler esgota conexao rapido — confirme no painel do Supabase');
    }
  } else {
    faltando('DATABASE_URL nao definida', '');
  }

  secao('3. Banco: pelo menos um administrador');

  const dbUrlParaChecar = process.env.DATABASE_URL;
  if (!dbUrlParaChecar) {
    lembrete('Sem DATABASE_URL, nao foi possivel checar se ha um admin', '');
  } else {
    const sql = postgres(dbUrlParaChecar, { max: 1, onnotice: () => {}, connection: PG_CONNECTION_PARAMS });
    try {
      const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM profiles WHERE role = 'admin'`;
      if (n > 0) {
        pronto(`${n} conta(s) com role='admin'`, 'o painel /admin tem quem administre');
      } else {
        faltando('Nenhuma conta com role=\'admin\'', "UPDATE profiles SET role='admin' WHERE id='...' — ver docs/SETUP.md");
      }
    } catch (err) {
      lembrete('Nao foi possivel consultar o banco para checar administradores', String(err).slice(0, 200));
    } finally {
      await sql.end({ timeout: 5 });
    }
  }

  secao('4. Decisao humana — nada aqui e verificavel por script');

  lembrete('Termos de Uso e Politica de Privacidade revisados por advogado', 'obrigatorio: a plataforma trata CPF, localizacao e intermedia pagamento entre terceiros');
  lembrete('Supabase em plano pago', 'o plano gratis pausa o projeto por inatividade');
  lembrete('Vercel em plano pago (se for cobrar de alguem)', 'o plano Hobby proibe uso comercial');
  lembrete('SPF, DKIM e DMARC configurados no dominio de envio', 'sem isso o e-mail transacional cai em spam');
  lembrete('Backup do banco testado com uma restauracao de verdade', 'ter backup nao e o mesmo que saber restaurar');

  console.log(
    `\n${FORTE}Resumo:${FIM} ${bloqueantes ? `${VERMELHO}${bloqueantes} bloqueante(s)${FIM}` : `${VERDE}nenhum bloqueante automatizavel${FIM}`}` +
      `, ${AMARELO}${avisos} item(ns) que so voce decide${FIM}\n`,
  );
}

main().catch((err) => {
  console.error(`\n${VERMELHO}ERRO${FIM}`, err);
  process.exit(1);
});
