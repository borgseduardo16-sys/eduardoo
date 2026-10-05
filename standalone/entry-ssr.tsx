import { renderToString } from 'react-dom/server';
import PaginaDeVendas from '@/app/whatsapp-business/page';

/** HTML inicial (pré-renderizado) da página: aparece antes de qualquer JavaScript rodar. */
export function renderizar(): string {
  return renderToString(<PaginaDeVendas />);
}
