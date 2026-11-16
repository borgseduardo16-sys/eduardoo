// Servidor local de teste: serve site/, test/out/ e os arquivos do ONNX Runtime, com os mesmos cabeçalhos do _headers.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.argv[2] || 8930);
const ROOT = new URL('..', import.meta.url).pathname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.webm': 'video/webm', '.mp4': 'video/mp4', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const mounts = [['/ort/', 'node_modules/onnxruntime-web/dist/'], ['/tf/', 'node_modules/@huggingface/transformers/dist/'], ['/t/', 'test/out/'], ['/', 'site/']];

createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = null;
  for (const [prefix, dir] of mounts) if (p.startsWith(prefix)) { file = join(ROOT, dir, normalize(p.slice(prefix.length)).replace(/^(\.\.[/\\])+/, '')); break; }
  if (file && existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file || !existsSync(file)) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store',
    'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless',
  });
  createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log('http://127.0.0.1:' + PORT));
