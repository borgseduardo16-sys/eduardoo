import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { serverEnv } from '@/lib/env';

/**
 * Cliente Supabase para codigo de servidor (Server Components, Server Actions,
 * Route Handlers).
 *
 * Usa a ANON KEY e o JWT do usuario vindo do cookie: toda consulta feita por
 * aqui passa pelo RLS. Para operacoes administrativas legitimas use
 * `createAdminClient()`, que e explicitamente privilegiado.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components nao podem escrever cookies. A renovacao do
            // token acontece no proxy.ts, que pode — entao ignorar aqui e
            // seguro e esperado.
          }
        },
      },
    },
  );
}
