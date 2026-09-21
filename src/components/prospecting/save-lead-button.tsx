'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { toggleSaveLeadAction } from '@/lib/prospecting/actions';
import { Button } from '@/components/ui/button';

export function SaveLeadButton({ leadId, initialSaved }: { leadId: string; initialSaved: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [saved, setSaved] = useOptimistic(initialSaved);
  const [erro, setErro] = useState<string | null>(null);

  function alternar() {
    setErro(null);
    startTransition(async () => {
      setSaved(!saved);
      const res = await toggleSaveLeadAction(leadId);
      if (!res.ok) {
        setErro(res.message ?? 'Não foi possível salvar agora.');
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="relative inline-flex">
      <Button type="button" variant={saved ? 'secondary' : 'ghost'} size="sm" onClick={alternar}>
        {saved ? <BookmarkCheck className="size-4" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
        {saved ? 'Salvo em Meus Leads' : 'Salvar lead'}
      </Button>
      {erro && (
        <span role="alert" className="absolute z-10 top-full mt-2 left-0 w-max max-w-[14rem] px-2.5 py-1.5 rounded-[var(--radius-field)] bg-[var(--content)] text-[var(--surface)] text-[0.75rem] shadow-[var(--shadow-raised)]">
          {erro}
        </span>
      )}
    </div>
  );
}
