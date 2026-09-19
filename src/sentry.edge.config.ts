import * as Sentry from '@sentry/nextjs';

/** Inicializacao do Sentry no runtime edge (proxy.ts, rotas edge). Ver sentry.server.config.ts. */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.2,
});
