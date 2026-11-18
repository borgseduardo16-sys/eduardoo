// Guarda no aparelho os arquivos que a pessoa escolheu para o estilo dela (fonte, efeitos sonoros).
// Usa o IndexedDB do navegador; se não estiver disponível (aba anônima, por exemplo), tudo funciona sem guardar.
const DB = 'cortei', ST = 'arquivos';
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ST);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
  return dbp;
}
const tx = async (mode, fn) => {
  const d = await db();
  return new Promise((res, rej) => { const t = d.transaction(ST, mode), r = fn(t.objectStore(ST)); t.oncomplete = () => res(r?.result); t.onerror = () => rej(t.error); });
};
export const saveFile = (key, file) => tx('readwrite', (s) => s.put({ name: file.name, type: file.type, blob: file }, key)).catch(() => null);
export const loadFile = (key) => tx('readonly', (s) => s.get(key)).catch(() => null);
export const removeFile = (key) => tx('readwrite', (s) => s.delete(key)).catch(() => null);
