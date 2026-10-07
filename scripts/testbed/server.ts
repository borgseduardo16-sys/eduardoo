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
 *                       POST /storage/v1/object/sign/... (URL assinada, em
 *                       lote ou de um caminho só), GET do arquivo assinado
 *                       (com `Range`) e GET /storage/v1/object/<bucket>/...
 *                       (download autenticado). Dois buckets: `space-images`
 *                       (8 MB) e `chat-audio` (5 MB, só os 4 tipos de áudio).
 *   - Tiles de mapa   — GET /tiles/{z}/{x}/{y}.png, PNG gerado de verdade
 *   - CEP             — GET /api/cep/v2/:cep (formato BrasilAPI)
 *                       GET /ws/:cep/json/   (formato ViaCEP)
 *   - Asaas           — POST /v3/customers, POST /v3/accounts,
 *                       POST /v3/subscriptions, DELETE /v3/subscriptions/:id
 *                       (remove junto as cobranças em aberto),
 *                       POST /v3/payments (com split), GET/PUT/DELETE
 *                       /v3/payments/:id (PUT troca `billingType` na mesma
 *                       cobrança), GET /v3/payments/:id/pixQrCode,
 *                       POST /v3/payments/:id/refund — exige header
 *                       `access_token` batendo com o combinado no teste.
 *                       Recusa o que o Asaas recusa: trocar forma/excluir
 *                       cobrança paga, estornar cobrança não paga, QR sem
 *                       chave Pix cadastrada (`asaasSemChavePix`).
 *   - Resend          — POST /emails — exige header `authorization: Bearer
 *                       <chave>` batendo com o combinado no teste.
 *   - Upstash Redis   — POST /pipeline (contrato REST real, confirmado por
 *                       busca) — INCR/EXPIRE/TTL o bastante para provar que
 *                       o limitador de taxa usa um contador COMPARTILHADO
 *                       quando configurado, nao um `Map` por processo.
 *   - Twilio Verify   — POST /v2/Services/:sid/Verifications e
 *                       /VerificationCheck (contrato confirmado na doc oficial,
 *                       Fase 21) — Basic auth, codigo de 6 digitos que o
 *                       teste le em `twilioSmsSent` (o "celular"), validade de
 *                       10 min, 5 conferencias (60202), 5 envios/10 min
 *                       (60203), numero fixo (60205), invalido (60200) e
 *                       verificacao encerrada (20404).
 *   - Anthropic       — POST /v1/messages (Fase 23): exige `x-api-key` e
 *                       `anthropic-version`; responde, em ordem, o que o
 *                       teste enfileirar em `anthropicQueue` (texto da
 *                       resposta, `stop_reason`, erro HTTP ou demora). Fila
 *                       vazia = 500 — nunca inventa uma resposta de IA.
 *                       Todo pedido fica em `anthropicRequests`, para o
 *                       teste conferir o que foi mandado (e o que NÃO foi).
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

/** Cobrança no dublê do Asaas (o que o app lê de volta). */
export type AsaasStubPayment = {
  id: string;
  status: string;
  value: number;
  netValue: number | null;
  invoiceUrl: string | null;
  dueDate: string;
  refundedCents: number;
  subscription: string | null;
  /** Parte 12: forma de pagamento atual (PUT troca na MESMA cobrança). */
  billingType?: string;
  /** Excluída (DELETE /payments/:id ou junto com a assinatura). */
  deleted?: boolean;
  split?: { walletId: string; fixedValue?: number; percentualValue?: number }[] | null;
  externalReference?: string | null;
};

/** Assinatura no dublê do Asaas — guarda o que o app mandou, para o teste conferir (valor, forma, split, referência). */
export type AsaasStubSubscription = {
  id: string;
  status: string;
  nextDueDate: string;
  value: number;
  customer: string;
  billingType?: string;
  cycle?: string;
  externalReference?: string | null;
  split?: { walletId: string; fixedValue?: number; percentualValue?: number }[] | null;
};

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
  /** Arquivos guardados no bucket `space-images`, por caminho. */
  objects: Map<string, { bytes: Buffer; contentType: string }>;
  /** Arquivos guardados no bucket privado `chat-audio` (áudio do chat e das instruções), por caminho. */
  audioObjects: Map<string, { bytes: Buffer; contentType: string }>;
  users: Map<string, TestbedUser>;
  /** CEPs que o "servico" conhece. Vazio = responde 404. */
  ceps: Map<string, unknown>;
  /** Faz as duas fontes de CEP responderem erro, para testar indisponibilidade. */
  cepFora: boolean;
  /** Derruba so a fonte primaria, para testar a queda para a reserva. */
  brasilApiFora: boolean;
  /**
   * Enderecos que o geocodificador (Nominatim-fake) reconhece. Chave e o
   * texto de busca EXATO que o teste vai digitar; vazio = lista vazia,
   * que e como o Nominatim responde para endereco que nao acha.
   */
  geocodes: Map<string, { lat: number; lon: number; display_name: string }>;
  tilesServidos: () => { z: number; x: number; y: number }[];
  /** Chave que o testbed exige no header `access_token` das chamadas Asaas. */
  asaasApiKey: string;
  /** Simula conta Asaas sem chave Pix cadastrada: o QR Code é recusado. */
  asaasSemChavePix: boolean;
  asaasCustomers: Map<string, { id: string; name: string; cpfCnpj: string; email: string | null }>;
  asaasSubaccounts: Map<string, { id: string; apiKey: string; walletId: string }>;
  asaasSubscriptions: Map<string, AsaasStubSubscription>;
  asaasPayments: Map<string, AsaasStubPayment>;
  /** Chave que o testbed exige no header `authorization: Bearer <chave>` das chamadas Resend. */
  resendApiKey: string;
  /** Todo e-mail que o app tentou enviar de verdade, na ordem em que chegou. */
  emailsSent: { id: string; from: string; to: string[]; subject: string; html: string; text: string }[];
  /** Token que o testbed exige no header `Authorization: Bearer <token>` do pipeline Redis. */
  upstashToken: string;
  /** Estado do "Redis" — pra teste inspecionar o contador direto, sem depender so da resposta HTTP. */
  redisStore: Map<string, { count: number; expiresAt: number }>;
  /** Credenciais que o dublê do Twilio Verify exige (Basic auth + Service SID na URL). */
  twilio: { accountSid: string; authToken: string; serviceSid: string };
  /** Todo SMS de verificacao "enviado" — e onde o teste le o codigo, como a pessoa leria no celular. */
  twilioSmsSent: { to: string; code: string; at: number }[];
  /** Numeros tratados como fixos (respondem 60205). */
  twilioLandlines: Set<string>;
  /** Chave que o dublê da Anthropic exige no header `x-api-key`. */
  anthropicApiKey: string;
  /** Próximas respostas da "IA", consumidas em ordem. */
  anthropicQueue: AnthropicStubReply[];
  /** Corpo e headers de cada pedido que chegou ao dublê da Anthropic. */
  anthropicRequests: { headers: Record<string, string | string[] | undefined>; body: Record<string, unknown> }[];
  /**
   * Ganchos que o teste liga. `onSignup` é o que o Supabase Auth faz num
   * cadastro com confirmação de e-mail ligada: grava o usuário em
   * `auth.users` (o teste faz o INSERT de verdade no banco local, o que
   * dispara o gatilho real que cria o perfil) e não abre sessão.
   */
  hooks: {
    onSignup: ((input: { email: string; password: string; fullName: string | null }) => Promise<{ id: string } | { error: 'ja_existe' }>) | null;
  };
  close: () => Promise<void>;
};

/**
 * Uma resposta enfileirada no dublê da Anthropic. `text` vira o bloco de
 * texto da mensagem (o JSON que a saída estruturada devolveria); `status`
 * diferente de 200 vira erro no formato da API.
 */
export type AnthropicStubReply = {
  text?: string;
  stopReason?: 'end_turn' | 'max_tokens' | 'refusal';
  status?: number;
  errorType?: string;
  delayMs?: number;
};

/** Buckets que o dublê conhece: nome → limite de tamanho e tipos aceitos (como no bucket real). */
const BUCKETS = {
  'space-images': { limite: 8 * 1024 * 1024, tipos: null },
  'chat-audio': { limite: 5 * 1024 * 1024, tipos: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'] },
} as const;
type NomeBucket = keyof typeof BUCKETS;

export async function startTestbed(port = 0): Promise<Testbed> {
  const log: RequestLog[] = [];
  const objects = new Map<string, { bytes: Buffer; contentType: string }>();
  const audioObjects = new Map<string, { bytes: Buffer; contentType: string }>();
  const armazenamento: Record<NomeBucket, Map<string, { bytes: Buffer; contentType: string }>> = {
    'space-images': objects,
    'chat-audio': audioObjects,
  };
  const users = new Map<string, TestbedUser>();
  const ceps = new Map<string, unknown>();
  const geocodes = new Map<string, { lat: number; lon: number; display_name: string }>();
  const tiles: { z: number; x: number; y: number }[] = [];
  const tileCache = new Map<string, Buffer>();
  const assinaturas = new Map<string, { bucket: NomeBucket; path: string; expiraEm: number }>();

  const estado = {
    cepFora: false, brasilApiFora: false, asaasSemChavePix: false,
    asaasApiKey: randomUUID(), resendApiKey: randomUUID(), upstashToken: randomUUID(),
  };
  // QR Code de verdade (PNG), como o Asaas devolve: base64 sem prefixo.
  const qrPng = (await sharp({ create: { width: 8, height: 8, channels: 3, background: '#ffffff' } }).png().toBuffer()).toString('base64');
  const walletExiste = (walletId: string) => [...asaasSubaccounts.values()].some((c) => c.walletId === walletId);
  const redisStore = new Map<string, { count: number; expiresAt: number }>();
  const asaasCustomers = new Map<string, { id: string; name: string; cpfCnpj: string; email: string | null }>();
  const asaasSubaccounts = new Map<string, { id: string; apiKey: string; walletId: string }>();
  const asaasSubscriptions = new Map<string, AsaasStubSubscription>();
  const asaasPayments = new Map<string, AsaasStubPayment>();
  const emailsSent: { id: string; from: string; to: string[]; subject: string; html: string; text: string }[] = [];
  const twilio = {
    accountSid: `AC${randomUUID().replace(/-/g, '')}`,
    authToken: randomUUID().replace(/-/g, ''),
    serviceSid: `VA${randomUUID().replace(/-/g, '')}`,
  };
  const twilioSmsSent: { to: string; code: string; at: number }[] = [];
  const twilioLandlines = new Set<string>();
  const anthropicApiKey = `sk-ant-teste-${randomUUID()}`;
  const anthropicQueue: AnthropicStubReply[] = [];
  const hooks: Testbed['hooks'] = { onSignup: null };
  const anthropicRequests: { headers: Record<string, string | string[] | undefined>; body: Record<string, unknown> }[] = [];
  /** Uma verificacao aberta por numero, como no Twilio. */
  const twilioVerifs = new Map<string, { sid: string; code: string; status: string; checks: number; expiresAt: number }>();

  async function lerCorpo(req: IncomingMessage): Promise<Buffer> {
    const partes: Buffer[] = [];
    for await (const chunk of req) partes.push(chunk as Buffer);
    return Buffer.concat(partes);
  }

  /** Responde um arquivo guardado, com `Range` (206) quando o navegador/servidor pede — como o Storage real. */
  function enviarArquivo(req: IncomingMessage, res: ServerResponse, obj: { bytes: Buffer; contentType: string }): number {
    const faixa = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
    if (faixa) {
      const total = obj.bytes.length;
      const inicio = faixa[1] === '' ? Math.max(0, total - Number(faixa[2])) : Number(faixa[1]);
      const fim = faixa[1] === '' || faixa[2] === '' ? total - 1 : Math.min(Number(faixa[2]), total - 1);
      if (inicio >= total || inicio > fim) {
        res.writeHead(416, { 'content-range': `bytes */${total}` });
        res.end();
        return 416;
      }
      const parte = obj.bytes.subarray(inicio, fim + 1);
      res.writeHead(206, {
        'content-type': obj.contentType,
        'content-length': parte.length,
        'content-range': `bytes ${inicio}-${fim}/${total}`,
        'accept-ranges': 'bytes',
        'cache-control': 'max-age=3600',
      });
      res.end(parte);
      return 206;
    }
    res.writeHead(200, {
      'content-type': obj.contentType,
      'content-length': obj.bytes.length,
      'accept-ranges': 'bytes',
      'cache-control': 'max-age=3600',
    });
    res.end(obj.bytes);
    return 200;
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
        // Supabase Auth — cadastro (e-mail ainda sem confirmar: sem sessão)
        // ---------------------------------------------------------------
        else if (req.method === 'POST' && rota === '/auth/v1/signup') {
          const corpo = JSON.parse((await lerCorpo(req)).toString() || '{}') as {
            email?: string; password?: string; data?: { full_name?: string };
          };
          const email = String(corpo.email ?? '').trim().toLowerCase();
          if (!hooks.onSignup) {
            status = json(res, 501, { code: 501, msg: 'cadastro nao ligado neste teste (hooks.onSignup)' });
          } else if (!email || String(corpo.password ?? '').length < 6) {
            status = json(res, 422, { code: 422, error_code: 'validation_failed', msg: 'Unable to validate email address: invalid format' });
          } else {
            const r = await hooks.onSignup({ email, password: String(corpo.password), fullName: corpo.data?.full_name ?? null });
            if ('error' in r) {
              status = json(res, 422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
            } else {
              const agora = new Date().toISOString();
              status = json(res, 200, {
                id: r.id, aud: 'authenticated', role: '', email, phone: '',
                confirmation_sent_at: agora,
                app_metadata: { provider: 'email', providers: ['email'] },
                user_metadata: { full_name: corpo.data?.full_name ?? null, email, email_verified: false, sub: r.id },
                identities: [{
                  identity_id: randomUUID(), id: r.id, user_id: r.id,
                  identity_data: { email, email_verified: false, sub: r.id },
                  provider: 'email', last_sign_in_at: agora, created_at: agora, updated_at: agora, email,
                }],
                created_at: agora, updated_at: agora, is_anonymous: false,
              });
            }
          }
        }

        // ---------------------------------------------------------------
        // Storage (qualquer bucket conhecido): /storage/v1/object/...
        // ---------------------------------------------------------------
        else if (rota.startsWith('/storage/v1/object/')) {
          const resto = rota.slice('/storage/v1/object/'.length);
          const ehAssinatura = resto.startsWith('sign/');
          const [nomeBucket, ...caminhoPartes] = (ehAssinatura ? resto.slice('sign/'.length) : resto).split('/');
          const bucket = nomeBucket as NomeBucket;
          const caminho = decodeURIComponent(caminhoPartes.join('/'));
          const arquivos = armazenamento[bucket];

          if (!arquivos) {
            status = json(res, 404, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' });
          }
          // URL assinada em lote: POST /object/sign/<bucket>
          else if (req.method === 'POST' && ehAssinatura && caminho === '') {
            const corpo = JSON.parse((await lerCorpo(req)).toString() || '{}') as { expiresIn?: number; paths?: string[] };
            const expiresIn = corpo.expiresIn ?? 3600;
            const saida = (corpo.paths ?? []).map((c) => {
              if (!arquivos.has(c)) return { error: 'Object not found', path: c, signedURL: null };
              const token = randomUUID();
              assinaturas.set(token, { bucket, path: c, expiraEm: Date.now() + expiresIn * 1000 });
              return { error: null, path: c, signedURL: `/object/sign/${bucket}/${c}?token=${token}` };
            });
            status = json(res, 200, saida);
          }
          // URL assinada de um caminho só: POST /object/sign/<bucket>/<caminho>
          else if (req.method === 'POST' && ehAssinatura) {
            const corpo = JSON.parse((await lerCorpo(req)).toString() || '{}') as { expiresIn?: number };
            if (!arquivos.has(caminho)) {
              status = json(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
            } else {
              const token = randomUUID();
              assinaturas.set(token, { bucket, path: caminho, expiraEm: Date.now() + (corpo.expiresIn ?? 3600) * 1000 });
              status = json(res, 200, { signedURL: `/object/sign/${bucket}/${caminho}?token=${token}` });
            }
          }
          // Leitura pela URL assinada (com suporte a `Range`)
          else if (req.method === 'GET' && ehAssinatura) {
            const token = url.searchParams.get('token') ?? '';
            const assinatura = assinaturas.get(token);
            if (!assinatura || assinatura.path !== caminho || assinatura.bucket !== bucket) {
              status = json(res, 400, { statusCode: '400', error: 'InvalidJWT', message: 'invalid signature' });
            } else if (assinatura.expiraEm < Date.now()) {
              status = json(res, 400, { statusCode: '400', error: 'ExpiredToken', message: 'expired' });
            } else {
              status = enviarArquivo(req, res, arquivos.get(caminho)!);
            }
          }
          // Download autenticado: GET /object/<bucket>/<caminho> (supabase-js `download`)
          else if (req.method === 'GET') {
            const obj = arquivos.get(caminho);
            status = obj
              ? enviarArquivo(req, res, obj)
              : json(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
          }
          // Envio
          else if ((req.method === 'POST' || req.method === 'PUT') && caminho !== '') {
            const corpo = await lerCorpo(req);
            const contentType = String(req.headers['content-type'] ?? 'application/octet-stream');
            const regra = BUCKETS[bucket];
            if (req.method === 'POST' && arquivos.has(caminho)) {
              status = json(res, 409, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
            } else if (corpo.length > regra.limite) {
              // O bucket real tem limite de tamanho; aqui vale o mesmo.
              status = json(res, 413, { statusCode: '413', error: 'Payload too large', message: 'exceeded the maximum allowed size' });
            } else if (regra.tipos && !(regra.tipos as readonly string[]).includes(contentType.split(';')[0]!.trim())) {
              status = json(res, 415, { statusCode: '415', error: 'invalid_mime_type', message: 'mime type not supported' });
            } else {
              arquivos.set(caminho, { bytes: corpo, contentType });
              status = json(res, 200, { Id: randomUUID(), Key: `${bucket}/${caminho}` });
            }
          }
          // Remoção: DELETE /object/<bucket> { prefixes: [...] }
          else if (req.method === 'DELETE' && caminho === '') {
            const corpo = JSON.parse((await lerCorpo(req)).toString() || '{}') as { prefixes?: string[] };
            const removidos: unknown[] = [];
            for (const p of corpo.prefixes ?? []) {
              if (arquivos.delete(p)) removidos.push({ name: p });
            }
            status = json(res, 200, removidos);
          } else {
            status = json(res, 405, { message: 'metodo nao tratado pelo dublê de Storage' });
          }
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

        // ---------------------------------------------------------------
        // Geocodificacao — formato Nominatim (fallback gratuito real)
        // ---------------------------------------------------------------
        else if (rota === '/search') {
          const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
          // O modulo de geocodificacao completa com ", Brasil" quando o
          // texto ja nao menciona — casamos ignorando esse sufixo.
          const semSufixo = q.replace(/,\s*brasil$/i, '').trim();
          const achado = [...geocodes.entries()].find(
            ([chave]) => chave.toLowerCase() === q || chave.toLowerCase() === semSufixo,
          );
          status = json(res, 200, achado ? [achado[1]] : []);
        }

        // ---------------------------------------------------------------
        // Asaas — todas as rotas exigem o access_token combinado
        // ---------------------------------------------------------------
        else if (rota.startsWith('/v3/')) {
          const token = req.headers['access_token'];
          if (token !== estado.asaasApiKey) {
            status = json(res, 401, {
              errors: [{ code: 'invalid_access_token', description: 'access_token invalido ou ausente' }],
            });
          } else if (req.method === 'POST' && rota === '/v3/customers') {
            const corpo = JSON.parse((await lerCorpo(req)).toString() || '{}') as {
              name?: string; cpfCnpj?: string; email?: string;
            };
            if (!corpo.name || !corpo.cpfCnpj) {
              status = json(res, 400, { errors: [{ code: 'invalid_customer', description: 'name e cpfCnpj sao obrigatorios' }] });
            } else {
              const id = `cus_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
              const cliente = { id, name: corpo.name, cpfCnpj: corpo.cpfCnpj, email: corpo.email ?? null };
              asaasCustomers.set(id, cliente);
              status = json(res, 200, cliente);
            }
          } else if (req.method === 'POST' && rota === '/v3/accounts') {
            const corpo = JSON.parse((await lerCorpo(req)).toString() || '{}') as {
              name?: string; cpfCnpj?: string; incomeValue?: number;
            };
            if (!corpo.name || !corpo.cpfCnpj || corpo.incomeValue === undefined) {
              status = json(res, 400, {
                errors: [{ code: 'invalid_account', description: 'name, cpfCnpj e incomeValue sao obrigatorios' }],
              });
            } else {
              const id = `acc_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
              const conta = { id, apiKey: `$testbed_key_${randomUUID()}`, walletId: randomUUID() };
              asaasSubaccounts.set(id, conta);
              status = json(res, 200, conta);
            }
          } else if (req.method === 'POST' && rota === '/v3/subscriptions') {
            const corpo = JSON.parse((await lerCorpo(req)).toString() || '{}') as {
              customer?: string; value?: number; nextDueDate?: string; billingType?: string; cycle?: string;
              externalReference?: string;
              split?: { walletId: string; fixedValue?: number; percentualValue?: number }[];
            };
            if (!corpo.customer || !corpo.value || !corpo.nextDueDate) {
              status = json(res, 400, {
                errors: [{ code: 'invalid_subscription', description: 'customer, value e nextDueDate sao obrigatorios' }],
              });
            } else if (!asaasCustomers.has(corpo.customer)) {
              status = json(res, 400, { errors: [{ code: 'invalid_customer', description: 'customer nao existe' }] });
            } else if (corpo.split?.some((s) => !asaasSubaccounts.has(
              [...asaasSubaccounts.values()].find((c) => c.walletId === s.walletId)?.id ?? '',
            ))) {
              status = json(res, 400, { errors: [{ code: 'invalid_wallet', description: 'walletId do split nao existe' }] });
            } else {
              const subId = `sub_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
              const assinatura: AsaasStubSubscription = {
                id: subId, status: 'ACTIVE', nextDueDate: corpo.nextDueDate,
                value: corpo.value, customer: corpo.customer,
                billingType: corpo.billingType, cycle: corpo.cycle,
                externalReference: corpo.externalReference ?? null, split: corpo.split ?? null,
              };
              asaasSubscriptions.set(subId, assinatura);

              // Criar assinatura gera a primeira cobranca — como o Asaas real.
              const payId = `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
              asaasPayments.set(payId, {
                id: payId, status: 'PENDING', value: corpo.value, netValue: null,
                invoiceUrl: `http://127.0.0.1/fake-invoice/${payId}`, dueDate: corpo.nextDueDate,
                refundedCents: 0, subscription: subId,
                billingType: corpo.billingType, externalReference: corpo.externalReference ?? null,
                split: corpo.split ?? null,
              });

              status = json(res, 200, { ...assinatura, firstPaymentId: payId });
            }
          } else if (req.method === 'POST' && rota === '/v3/payments') {
            // Cobranca UNICA (nao recorrente) — Destaque/Turbo e, na Parte 12,
            // o aluguel por tempo (com split para a carteira do proprietario).
            const corpo = JSON.parse((await lerCorpo(req)).toString() || '{}') as {
              customer?: string; value?: number; dueDate?: string; billingType?: string; externalReference?: string;
              split?: { walletId: string; fixedValue?: number; percentualValue?: number }[];
            };
            if (!corpo.customer || !corpo.value || !corpo.dueDate) {
              status = json(res, 400, {
                errors: [{ code: 'invalid_payment', description: 'customer, value e dueDate sao obrigatorios' }],
              });
            } else if (!asaasCustomers.has(corpo.customer)) {
              status = json(res, 400, { errors: [{ code: 'invalid_customer', description: 'customer nao existe' }] });
            } else if (corpo.split?.some((s) => !walletExiste(s.walletId))) {
              status = json(res, 400, { errors: [{ code: 'invalid_wallet', description: 'walletId do split nao existe' }] });
            } else if (corpo.split?.some((s) => (s.fixedValue ?? 0) > corpo.value!)) {
              status = json(res, 400, { errors: [{ code: 'invalid_split', description: 'valor do split maior que a cobranca' }] });
            } else {
              const payId = `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
              const pagamento: AsaasStubPayment = {
                id: payId, status: 'PENDING', value: corpo.value, netValue: null,
                invoiceUrl: `http://127.0.0.1/fake-invoice/${payId}`, dueDate: corpo.dueDate,
                refundedCents: 0, subscription: null,
                billingType: corpo.billingType ?? 'UNDEFINED', deleted: false,
                split: corpo.split ?? null, externalReference: corpo.externalReference ?? null,
              };
              asaasPayments.set(payId, pagamento);
              status = json(res, 200, pagamento);
            }
          } else if (req.method === 'DELETE' && /^\/v3\/subscriptions\/[^/]+$/.test(rota)) {
            const id = rota.split('/').pop()!;
            const existente = asaasSubscriptions.get(id);
            if (!existente) {
              status = json(res, 404, { errors: [{ code: 'not_found', description: 'assinatura nao encontrada' }] });
            } else {
              asaasSubscriptions.set(id, { ...existente, status: 'CANCELLED' });
              // Como no Asaas: remover a assinatura remove as cobranças ainda não pagas dela.
              for (const p of asaasPayments.values()) {
                if (p.subscription === id && ['PENDING', 'OVERDUE'].includes(p.status)) {
                  asaasPayments.set(p.id, { ...p, deleted: true });
                }
              }
              status = json(res, 200, { deleted: true, id });
            }
          } else if (req.method === 'GET' && rota === '/v3/payments') {
            const subscriptionId = url.searchParams.get('subscription');
            const lista = [...asaasPayments.values()].filter((p) => !subscriptionId || p.subscription === subscriptionId);
            status = json(res, 200, { data: lista, totalCount: lista.length });
          } else if (req.method === 'GET' && /^\/v3\/payments\/[^/]+$/.test(rota)) {
            const id = rota.split('/').pop()!;
            const pagamento = asaasPayments.get(id);
            status = pagamento
              ? json(res, 200, pagamento)
              : json(res, 404, { errors: [{ code: 'not_found', description: 'cobranca nao encontrada' }] });
          } else if (req.method === 'PUT' && /^\/v3\/payments\/[^/]+$/.test(rota)) {
            // Troca a forma de pagamento da MESMA cobrança (só enquanto não foi paga).
            const id = rota.split('/').pop()!;
            const pagamento = asaasPayments.get(id);
            const corpo = JSON.parse((await lerCorpo(req)).toString() || '{}') as { billingType?: string };
            if (!pagamento || pagamento.deleted) {
              status = json(res, 404, { errors: [{ code: 'not_found', description: 'cobranca nao encontrada' }] });
            } else if (!['PENDING', 'OVERDUE'].includes(pagamento.status)) {
              status = json(res, 400, { errors: [{ code: 'invalid_action', description: 'So e possivel alterar cobrancas aguardando pagamento ou vencidas.' }] });
            } else if (!corpo.billingType || !['PIX', 'CREDIT_CARD', 'BOLETO', 'UNDEFINED'].includes(corpo.billingType)) {
              status = json(res, 400, { errors: [{ code: 'invalid_billingType', description: 'billingType invalido' }] });
            } else {
              const atualizado = { ...pagamento, billingType: corpo.billingType };
              asaasPayments.set(id, atualizado);
              status = json(res, 200, atualizado);
            }
          } else if (req.method === 'DELETE' && /^\/v3\/payments\/[^/]+$/.test(rota)) {
            const id = rota.split('/').pop()!;
            const pagamento = asaasPayments.get(id);
            if (!pagamento || pagamento.deleted) {
              status = json(res, 404, { errors: [{ code: 'not_found', description: 'cobranca nao encontrada' }] });
            } else if (!['PENDING', 'OVERDUE'].includes(pagamento.status)) {
              status = json(res, 400, { errors: [{ code: 'invalid_action', description: 'Cobranca paga nao pode ser removida; use o estorno.' }] });
            } else {
              asaasPayments.set(id, { ...pagamento, deleted: true });
              status = json(res, 200, { deleted: true, id });
            }
          } else if (req.method === 'GET' && /^\/v3\/payments\/[^/]+\/pixQrCode$/.test(rota)) {
            const id = rota.split('/').slice(-2)[0]!;
            const pagamento = asaasPayments.get(id);
            if (!pagamento || pagamento.deleted) {
              status = json(res, 404, { errors: [{ code: 'not_found', description: 'cobranca nao encontrada' }] });
            } else if (estado.asaasSemChavePix) {
              status = json(res, 400, { errors: [{ code: 'invalid_action', description: 'Nao ha chave Pix cadastrada na conta.' }] });
            } else if (!['PENDING', 'OVERDUE'].includes(pagamento.status) || pagamento.billingType === 'CREDIT_CARD') {
              status = json(res, 400, { errors: [{ code: 'invalid_action', description: 'QR Code disponivel so para cobranca Pix/boleto em aberto.' }] });
            } else {
              status = json(res, 200, {
                encodedImage: qrPng,
                payload: `00020126580014br.gov.bcb.pix0136testbed-${id}5204000053039865406${pagamento.value.toFixed(2)}5802BR6304ABCD`,
                expirationDate: `${pagamento.dueDate} 23:59:59`,
              });
            }
          } else if (req.method === 'POST' && /^\/v3\/payments\/[^/]+\/refund$/.test(rota)) {
            const id = rota.split('/').slice(-2)[0]!;
            const pagamento = asaasPayments.get(id);
            if (!pagamento) {
              status = json(res, 404, { errors: [{ code: 'not_found', description: 'cobranca nao encontrada' }] });
            } else if (!['RECEIVED', 'CONFIRMED'].includes(pagamento.status)) {
              // Inclui o caso de estorno pedido duas vezes: já está REFUNDED.
              status = json(res, 400, { errors: [{ code: 'invalid_action', description: `Cobranca com status ${pagamento.status} nao pode ser estornada.` }] });
            } else {
              const corpo = JSON.parse((await lerCorpo(req)).toString() || '{}') as { value?: number };
              const valorReais = corpo.value ?? pagamento.value;
              const atualizado = { ...pagamento, status: 'REFUNDED', refundedCents: Math.round(valorReais * 100) };
              asaasPayments.set(id, atualizado);
              status = json(res, 200, atualizado);
            }
          } else {
            status = json(res, 404, { errors: [{ code: 'not_found', description: `rota Asaas nao implementada no testbed: ${rota}` }] });
          }
        }

        // ---------------------------------------------------------------
        // Resend — exige Authorization: Bearer <chave>
        // ---------------------------------------------------------------
        else if (req.method === 'POST' && rota === '/emails') {
          const auth = req.headers.authorization ?? '';
          const token = auth.replace(/^Bearer\s+/i, '');
          if (token !== estado.resendApiKey) {
            status = json(res, 401, {
              statusCode: 401, name: 'validation_error', message: 'API key is invalid',
            });
          } else {
            const corpo = JSON.parse((await lerCorpo(req)).toString() || '{}') as {
              from?: string; to?: string[]; subject?: string; html?: string; text?: string;
            };
            if (!corpo.from || !corpo.to?.length || !corpo.subject) {
              status = json(res, 422, {
                statusCode: 422, name: 'validation_error',
                message: 'from, to e subject sao obrigatorios',
              });
            } else {
              const id = randomUUID();
              emailsSent.push({
                id, from: corpo.from, to: corpo.to, subject: corpo.subject,
                html: corpo.html ?? '', text: corpo.text ?? '',
              });
              status = json(res, 200, { id });
            }
          }
        }

        // ---------------------------------------------------------------
        // Upstash Redis — POST /pipeline, exige Authorization: Bearer <token>
        // ---------------------------------------------------------------
        else if (req.method === 'POST' && rota === '/pipeline') {
          const auth = req.headers.authorization ?? '';
          const token = auth.replace(/^Bearer\s+/i, '');
          if (token !== estado.upstashToken) {
            status = json(res, 401, { error: 'Unauthorized' });
          } else {
            const comandos = JSON.parse((await lerCorpo(req)).toString() || '[]') as unknown[][];
            const agora = Date.now();
            const respostas = comandos.map((cmd) => {
              const [nome, chave, ...args] = cmd as [string, string, ...unknown[]];
              const atual = redisStore.get(chave);
              const expirado = !atual || atual.expiresAt <= agora;

              if (nome === 'INCR') {
                const novo = expirado ? 1 : atual.count + 1;
                redisStore.set(chave, { count: novo, expiresAt: expirado ? 0 : atual!.expiresAt });
                return { result: novo };
              }
              if (nome === 'EXPIRE') {
                const segundos = Number(args[0]);
                const nx = args[1] === 'NX';
                const linha = redisStore.get(chave);
                if (!linha) return { result: 0 };
                if (nx && linha.expiresAt > agora) return { result: 0 };
                linha.expiresAt = agora + segundos * 1000;
                return { result: 1 };
              }
              if (nome === 'TTL') {
                const linha = redisStore.get(chave);
                if (!linha || linha.expiresAt <= agora) return { result: -2 };
                return { result: Math.ceil((linha.expiresAt - agora) / 1000) };
              }
              return { error: `comando nao implementado no testbed: ${nome}` };
            });
            status = json(res, 200, respostas);
          }
        }

        // ---------------------------------------------------------------
        // Twilio Verify — Basic auth (Account SID : Auth Token)
        // ---------------------------------------------------------------
        else if (req.method === 'POST' && /^\/v2\/Services\/[^/]+\/(Verifications|VerificationCheck)$/.test(rota)) {
          const [, , , servico, recurso] = rota.split('/');
          const esperado = `Basic ${Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString('base64')}`;
          const params = new URLSearchParams((await lerCorpo(req)).toString());
          const to = params.get('To') ?? '';
          const agora = Date.now();
          const erro = (http: number, code: number, message: string) =>
            json(res, http, { code, message, more_info: `https://www.twilio.com/docs/errors/${code}`, status: http });

          if ((req.headers.authorization ?? '') !== esperado) {
            status = erro(401, 20003, 'Authenticate');
          } else if (servico !== twilio.serviceSid) {
            status = erro(404, 20404, `The requested resource /Services/${servico} was not found`);
          } else if (recurso === 'Verifications') {
            const envios = twilioSmsSent.filter((m) => m.to === to && agora - m.at < 10 * 60_000).length;
            if (!/^\+[1-9]\d{7,14}$/.test(to)) {
              status = erro(400, 60200, 'Invalid parameter `To`');
            } else if (twilioLandlines.has(to)) {
              status = erro(400, 60205, 'SMS is not supported by landline phone number');
            } else if (envios >= 5) {
              status = erro(429, 60203, 'Max send attempts reached');
            } else {
              const code = String(Math.floor(100000 + Math.random() * 900000));
              const sid = `VE${randomUUID().replace(/-/g, '')}`;
              twilioVerifs.set(to, { sid, code, status: 'pending', checks: 0, expiresAt: agora + 10 * 60_000 });
              twilioSmsSent.push({ to, code, at: agora });
              status = json(res, 201, {
                sid, service_sid: twilio.serviceSid, account_sid: twilio.accountSid,
                to, channel: params.get('Channel') ?? 'sms', status: 'pending', valid: false,
                date_created: new Date(agora).toISOString(),
              });
            }
          } else {
            const v = twilioVerifs.get(to);
            if (!v || v.status !== 'pending' || v.expiresAt <= agora) {
              // Aprovada ou expirada: o Twilio "apaga" e responde 20404.
              status = erro(404, 20404, `The requested resource /Services/${servico}/VerificationCheck was not found`);
            } else if (v.checks >= 5) {
              v.status = 'max_attempts_reached';
              status = erro(429, 60202, 'Max check attempts reached');
            } else {
              v.checks++;
              const certo = params.get('Code') === v.code;
              if (certo) v.status = 'approved';
              status = json(res, 200, {
                sid: v.sid, service_sid: twilio.serviceSid, account_sid: twilio.accountSid,
                to, channel: 'sms', status: certo ? 'approved' : 'pending', valid: certo,
              });
              if (certo) twilioVerifs.delete(to);
            }
          }
        }

        // ---------------------------------------------------------------
        // Anthropic — Messages API
        // ---------------------------------------------------------------
        else if (req.method === 'POST' && rota === '/v1/messages') {
          const corpo = JSON.parse((await lerCorpo(req)).toString() || '{}') as Record<string, unknown>;
          anthropicRequests.push({ headers: { ...req.headers }, body: corpo });
          const erroApi = (http: number, type: string, message: string) =>
            json(res, http, { type: 'error', error: { type, message } });

          if (req.headers['x-api-key'] !== anthropicApiKey) {
            status = erroApi(401, 'authentication_error', 'invalid x-api-key');
          } else if (!req.headers['anthropic-version']) {
            status = erroApi(400, 'invalid_request_error', 'anthropic-version header is required');
          } else {
            const proxima = anthropicQueue.shift();
            if (proxima?.delayMs) await new Promise((r) => setTimeout(r, proxima.delayMs));
            if (!proxima) {
              status = erroApi(500, 'api_error', 'fila vazia no dublê: o teste não enfileirou resposta');
            } else if (proxima.status && proxima.status !== 200) {
              status = erroApi(proxima.status, proxima.errorType ?? 'api_error', 'erro simulado pelo teste');
            } else {
              status = json(res, 200, {
                id: `msg_${randomUUID().replace(/-/g, '')}`,
                type: 'message',
                role: 'assistant',
                model: corpo.model,
                content: proxima.text != null ? [{ type: 'text', text: proxima.text }] : [],
                stop_reason: proxima.stopReason ?? 'end_turn',
                stop_sequence: null,
                usage: { input_tokens: 100, output_tokens: 50 },
              });
            }
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
    audioObjects,
    users,
    ceps,
    geocodes,
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
    asaasApiKey: estado.asaasApiKey,
    get asaasSemChavePix() {
      return estado.asaasSemChavePix;
    },
    set asaasSemChavePix(v: boolean) {
      estado.asaasSemChavePix = v;
    },
    asaasCustomers,
    asaasSubaccounts,
    asaasSubscriptions,
    asaasPayments,
    resendApiKey: estado.resendApiKey,
    emailsSent,
    upstashToken: estado.upstashToken,
    redisStore,
    twilio,
    twilioSmsSent,
    twilioLandlines,
    anthropicApiKey,
    anthropicQueue,
    hooks,
    anthropicRequests,
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
