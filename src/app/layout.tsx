import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: {
    default: 'MyPlace — transforme seu espaço em renda',
    template: '%s · MyPlace',
  },
  description:
    'Encontre garagens, depósitos, galpões e salas perto de você. Ou anuncie o espaço que você não usa e comece a receber todo mês.',
  applicationName: 'MyPlace',
  formatDetection: { telephone: false },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'MyPlace',
  },
  // Enquanto o produto nao esta no ar, nao queremos nada indexado.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Permite zoom: bloquear e uma barreira de acessibilidade.
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#100f0e' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={jakarta.variable} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-3 focus:left-3 focus:px-4 focus:py-2 focus:rounded-[var(--radius-field)] focus:bg-[var(--accent)] focus:text-[var(--accent-content)]"
        >
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
