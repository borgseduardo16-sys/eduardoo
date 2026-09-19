import * as Sentry from '@sentry/nextjs';

/**
 * Registra o Sentry por runtime (Node.js ou edge) — arquivo lido pelo Next.js
 * antes do servidor comecar a atender requisicoes.
 * Ver docs/SETUP.md §7 e sentry.server.config.ts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
