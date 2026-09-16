import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { UpdatePasswordForm } from '@/components/auth/password-forms';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Nova senha' };

/**
 * Só chega aqui quem veio do link de recuperação: o link cria uma sessão
 * temporária. Sem sessão, não há nada a redefinir — mandamos pedir outro link
 * em vez de mostrar um formulário que falharia no envio.
 */
export default async function RedefinirSenhaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/recuperar-senha?link=expirado');

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-[1.75rem] font-semibold">Criar nova senha</h1>
        <p className="text-[var(--content-muted)]">
          Escolha uma senha nova para <strong className="text-[var(--content)]">{user.email}</strong>.
        </p>
      </header>

      <UpdatePasswordForm />
    </div>
  );
}
