import * as Sentry from '@sentry/nextjs';

/**
 * Inicializacao do Sentry no navegador. Ver sentry.server.config.ts para o
 * porque de nao usar `requireIntegration` aqui — DSN ausente e um SDK que
 * nao envia nada, nao uma funcionalidade fingindo funcionar.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.2,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
