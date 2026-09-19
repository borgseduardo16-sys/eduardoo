import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs/config';

const nextConfig: NextConfig = {
  /*
   * Pasta de saida da compilacao.
   *
   * Configuravel para que o teste de integracao possa compilar numa pasta
   * propria (`.next-teste`) sem apagar a compilacao de desenvolvimento — os
   * dois usam variaveis de ambiente diferentes, e misturar as duas saidas
   * geraria um bundle com a URL errada dentro.
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

/*
 * O upload de source map so acontece com SENTRY_AUTH_TOKEN/ORG/PROJECT
 * definidos — sem eles o plugin so avisa e segue o build normalmente (nao
 * quebra `pnpm build` sem credencial, mesmo padrao das outras integracoes).
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
});
