import * as Sentry from '@sentry/nextjs';

/**
 * Inicializacao do Sentry no servidor (Node.js).
 *
 * Sem `NEXT_PUBLIC_SENTRY_DSN`, o proprio SDK nao envia nada — comportamento
 * padrao dele, nao algo que precisamos reimplementar aqui. Por isso este
 * modulo pode rodar sempre, em qualquer ambiente, sem `requireIntegration`:
 * ausencia de monitoramento nao e uma funcionalidade fingindo funcionar, e so
 * ausencia de alerta (ver docs/STATUS.md, risco "sem monitoramento de erro").
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.2,
});
