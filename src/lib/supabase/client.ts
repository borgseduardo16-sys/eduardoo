'use client';
import { createBrowserClient } from '@supabase/ssr';

/**
 * Cliente Supabase do navegador.
 *
 * Usa apenas a ANON KEY, que e publica por design — o que protege os dados e o
 * RLS, nao o segredo da chave. Serve para autenticacao e para o chat em tempo
 * real. Consultas de negocio ficam no servidor.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
