import type { NextConfig } from 'next';

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

export default nextConfig;
