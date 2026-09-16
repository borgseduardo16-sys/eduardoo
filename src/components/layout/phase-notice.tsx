import Link from 'next/link';
import { Construction } from 'lucide-react';

/**
 * Aviso de funcionalidade ainda não construída.
 *
 * Existe para que nenhuma tela do produto finja funcionar. É preferível dizer
 * "isto ainda não existe e é a fase N" do que mostrar dado de exemplo que o
 * usuário confundiria com dado real.
 */
export function PhaseNotice({
  fase,
  titulo,
  descricao,
  faltando,
}: {
  fase: string;
  titulo: string;
  descricao: string;
  faltando?: string[];
}) {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center space-y-6">
      <div className="mx-auto size-12 rounded-full grid place-items-center bg-[var(--surface-sunken)] border">
        <Construction className="size-5 text-[var(--content-muted)]" aria-hidden />
      </div>

      <div className="space-y-2">
        <p className="text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--content-subtle)]">
          {fase}
        </p>
        <h1 className="text-[1.5rem] font-semibold">{titulo}</h1>
        <p className="text-[var(--content-muted)] leading-relaxed">{descricao}</p>
      </div>

      {faltando && faltando.length > 0 && (
        <ul className="text-left inline-block space-y-1.5 text-[0.875rem] text-[var(--content-muted)]">
          {faltando.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden className="text-[var(--content-subtle)]">—</span>
              {item}
            </li>
          ))}
        </ul>
      )}

      <div>
        <Link
          href="/"
          className="text-[0.875rem] text-[var(--accent)] underline underline-offset-4"
        >
          Voltar para a página inicial
        </Link>
      </div>
    </div>
  );
}
