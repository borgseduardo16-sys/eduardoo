/**
 * Servidor HTTPS local fake do endpoint de push (Fase 19).
 *
 * `web-push` (node_modules/web-push/src/web-push-lib.js) usa `https.request`
 * incondicionalmente pra entregar a notificação — não dá pra testar contra
 * um servidor HTTP puro como o testbed principal (scripts/testbed/server.ts,
 * usado por Asaas/CEP/mapa). Por isso este arquivo é separado: sobe um
 * servidor HTTPS com certificado autoassinado (gerado na hora pelo openssl
 * já presente no ambiente, descartado ao fechar) só pra os testes confiarem
 * localmente — o teste que chama `startPushTestbed` precisa rodar com
 * `NODE_TLS_REJECT_UNAUTHORIZED=0` (ver scripts/verify-notifications.ts),
 * senão o cliente recusa o certificado como qualquer navegador recusaria.
 *
 * O que isto PROVA: que `sendPushToUser` manda uma requisição HTTPS de
 * verdade pro endpoint de CADA inscrição, e que trata 404/410 (inscrição
 * revogada) apagando a linha — o autocuidado descrito no comentário de
 * `src/lib/notifications/push.ts`. O que isto NÃO decifra: o corpo
 * criptografado da notificação — isso testaria a biblioteca `web-push`, não
 * o nosso código.
 *
 * O status devolvido depende do CAMINHO da requisição (nunca de uma fila
 * compartilhada): `sendPushToUser` manda pushes em paralelo
 * (`Promise.all`), então cada inscrição de teste usa um caminho próprio
 * (.../ok/<id>, .../gone/<id>) pra não haver disputa entre elas.
 */
import { createServer, type Server } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type PushRequestLog = {
  path: string;
  headers: Record<string, string | string[] | undefined>;
  bodyLength: number;
};

export type PushTestbed = {
  url: string;
  /** Toda entrega que bateu no servidor. Os testes conferem o tráfego de verdade. */
  requests: PushRequestLog[];
  close: () => Promise<void>;
};

function gerarCertificadoAutoassinado(): { key: string; cert: string } {
  const dir = mkdtempSync(join(tmpdir(), 'myplace-push-cert-'));
  try {
    const keyPath = join(dir, 'key.pem');
    const certPath = join(dir, 'cert.pem');
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-keyout', keyPath, '-out', certPath,
      '-days', '1', '-nodes', '-subj', '/CN=localhost',
    ], { stdio: 'ignore' });
    return { key: readFileSync(keyPath, 'utf8'), cert: readFileSync(certPath, 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Caminho decide o status: `/gone/*` -> 410, `/notfound/*` -> 404,
 * `/erro/*` -> 500, qualquer outro (ex.: `/ok/*`) -> 201 (mesmo sucesso que
 * o Web Push real devolve numa entrega aceita).
 */
function statusPorCaminho(path: string): number {
  if (path.startsWith('/gone/')) return 410;
  if (path.startsWith('/notfound/')) return 404;
  if (path.startsWith('/erro/')) return 500;
  return 201;
}

export async function startPushTestbed(port = 0): Promise<PushTestbed> {
  const { key, cert } = gerarCertificadoAutoassinado();
  const requests: PushRequestLog[] = [];

  const server: Server = createServer({ key, cert }, (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const path = req.url ?? '/';
      requests.push({ path, headers: req.headers, bodyLength: body.length });
      res.writeHead(statusPorCaminho(path), { 'Content-Type': 'application/json' });
      res.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const endereco = server.address();
  if (!endereco || typeof endereco === 'string') throw new Error('testbed de push nao subiu');

  return {
    url: `https://127.0.0.1:${endereco.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
