// Reconhecimento de fala (Whisper) rodando no próprio aparelho, dentro de um worker.
// O modelo é baixado uma vez (fica guardado no navegador) e nada é enviado para servidor.
// A biblioteca é carregada da CDN só quando a pessoa pede (o site fica leve para quem não usa).
const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js';
const MODELS = {
  tiny: 'onnx-community/whisper-tiny_timestamped',
  base: 'onnx-community/whisper-base_timestamped',
  small: 'onnx-community/whisper-small_timestamped',
};
let lib = null, current = null; // { key, transcriber, words: bool }
const post = (m) => self.postMessage(m);

async function load(modelId, device) {
  const key = modelId + ':' + device;
  if (current?.key === key) return current;
  if (current) { try { await current.transcriber.dispose(); } catch { /* já liberado */ } current = null; }
  const dtype = device === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8';
  const files = {};
  const transcriber = await lib.pipeline('automatic-speech-recognition', modelId, {
    device, dtype,
    progress_callback: (p) => {
      if (p.status !== 'progress' || !p.total) return;
      files[p.file] = [p.loaded, p.total];
      let l = 0, t = 0; for (const [a, b] of Object.values(files)) { l += a; t += b; }
      post({ type: 'download', loaded: l, total: t });
    },
  });
  current = { key, transcriber, words: true };
  return current;
}

// quando o modelo não dá o tempo de cada palavra, divide o tempo da frase entre as palavras (pelo tamanho)
function spreadWords(chunks) {
  const out = [];
  for (const c of chunks || []) {
    const s = c.timestamp?.[0] ?? 0, e = c.timestamp?.[1] ?? s + 2, toks = String(c.text || '').trim().split(/\s+/).filter(Boolean);
    const total = toks.reduce((n, t) => n + t.length + 1, 0) || 1; let t = s;
    for (const tok of toks) { const d = ((e - s) * (tok.length + 1)) / total; out.push({ text: tok, start: t, end: t + d * 0.9 }); t += d; }
  }
  return out;
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type !== 'run') return;
  try {
    lib = lib || (await import(m.lib || LIB));
  } catch (err) { post({ id: m.id, type: 'error', message: 'biblioteca: ' + String(err?.message || err) }); return; }
  const { env } = lib;
  if (m.ortBase) env.backends.onnx.wasm.wasmPaths = { mjs: m.ortBase + 'ort-wasm-simd-threaded.asyncify.mjs', wasm: m.ortBase + 'ort-wasm-simd-threaded.asyncify.wasm' };
  if (m.localModels) { env.localModelPath = m.localModels; env.allowRemoteModels = false; env.allowLocalModels = true; } // só nos testes
  const modelId = m.modelId || MODELS[m.model] || MODELS.base;
  const devices = m.device ? [m.device] : self.navigator?.gpu ? ['webgpu', 'wasm'] : ['wasm'];
  let lastErr = null;
  for (const device of devices) {
    try {
      post({ id: m.id, type: 'stage', stage: 'loading', device });
      const cur = await load(modelId, device);
      post({ id: m.id, type: 'stage', stage: 'transcribing', device });
      const opts = { chunk_length_s: 30, stride_length_s: 5, language: m.language || 'pt', task: 'transcribe' };
      let words = null;
      if (cur.words) {
        try {
          const out = await cur.transcriber(m.audio, { ...opts, return_timestamps: 'word' });
          words = (out.chunks || []).map((c) => ({ text: String(c.text || '').trim(), start: c.timestamp?.[0] ?? 0, end: c.timestamp?.[1] ?? (c.timestamp?.[0] ?? 0) + 0.3 }));
        } catch (err) { cur.words = false; } // modelo sem tempo por palavra: usa o tempo das frases
      }
      if (!words) words = spreadWords((await cur.transcriber(m.audio, { ...opts, return_timestamps: true })).chunks);
      post({ id: m.id, type: 'done', device, approx: !cur.words, words: words.filter((w) => w.text) });
      return;
    } catch (err) { lastErr = err; current = null; }
  }
  post({ id: m.id, type: 'error', message: String(lastErr?.message || lastErr) });
};
