import 'server-only';
import { cache } from 'react';
import { redirect, notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db/client';
import { profiles } from '@/db/schema';

/**
 * Data Access Layer — o unico lugar onde se decide quem pode o que.
 *
 * Por que aqui e nao no proxy.ts: o proxy roda antes da rota e le apenas o
 * cookie, sem consultar o banco. Ele serve para redirecionar cedo (checagem
 * otimista), nao para autorizar. Quem autoriza de verdade e este modulo,
 * colado no acesso ao dado — que e o que a propria documentacao do Next.js
 * recomenda e o que sobrevive a um redirect esquecido.
 *
 * Todas as funcoes sao memoizadas por render com `cache()`, entao chamar
 * getCurrentUser() em cinco componentes da mesma pagina faz UMA consulta.
 */

export type SessionUser = {
  id: string;
  email: string;
  fullName: string | null;
  avatarPath: string | null;
  role: 'user' | 'owner' | 'admin';
  status: 'active' | 'suspended' | 'banned' | 'deleted';
  statusReason: string | null;
  acceptedTermsAt: Date | null;
};

/**
 * Usuario da requisicao atual, ou null.
 *
 * Usa `getUser()` e nao `getSession()`: getSession apenas le o cookie, que o
 * cliente pode forjar. getUser valida o token com o servidor de auth.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const [profile] = await db
    .select({
      id: profiles.id,
      fullName: profiles.fullName,
      avatarPath: profiles.avatarPath,
      role: profiles.role,
      status: profiles.status,
      statusReason: profiles.statusReason,
      acceptedTermsAt: profiles.acceptedTermsAt,
      deletedAt: profiles.deletedAt,
    })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  // Identidade sem perfil nao deveria acontecer (existe trigger para isso),
  // mas se acontecer tratamos como nao autenticado em vez de assumir permissao.
  if (!profile || profile.deletedAt) return null;

  return {
    id: profile.id,
    email: user.email ?? '',
    fullName: profile.fullName,
    avatarPath: profile.avatarPath,
    role: profile.role,
    status: profile.status,
    statusReason: profile.statusReason,
    acceptedTermsAt: profile.acceptedTermsAt,
  };
});

export class UnauthorizedError extends Error {
  constructor(message = 'Voce precisa entrar para continuar.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Voce nao tem permissao para esta acao.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class AccountBlockedError extends Error {
  constructor(readonly reason: string | null) {
    super(reason ?? 'Sua conta esta bloqueada.');
    this.name = 'AccountBlockedError';
  }
}

/**
 * Exige sessao valida e conta ativa. Redireciona para o login se nao houver.
 * Use em pages/layouts. Em Server Actions prefira `requireUserOrThrow`, que
 * lanca erro em vez de redirecionar.
 */
export async function requireUser(redirectTo?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const next = redirectTo ? `?next=${encodeURIComponent(redirectTo)}` : '';
    redirect(`/entrar${next}`);
  }
  if (user.status !== 'active') {
    redirect('/conta-bloqueada');
  }
  return user;
}

/** Versao para Server Actions e Route Handlers: lanca em vez de redirecionar. */
export async function requireUserOrThrow(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  if (user.status !== 'active') throw new AccountBlockedError(user.statusReason);
  return user;
}

/** Exige que o usuario possa publicar anuncios. */
export async function requireOwner(redirectTo?: string): Promise<SessionUser> {
  const user = await requireUser(redirectTo);
  if (user.role !== 'owner' && user.role !== 'admin') {
    // Nao e erro: e so alguem que ainda nao virou proprietario.
    redirect('/anunciar/comecar');
  }
  return user;
}

/**
 * Exige administrador.
 *
 * Responde 404 em vez de 403 de proposito: quem nao e admin nao deve nem
 * descobrir que o painel existe naquele endereco.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin' || user.status !== 'active') {
    notFound();
  }
  return user;
}

export async function requireAdminOrThrow(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin' || user.status !== 'active') {
    throw new ForbiddenError();
  }
  return user;
}

/** true quando ha sessao ativa — para a UI decidir o que mostrar. */
export async function isAuthenticated(): Promise<boolean> {
  return (await getCurrentUser()) !== null;
}
