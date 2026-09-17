/**
 * Servidor local usado SO pelos testes automatizados.
 *
 * ============================ LEIA ISTO ============================
 * Isto NAO faz parte do aplicativo e nunca sobe para producao.
 *
 * O ambiente onde os testes rodam nao tem saida para a internet (a politica
 * de rede bloqueia CONNECT para qualquer host externo). Sem uma origem local,
 * nenhum teste de verdade seria possivel: o que sobraria seria "clicou no
 * botao, logo funcionou", que e exatamente o tipo de teste que nao vale nada.
 *
 * Entao este servidor implementa, em cima de HTTP de verdade, o CONTRATO REST
 * dos servicos que o app usa:
 *
 *   - Supabase Auth   — GET /auth/v1/user
 *   - Supabase Storage— POST/DELETE /storage/v1/object/...,
 *                       POST /storage/v1/object/sign/... (URL assinada)
 *   - Tiles de mapa   — GET /tiles/{z}/{x}/{y}.png, PNG gerado de verdade
 *   - CEP             — GET /api/cep/v2/:cep (formato BrasilAPI)
 *                       GET /ws/:cep/json/   (formato ViaCEP)
 *
 * O que isto PROVA: que o nosso codigo monta a requisicao certa, trata a
 * resposta certa, grava no banco certo e mostra a imagem certa.
 * O que isto NAO PROVA: que o servidor do Supabase se comporta como o
 * contrato diz. Isso so o ambiente do usuario, com credencial real, prova —
 * e por isso o mesmo teste aponta para lá quando as variaveis reais existem.
 * ===================================================================
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

export type TestbedUser = { id: string; email: string; token: string };

export type RequestLog = {
  at: number;
  method: string;
  url: string;
  status: number;
};

export type Testbed = {
  url: string;
  /** Tudo que bateu no servidor. Os testes conferem o trafego de verdade. */
  log: RequestLog[];
  /** Arquivos guardados no "Storage", por caminho. */
  objects: Map<string, { bytes: Buffer; contentType: string }>;
  users: Map<string, TestbedUser>;
  /** CEPs que o "servico" conhece. Vazio = responde 404. */
  ceps: Map<string, unknown>;
  /** Faz as duas fontes de CEP responderem erro, para testar indisponibilidade. */
  cepFora: boolean;
  /** Derruba so a fonte primaria, para testar a queda para a reserva. */
  brasilApiFora: boolean;
  tilesServidos: () => { z: number; x: number; y: number }[];
  close: () => Promise<void>;
};

const BUCKET = 'space-images';

export async function startTestbed(port = 0): Promise<Testbed> {
  const log: RequestLog[] = [];
  const objects = new Map<string, { bytes: Buffer; contentType: string }>();
  const users = new Map<string, TestbedUser>();
  const ceps = new Map<string, unknown>();
  const tiles: { z: number; x: number; y: number }[] = [];
  const tileCache = new Map<string, Buffer>();
  const assinaturas = new Map<string, { path: string; expiraEm: number }>();

  const estado = { cepFora: false, brasilApiFora: false };

  async function lerCorpo(req: IncomingMessage): Promise<Buffer> {
    const partes: Buffer[] = [];
    for await (const chunk of req) partes.push(chunk as Buffer);
    return Buffer.concat(partes);
  }

  function json(res: ServerResponse, status: number, body: unknown) {
    const texto = JSON.stringify(body);
    res.writeHead(status, {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(texto),
    });
    res.end(texto);
    return status;
  }

  /** PNG 256x256 de verdade, com a coordenada do tile desenhada. */
  async function tilePng(z: number, x: number, y: number): Promise<Buffer> {
    const chave = `${z}/${x}/${y}`;
    const guardado = tileCache.get(chave);
    if (guardado) return guardado;

    // Cor derivada da coordenada: tiles vizinhos ficam visivelmente diferentes,
    // entao a captura de tela mostra um mosaico, e nao uma imagem unica.
    const tom = 200 + ((x + y) % 2) * 25;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
      <rect width="256" height="256" fill="rgb(${tom},${tom - 10},${tom - 25})"/>
      <rect x="0.5" y="0.5" width="255" height="255" fill="none"
            stroke="rgb(120,130,120)" stroke-width="1"/>
      <text x="128" y="122" font-family="monospace" font-size="20" fill="rgb(70,80,70)"
            text-anchor="middle">${z}/${x}</text>
      <text x="128" y="150" font-family="monospace" font-size="20" fill="rgb(70,80,70)"
            text-anchor="middle">${y}</text>
    </svg>`;

    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    tileCache.set(chave, png);
    return png;
  }

  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://local');
      const rota = url.pathname;
      let status = 404;

      try {
        // ---------------------------------------------------------------
        // Supabase Auth
        // ---------------------------------------------------------------
        if (rota === '/auth/v1/user') {
          const auth = req.headers.authorization ?? '';
          const token = auth.replace(/^Bearer\s+/i, '');
          const user = [...users.values()].find((u) => u.token === token);

          status = user
            ? json(res, 200, {
                id: user.id,
                aud: 'authenticated',
                role: 'authenticated',
                email: user.email,
                email_confirmed_at: new Date().toISOString(),
                app_metadata: { provider: 'email' },
                user_metadata: {},
                created_at: new Date().toISOString(),
              })
            : json(res, 401, { code: 401, msg: 'invalid claim: missing sub claim' });
        }

        // ---------------------------------------------------------------
        // Storage — URL assinada (lote): POST /storage/v1/object/sign/<bucket>
        // ---------------------------------------------------------------
        else if (req.method === 'POST' && rota === `/storage/v1/object/sign/${BUCKET}`) {
          const corpo = JSON.parse((await lerCorpo(req)).toString() || '{}') as {
            expiresIn?: number;
            paths?: string[];
          };
          const expiresIn = corpo.expiresIn ?? 3600;

          const saida = (corpo.paths ?? []).map((caminho) => {
            if (!objects.has(caminho)) {
              return { error: 'Object not found', path: caminho, signedURL: null };
            }
            const token = randomUUID();
            assinaturas.set(token, { path: caminho, expiraEm: Date.now() + expiresIn * 1000 });
            return {
              error: null,
              path: caminho,
              signedURL: `/object/sign/${BUCKET}/${caminho}?token=${token}`,
            };
          });
          status = json(res, 200, saida);
        }

        // ---------------------------------------------------------------
        // Storage — leitura pela URL assinada
        // ---------------------------------------------------------------
        else if (req.method === 'GET' && rota.startsWith(`/storage/v1/object/sign/${BUCKET}/`)) {
          const token = url.searchParams.get('token') ?? '';
          const assinatura = assinaturas.get(token);
          const caminho = decodeURIComponent(
            rota.slice(`/storage/v1/object/sign/${BUCKET}/`.length),
          );

          if (!assinatura || assinatura.path !== caminho) {
            status = json(res, 400, { statusCode: '400', error: 'InvalidJWT', message: 'invalid signature' });
          } else if (assinatura.expiraEm < Date.now()) {
            status = json(res, 400, { statusCode: '400', error: 'ExpiredToken', message: 'expired' });
          } else {
            const obj = objects.get(caminho)!;
            res.writeHead(200, {
              'content-type': obj.contentType,
              'content-length': obj.bytes.length,
              'cache-control': 'max-age=3600',
            });
            res.end(obj.bytes);
            status = 200;
          }
        }

        // ---------------------------------------------------------------
        // Storage — envio
        // ---------------------------------------------------------------
        else if (
          (req.method === 'POST' || req.method === 'PUT') &&
          rota.startsWith(`/storage/v1/object/${BUCKET}/`)
        ) {
          const caminho = decodeURIComponent(rota.slice(`/storage/v1/object/${BUCKET}/`.length));
          const corpo = await lerCorpo(req);
          const contentType = String(req.headers['content-type'] ?? 'application/octet-stream');

          if (req.method === 'POST' && objects.has(caminho)) {
            status = json(res, 409, {
              statusCode: '409', error: 'Duplicate', message: 'The resource already exists',
            });
          } else if (corpo.length > 8 * 1024 * 1024) {
            // O bucket real tem limite de 8 MB; aqui vale o mesmo.
            status = json(res, 413, {
              statusCode: '413', error: 'Payload too large', message: 'exceeded the maximum allowed size',
            });
          } else {
            objects.set(caminho, { bytes: corpo, contentType });
            status = json(res, 200, { Id: randomUUID(), Key: `${BUCKET}/${caminho}` });
          }
        }

        // ---------------------------------------------------------------
        // Storage — remocao
        // ---------------------------------------------------------------
        else if (req.method === 'DELETE' && rota === `/storage/v1/object/${BUCKET}`) {
          const corpo = JSON.parse((await lerCorpo(req)).toString() || '{}') as {
            prefixes?: string[];
          };
          const removidos: unknown[] = [];
          for (const p of corpo.prefixes ?? []) {
            if (objects.delete(p)) removidos.push({ name: p });
          }
          status = json(res, 200, removidos);
        }

        // ---------------------------------------------------------------
        // Tiles de mapa
        // ---------------------------------------------------------------
        else if (/^\/tiles\/\d+\/\d+\/\d+\.png$/.test(rota)) {
          const [, , z, x, y] = rota.replace('.png', '').split('/');
          tiles.push({ z: Number(z), x: Number(x), y: Number(y) });
          const png = await tilePng(Number(z), Number(x), Number(y));
          res.writeHead(200, {
            'content-type': 'image/png',
            'content-length': png.length,
            'access-control-allow-origin': '*',
            'cache-control': 'max-age=60',
          });
          res.end(png);
          status = 200;
        }

        // ---------------------------------------------------------------
        // CEP — formato BrasilAPI
        // ---------------------------------------------------------------
        else if (rota.startsWith('/api/cep/v2/')) {
          const cep = rota.slice('/api/cep/v2/'.length);
          if (estado.cepFora || estado.brasilApiFora) {
            status = json(res, 500, { message: 'servico indisponivel' });
          } else if (ceps.has(cep)) {
            status = json(res, 200, ceps.get(cep));
          } else {
            status = json(res, 404, {
              name: 'NotFoundError',
              message: 'Todos os serviços de CEP retornaram erro.',
            });
          }
        }

        // ---------------------------------------------------------------
        // CEP — formato ViaCEP
        // ---------------------------------------------------------------
        else if (/^\/ws\/\d+\/json\/?$/.test(rota)) {
          const cep = rota.split('/')[2]!;
          if (estado.cepFora) {
            status = json(res, 500, {});
          } else if (ceps.has(cep)) {
            const b = ceps.get(cep) as {
              state: string; city: string; neighborhood?: string; street?: string;
            };
            status = json(res, 200, {
              cep,
              logradouro: b.street ?? '',
              bairro: b.neighborhood ?? '',
              localidade: b.city,
              uf: b.state,
            });
          } else {
            status = json(res, 200, { erro: true });
          }
        }

        else {
          status = json(res, 404, { error: 'rota nao implementada no testbed', rota });
        }
      } catch (err) {
        status = json(res, 500, { error: String(err) });
      }

      log.push({ at: Date.now(), method: req.method ?? '?', url: req.url ?? '?', status });
    })();
  });

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const endereco = server.address();
  if (!endereco || typeof endereco === 'string') throw new Error('nao subiu');

  return {
    url: `http://127.0.0.1:${endereco.port}`,
    log,
    objects,
    users,
    ceps,
    get cepFora() {
      return estado.cepFora;
    },
    set cepFora(v: boolean) {
      estado.cepFora = v;
    },
    get brasilApiFora() {
      return estado.brasilApiFora;
    },
    set brasilApiFora(v: boolean) {
      estado.brasilApiFora = v;
    },
    tilesServidos: () => tiles.slice(),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

/**
 * Monta o cookie de sessao que o `@supabase/ssr` sabe ler.
 *
 * Nome e formato saem da implementacao do proprio pacote:
 *   nome  = `sb-${primeiro rotulo do host}-auth-token`   (SupabaseClient)
 *   valor = "base64-" + base64url(JSON da sessao)        (ssr/cookies.js)
 */
export function sessionCookie(supabaseUrl: string, user: TestbedUser) {
  const ref = new URL(supabaseUrl).hostname.split('.')[0];
  const agora = Math.floor(Date.now() / 1000);

  const sessao = {
    access_token: user.token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: agora + 3600,
    refresh_token: `refresh-${user.id}`,
    user: {
      id: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      email_confirmed_at: new Date().toISOString(),
      app_metadata: { provider: 'email' },
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };

  const base64url = (s: string) =>
    Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return {
    name: `sb-${ref}-auth-token`,
    value: `base64-${base64url(JSON.stringify(sessao))}`,
  };
}

/** JWT com forma valida (header.payload.signature). Nada aqui e verificado. */
export function fakeJwt(userId: string, email: string): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  const agora = Math.floor(Date.now() / 1000);
  return [
    b64({ alg: 'HS256', typ: 'JWT' }),
    b64({
      sub: userId,
      email,
      aud: 'authenticated',
      role: 'authenticated',
      iat: agora,
      exp: agora + 3600,
      session_id: randomUUID(),
    }),
    Buffer.from(randomUUID()).toString('base64url'),
  ].join('.');
}
