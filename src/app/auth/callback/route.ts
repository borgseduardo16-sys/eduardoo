import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSafeRedirect } from '@/lib/auth/redirect';

/**
 * Troca o código do link de e-mail por uma sessão real.
 *
 * O Supabase manda o usuário para cá com `?code=...`. Só depois desta troca
 * existe sessão — por isso as páginas protegidas não aceitam o código direto.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const nextParam = searchParams.get('next');
  const next = nextParam && isSafeRedirect(nextParam) ? nextParam : '/minha-conta';

  if (!code) {
    return NextResponse.redirect(`${origin}/entrar?erro=link_invalido`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/entrar?erro=link_expirado`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
