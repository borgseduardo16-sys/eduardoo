'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db/client';
import { profiles, auditLogs } from '@/db/schema';
import { serverEnv } from '@/lib/env';
import { rateLimit, AUTH_LIMITS } from '@/lib/rate-limit';
import { isSafeRedirect } from './redirect';
import {
  signInSchema,
  signUpSchema,
  requestPasswordResetSchema,
  updatePasswordSchema,
} from './schemas';

/** Formato unico de retorno das actions, para o formulario exibir erro por campo. */
export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

const TERMS_VERSION = '2026-09-16';

/**
 * IP do cliente atras do proxy da hospedagem.
 *
 * Devolve null quando nao ha cabecalho de proxy — `audit_logs.ip` e coluna
 * `inet` e so aceita endereco valido ou NULL; um texto como "desconhecido"
 * quebraria o INSERT (22P02, invalid input syntax for type inet). Para os
 * limites de taxa (que usam o IP so como parte de uma chave de texto), quem
 * chama troca o null por um valor de agrupamento na propria chave.
 */
async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return h.get('x-real-ip') || null;
}

function tooManyRequests(seconds: number): ActionState {
  const minutes = Math.ceil(seconds / 60);
  return {
    ok: false,
    message:
      minutes > 1
        ? `Tentativas demais. Tente novamente em ${minutes} minutos.`
        : 'Tentativas demais. Aguarde um instante e tente de novo.',
  };
}

// ---------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------

export async function signUpAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    password: formData.get('password'),
    acceptTerms: formData.get('acceptTerms') === 'on',
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const ip = (await clientIp()) ?? 'sem-ip';
  const limit = await rateLimit(`signup:${ip}`, AUTH_LIMITS.signUp);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${serverEnv.NEXT_PUBLIC_SITE_URL}/auth/confirmar`,
    },
  });

  if (error) {
    // Nao revelamos se o e-mail ja existe: isso permitiria descobrir quem tem
    // conta na plataforma. O Supabase tambem trata assim por padrao.
    if (error.message.toLowerCase().includes('already registered')) {
      return {
        ok: true,
        message:
          'Enviamos um e-mail para voce. Abra a mensagem para confirmar o endereco e continuar.',
      };
    }
    return { ok: false, message: traduzirErroAuth(error.message) };
  }

  if (data.user) {
    // O perfil ja foi criado pela trigger em auth.users; aqui so registramos
    // o aceite dos termos, que e informacao nossa e nao do Supabase.
    await db
      .update(profiles)
      .set({ acceptedTermsAt: new Date(), acceptedTermsVersion: TERMS_VERSION })
      .where(eq(profiles.id, data.user.id));
  }

  return {
    ok: true,
    message:
      'Conta criada. Enviamos um e-mail de confirmacao — abra a mensagem para ativar seu acesso.',
  };
}

// ---------------------------------------------------------------------------
// Entrar
// ---------------------------------------------------------------------------

export async function signInAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const ip = (await clientIp()) ?? 'sem-ip';
  // Limita por IP e tambem por e-mail: so por IP, uma botnet contorna;
  // so por e-mail, da para bloquear a conta de outra pessoa de proposito.
  const byIp = await rateLimit(`signin:ip:${ip}`, AUTH_LIMITS.signIn);
  if (!byIp.allowed) return tooManyRequests(byIp.retryAfterSeconds);
  const byEmail = await rateLimit(`signin:email:${parsed.data.email}`, AUTH_LIMITS.signIn);
  if (!byEmail.allowed) return tooManyRequests(byEmail.retryAfterSeconds);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { ok: false, message: traduzirErroAuth(error.message) };
  }

  // Conta bloqueada pelo admin nao entra, mesmo com a senha correta.
  const [profile] = await db
    .select({ status: profiles.status, reason: profiles.statusReason })
    .from(profiles)
    .where(eq(profiles.id, data.user.id))
    .limit(1);

  if (profile && profile.status !== 'active') {
    await supabase.auth.signOut();
    return {
      ok: false,
      message: profile.reason ?? 'Esta conta esta bloqueada. Fale com o suporte.',
    };
  }

  const next = formData.get('next');
  const target = typeof next === 'string' && isSafeRedirect(next) ? next : '/minha-conta';

  revalidatePath('/', 'layout');
  redirect(target);
}

// ---------------------------------------------------------------------------
// Sair
// ---------------------------------------------------------------------------

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}

// ---------------------------------------------------------------------------
// Recuperacao de senha
// ---------------------------------------------------------------------------

export async function requestPasswordResetAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const parsed = requestPasswordResetSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const ip = (await clientIp()) ?? 'sem-ip';
  const limit = await rateLimit(`reset:${ip}`, AUTH_LIMITS.passwordReset);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${serverEnv.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/redefinir-senha`,
  });

  // Resposta identica exista ou nao a conta — caso contrario este formulario
  // vira um verificador de "quem tem cadastro aqui".
  return {
    ok: true,
    message:
      'Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha. Verifique tambem a caixa de spam.',
  };
}

export async function updatePasswordAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const parsed = updatePasswordSchema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      message: 'O link expirou ou ja foi usado. Peca um novo link de redefinicao.',
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, message: traduzirErroAuth(error.message) };

  await db.insert(auditLogs).values({
    actorId: user.id,
    action: 'auth.password_changed',
    entityType: 'profile',
    entityId: user.id,
    ip: await clientIp(),
  });

  revalidatePath('/', 'layout');
  redirect('/minha-conta?senha=alterada');
}

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

/** Mensagens do Supabase vem em ingles; o usuario final le portugues. */
function traduzirErroAuth(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar. Procure a mensagem que enviamos.';
  }
  if (m.includes('user already registered')) return 'Este e-mail ja esta em uso.';
  if (m.includes('password should be')) return 'A senha nao atende aos requisitos minimos.';
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Tentativas demais. Aguarde alguns minutos e tente novamente.';
  }
  if (m.includes('same password')) return 'A nova senha precisa ser diferente da atual.';
  return 'Nao foi possivel concluir. Tente novamente em instantes.';
}
