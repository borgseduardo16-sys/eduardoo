import 'server-only';
import { z } from 'zod';

/**
 * Validacao de variaveis de ambiente.
 *
 * Regra do projeto: nada de valor padrao silencioso para credencial.
 * - `serverEnv` valida na inicializacao o que e obrigatorio para o app subir.
 * - `requireIntegration` valida sob demanda o que pertence a uma fase ainda
 *   nao liberada, e lanca um erro explicito dizendo exatamente o que falta.
 *
 * Nunca importe este arquivo em Client Components: o `server-only` acima
 * transforma isso em erro de build, e nao em vazamento de chave.
 */

const nonEmpty = (name: string) =>
  z.string({ error: `${name} nao definida` }).min(1, `${name} esta vazia`);

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // --- Obrigatorias (FASE 1) ---
  NEXT_PUBLIC_SUPABASE_URL: nonEmpty('NEXT_PUBLIC_SUPABASE_URL').url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmpty('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: nonEmpty('SUPABASE_SERVICE_ROLE_KEY'),
  DATABASE_URL: nonEmpty('DATABASE_URL'),
  NEXT_PUBLIC_SITE_URL: nonEmpty('NEXT_PUBLIC_SITE_URL').url(),

  // --- Opcionais por fase: validadas em requireIntegration() ---
  ASAAS_API_KEY: z.string().optional(),
  ASAAS_ENV: z.enum(['sandbox', 'production']).optional(),
  ASAAS_WEBHOOK_TOKEN: z.string().optional(),
  GEOCODING_PROVIDER: z.enum(['google', 'maptiler']).optional(),
  GOOGLE_GEOCODING_API_KEY: z.string().optional(),
  NEXT_PUBLIC_MAPTILER_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
});

function parseEnv() {
  const parsed = baseSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(raiz)'}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Variaveis de ambiente invalidas ou ausentes:\n${issues}\n\n` +
        `Copie .env.example para .env.local e preencha os valores. ` +
        `Veja docs/SETUP.md para o passo a passo de cada servico.`,
    );
  }
  return parsed.data;
}

export const serverEnv = parseEnv();

/** Integracoes externas por fase. Cada uma lista as variaveis que precisa. */
const INTEGRATIONS = {
  payments: {
    label: 'Pagamentos (Asaas)',
    vars: ['ASAAS_API_KEY', 'ASAAS_ENV', 'ASAAS_WEBHOOK_TOKEN'],
    doc: 'docs/SETUP.md#4-asaas-pagamentos',
  },
  geocoding: {
    label: 'Geocodificacao de enderecos',
    vars: ['GEOCODING_PROVIDER'],
    doc: 'docs/SETUP.md#3-mapas-e-geocodificacao',
  },
  email: {
    label: 'Envio de email transacional (Resend)',
    vars: ['RESEND_API_KEY', 'EMAIL_FROM'],
    doc: 'docs/SETUP.md#5-resend-emails',
  },
  rateLimit: {
    label: 'Rate limiting (Upstash Redis)',
    vars: ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
    doc: 'docs/SETUP.md#6-upstash-rate-limiting',
  },
} as const;

export type IntegrationName = keyof typeof INTEGRATIONS;

export class IntegrationNotConfiguredError extends Error {
  constructor(
    readonly integration: IntegrationName,
    readonly missing: string[],
  ) {
    const cfg = INTEGRATIONS[integration];
    super(
      `Integracao "${cfg.label}" nao esta configurada. ` +
        `Variaveis faltando: ${missing.join(', ')}. Veja ${cfg.doc}.`,
    );
    this.name = 'IntegrationNotConfiguredError';
  }
}

/**
 * Garante que uma integracao externa esta configurada antes de usa-la.
 * Lanca IntegrationNotConfiguredError quando falta credencial — de proposito.
 * Nenhuma funcionalidade deve "fingir" que funcionou sem a credencial real.
 */
export function requireIntegration<T extends IntegrationName>(
  name: T,
): Record<(typeof INTEGRATIONS)[T]['vars'][number], string> {
  const cfg = INTEGRATIONS[name];
  const missing: string[] = [];
  const out: Record<string, string> = {};

  for (const v of cfg.vars) {
    const value = process.env[v];
    if (!value) missing.push(v);
    else out[v] = value;
  }

  if (missing.length > 0) throw new IntegrationNotConfiguredError(name, missing);
  return out as Record<(typeof INTEGRATIONS)[T]['vars'][number], string>;
}

/** Checagem sem lancar erro — para a UI mostrar honestamente o que falta. */
export function isIntegrationConfigured(name: IntegrationName): boolean {
  return INTEGRATIONS[name].vars.every((v) => Boolean(process.env[v]));
}

export const isProduction = serverEnv.NODE_ENV === 'production';
