import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Confirmação de e-mail no cadastro.
 *
 * Aceita os dois formatos que o Supabase usa dependendo da configuração do
 * projeto: `token_hash` + `type` (fluxo novo) e `code` (PKCE).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const code = searchParams.get('code');

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as 'signup' | 'email_change' | 'recovery' | 'invite',
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(`${origin}/minha-conta?email=confirmado`);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/minha-conta?email=confirmado`);
  }

  return NextResponse.redirect(`${origin}/entrar?erro=confirmacao_invalida`);
}
