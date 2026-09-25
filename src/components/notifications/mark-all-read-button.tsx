'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';

export function MarkAllReadButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="quiet" size="sm" loading={pending}>
      Marcar todas como lidas
    </Button>
  );
}
