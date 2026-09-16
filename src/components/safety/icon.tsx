import * as Lucide from 'lucide-react';

/**
 * Resolve um icone pelo nome vindo de dado (catalogo de proteções, sinais de
 * confiança, características de espaço).
 *
 * Existe para que os módulos de domínio guardem `icon: 'ShieldAlert'` como
 * string, sem importar componente React — eles precisam rodar em script de
 * verificação, fora do React.
 */
export function Icon({
  name,
  className,
  fallback = 'Circle',
}: {
  name: string;
  className?: string;
  fallback?: string;
}) {
  const icons = Lucide as unknown as Record<string, React.ComponentType<{ className?: string }>>;
  const Cmp = icons[name] ?? icons[fallback] ?? Lucide.Circle;
  return <Cmp className={className} />;
}
