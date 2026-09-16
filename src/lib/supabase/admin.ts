import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { serverEnv } from '@/lib/env';

/**
 * Cliente com SERVICE ROLE. Ignora RLS por completo.
 *
 * Use apenas para o que exige privilegio de verdade: acoes do painel
 * administrativo, processamento de webhook e jobs. Toda chamada daqui precisa
 * ter feito a autorizacao ANTES, na Data Access Layer.
 *
 * Nunca importe este arquivo em Client Component — o `server-only` acima
 * transforma a tentativa em erro de build.
 */
export function createAdminClient() {
  return createSupabaseClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
