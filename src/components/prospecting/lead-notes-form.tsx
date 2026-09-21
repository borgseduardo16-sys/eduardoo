'use client';

import { useState, useTransition } from 'react';
import { updateLeadNotesAction } from '@/lib/prospecting/actions';
import { Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function LeadNotesForm({ leadId, initialNotes }: { leadId: string; initialNotes: string | null }) {
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  function salvar() {
    setFeedback(null);
    startTransition(async () => {
      const res = await updateLeadNotesAction(leadId, notes);
      setFeedback(
        res.ok
          ? { ok: true, message: 'Observações salvas.' }
          : { ok: false, message: res.message ?? 'Não foi possível salvar.' },
      );
    });
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={4000}
        placeholder="Ex.: Falei com a proprietária pelo WhatsApp. Pediu para retornar sexta-feira."
        rows={4}
      />
      <div className="flex items-center gap-3">
        <Button type="button" size="sm" variant="secondary" onClick={salvar} loading={pending}>
          Salvar observações
        </Button>
        {feedback && (
          <span className={feedback.ok ? 'text-[0.8125rem] text-[var(--color-positive)]' : 'text-[0.8125rem] text-[var(--color-critical)]'}>
            {feedback.message}
          </span>
        )}
      </div>
    </div>
  );
}
