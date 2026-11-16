// Legendas automáticas: reconhecimento de fala (Whisper) rodando no próprio aparelho, dentro de um worker.
// O modelo é baixado uma vez (fica guardado no navegador) e nada é enviado para servidor.
// A biblioteca de reconhecimento de fala é carregada da CDN só quando a pessoa pede legendas (o site fica leve para quem não usa).
const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js';
let lib = null;

const MODELS = {
  tiny: 'onnx-community/whisper-tiny_timestamped',
  base: 'onnx-community/whisper-base_timestamped',
  small: 'onnx-community/whisper-small_timestamped',
};
let current = null; // { key, transcriber }
const post = (m) => self.postMessage(m);

async function load(model, device) {
  const { pipeline } = lib;
  const key = model + ':' + device;
  if (current?.key === key) return current.transcriber;
  if (current) { try { await current.transcriber.dispose(); } catch { /* já liberado */ } current = null; }
  const dtype = device === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8';
  const files = {};
  const transcriber = await pipeline('automatic-speech-recognition', MODELS[model], {
    device, dtype,
    progress_callback: (p) => {
      if (p.status !== 'progress' || !p.total) return;
      files[p.file] = [p.loaded, p.total];
      let l = 0, t = 0; for (const [a, b] of Object.values(files)) { l += a; t += b; }
      post({ type: 'download', loaded: l, total: t });
    },
  });
  current = { key, transcriber };
  return transcriber;
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type !== 'run') return;
  try { lib = lib || (await import(m.lib || LIB)); } catch (err) { post({ type: 'error', message: 'biblioteca: ' + String(err?.message || err) }); return; }
  const { env } = lib;
  if (m.ortBase) env.backends.onnx.wasm.wasmPaths = { mjs: m.ortBase + 'ort-wasm-simd-threaded.asyncify.mjs', wasm: m.ortBase + 'ort-wasm-simd-threaded.asyncify.wasm' };
  const devices = m.device ? [m.device] : self.navigator?.gpu ? ['webgpu', 'wasm'] : ['wasm'];
  let lastErr = null;
  for (const device of devices) {
    try {
      post({ type: 'stage', stage: 'loading', device });
      const tr = await load(m.model, device);
      post({ type: 'stage', stage: 'transcribing', device });
      const out = await tr(m.audio, { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5, language: m.language || 'pt', task: 'transcribe' });
      const words = (out.chunks || []).map((c) => ({ text: String(c.text || '').trim(), start: c.timestamp?.[0] ?? 0, end: c.timestamp?.[1] ?? (c.timestamp?.[0] ?? 0) + 0.3 })).filter((w) => w.text);
      post({ type: 'done', device, words });
      return;
    } catch (err) { lastErr = err; current = null; }
  }
  post({ type: 'error', message: String(lastErr?.message || lastErr) });
};
