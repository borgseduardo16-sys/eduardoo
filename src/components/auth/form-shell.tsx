'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';

/**
 * Botao de envio que le o estado do formulario que o contem.
 *
 * Fica em componente separado de proposito: `useFormStatus` so enxerga o
 * <form> acima dele na arvore, entao chamar no mesmo componente do form
 * devolveria sempre `pending: false`.
 */
export function SubmitButton({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" block loading={pending} {...props}>
      {children}
    </Button>
  );
}
