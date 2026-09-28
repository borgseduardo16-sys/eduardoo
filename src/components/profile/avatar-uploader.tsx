'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Trash2 } from 'lucide-react';
import { removeAvatarAction, uploadAvatarAction, type ProfileActionState } from '@/lib/profiles/actions';
import { resizeBeforeUpload, excedeLimite } from '@/lib/storage/client-resize';
import { ACCEPT_ATTRIBUTE } from '@/lib/storage/images';
import { UserAvatar } from '@/components/profile/user-avatar';
import { Button } from '@/components/ui/button';

/**
 * Foto de perfil: escolher, enviar, trocar ou remover.
 *
 * O navegador só reduz o arquivo para caber no envio; quem recorta,
 * reencoda e remove o metadado (GPS da selfie!) é o servidor.
 */
export function AvatarUploader({ currentUrl, name }: { currentUrl: string | null; name: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendente, startTransition] = useTransition();
  const [estado, setEstado] = useState<ProfileActionState | null>(null);

  function enviar(file: File) {
    startTransition(async () => {
      setEstado(null);
      const reduzida = await resizeBeforeUpload(file);
      if (excedeLimite(reduzida)) {
        setEstado({ ok: false, message: 'A foto é grande demais (máximo 8 MB). Tente outra.' });
        return;
      }
      const fd = new FormData();
      fd.set('file', reduzida);
      const r = await uploadAvatarAction(undefined, fd);
      setEstado(r);
      if (r.ok) router.refresh();
    });
  }

  function remover() {
    startTransition(async () => {
      const r = await removeAvatarAction();
      setEstado(r);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
      <UserAvatar url={currentUrl} name={name} size="xl" className={pendente ? 'opacity-60' : undefined} />
      <div className="space-y-2">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          id="avatar-arquivo"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) enviar(f);
            e.target.value = '';
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" loading={pendente} onClick={() => inputRef.current?.click()}>
            {!pendente && <Camera aria-hidden />}
            {currentUrl ? 'Trocar foto' : 'Adicionar foto'}
          </Button>
          {currentUrl && (
            <Button type="button" variant="quiet" size="sm" disabled={pendente} onClick={remover}>
              <Trash2 aria-hidden />
              Remover
            </Button>
          )}
        </div>
        <p className="text-[0.75rem] text-[var(--content-subtle)]">JPG, PNG ou WEBP. Recortamos em quadrado.</p>
        {estado?.message && (
          <p
            role={estado.ok ? 'status' : 'alert'}
            className={`text-[0.8125rem] animate-rise ${estado.ok ? 'text-[var(--color-positive)]' : 'text-[var(--color-critical)]'}`}
          >
            {estado.message}
          </p>
        )}
      </div>
    </div>
  );
}
