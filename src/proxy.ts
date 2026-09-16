import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Proxy (o que ate o Next.js 15 se chamava middleware).
 *
 * Faz DUAS coisas, e so estas duas:
 *   1. Renova o token do Supabase e reescreve os cookies. Server Components
 *      nao podem escrever cookie; aqui pode. Sem isto a sessao expira sozinha.
 *   2. Redireciona cedo quem claramente nao tem sessao, para nao renderizar
 *      uma pagina privada inteira antes de descobrir isso.
 *
 * O que NAO faz: autorizar. A checagem aqui e otimista — le o cookie, nao
 * consulta o banco, e roda tambem em rotas pre-carregadas. A autorizacao de
 * verdade (papel, conta bloqueada, dono do recurso) vive em src/lib/auth/dal.ts,
 * colada no acesso ao dado. Se este arquivo sumisse, nada vazaria.
 */

/** Rotas que exigem sessao. Prefixo casa com as subrotas. */
const PROTECTED_PREFIXES = [
  '/painel',
  '/minha-conta',
  '/anunciar',
  '/favoritos',
  '/mensagens',
  '/reservas',
  '/admin',
];

/** Rotas de autenticacao: quem ja entrou nao deveria voltar para elas. */
const AUTH_ROUTES = ['/entrar', '/criar-conta', '/recuperar-senha'];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Esta chamada e o que renova o token. Nao remova, e nao troque por
  // getSession(): getSession le o cookie sem validar assinatura.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = '/entrar';
    url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  if (user && AUTH_ROUTES.some((p) => pathname === p)) {
    const url = request.nextUrl.clone();
    url.pathname = '/minha-conta';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /**
     * Roda em tudo, menos arquivos estaticos e imagens — que nao tem sessao a
     * renovar e so gastariam tempo. Sem esta exclusao o proxy pode bloquear o
     * proprio CSS da pagina de login.
     */
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf)$).*)',
  ],
};
