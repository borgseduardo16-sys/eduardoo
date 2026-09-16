import { config as loadEnv } from 'dotenv';

// Next.js le .env.local automaticamente; o drizzle-kit roda fora dele.
loadEnv({ path: ['.env.local', '.env'], quiet: true });

import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL nao definida. Copie .env.example para .env.local.');
}

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL },
  // Nao deixe o drizzle-kit tentar gerenciar os schemas internos do Supabase.
  schemaFilter: ['public'],
  verbose: true,
  strict: true,
});
