// Teste do detector de erros de fala com transcrições inventadas. Uso: node test/retakes.test.mjs
import { detectRetakes } from '../src/engine/retakes.js';
const mk = (txt) => { let t = 0; return txt.split(' ').map((x) => { if (x.startsWith('|')) { const p = Number(x.slice(1)); t += p; return null; } const d = Math.max(0.15, x.length * 0.06); const w = { text: x, start: t, end: t + d }; t += d + 0.08; return w; }).filter(Boolean); };
const keep = (ws, fx) => { const rm = new Set(); for (const f of fx) for (let i = f.from; i < f.to; i++) rm.add(i); return ws.filter((_, i) => !rm.has(i)).map((w) => w.text).join(' '); };
const cases = [
  ['eu vou falar sobre o pac... |0.5 eu vou falar sobre o pacote três d', 'eu vou falar sobre o pacote três d'],
  ['a gente vai vender o pac o pacote hoje', 'a gente vai vender o pacote hoje'],
  ['eu comprei esse produto |0.6 eu comprei esse pacote ontem', 'eu comprei esse pacote ontem'],
  ['eu eu vou te mostrar', 'eu vou te mostrar'],
  ['não não não faz isso', 'não não não faz isso'],
  ['é muito muito bom', 'é muito muito bom'],
  ['a gente vende e a gente lucra', 'a gente vende e a gente lucra'],
  ['isso é hum |0.3 importante demais', 'isso é importante demais'],
  ['então ééé |0.4 vamos lá', 'então vamos lá'],
  ['o que é isso', 'o que é isso'],
  ['há dois anos eu comecei', 'há dois anos eu comecei'],
  ['vou te mostrar como fal- falar melhor', 'vou te mostrar como falar melhor'],
  ['olha só que legal |0.8 olha só que legal mesmo', 'olha só que legal mesmo'],
  ['hoje eu vou mostrar |1.2 hoje eu vou mostrar três coisas', 'hoje eu vou mostrar três coisas'],
  ['o pacote custa cinquenta |0.5 o pacote custa quarenta reais', 'o pacote custa quarenta reais'],
  ['primeiro passo é abrir o app e depois abrir o site', 'primeiro passo é abrir o app e depois abrir o site'],
];
let ok = 0;
for (const [inp, want] of cases) {
  const ws = mk(inp), fx = detectRetakes(ws), got = keep(ws, fx);
  const pass = got === want; if (pass) ok++;
  console.log(pass ? 'ok  ' : 'ERRO', JSON.stringify(inp.replace(/\|[\d.]+ /g, '')), '→', JSON.stringify(got), pass ? '' : 'esperado ' + JSON.stringify(want), fx.map((f) => f.kind).join(','));
}
console.log(`${ok}/${cases.length}`);
process.exit(ok === cases.length ? 0 : 1);
