/*
 * Monta roteiro.json a partir da NARRAÇÃO: cada fala tem início/fim medidos no áudio
 * (silencedetect) e o tempo de cada palavra é estimado pelas sílabas dentro da fala.
 * As cenas alternam entre BONECO (3D, só onde faz sentido) e TIPOGRAFIA (cinética).
 *   node montar-roteiro.mjs
 */
import { writeFileSync } from 'node:fs';

// Falas medidas no áudio (s). Pausas internas (vírgulas) viram falas separadas para cravar o tempo.
const FALAS = [
  [0.02, 3.78, 'Está cansado de sentir dor na coluna e não sabe mais o que fazer?'],
  [4.41, 8.59, 'E se alguns minutos por dia pudessem ajudar a aliviar esse desconforto?'],
  [9.22, 11.43, 'Criamos o Desafio 31 Dias,'],
  [11.76, 15.13, 'uma rotina de exercícios guiados com acompanhamento profissional,'],
  [15.5, 19.06, 'feita para você se movimentar e cuidar melhor da sua coluna.'],
  [19.6, 21.82, 'São poucos minutos por dia,'],
  [22.03, 23.06, 'durante 31 dias.'],
  [23.57, 26.62, 'Conheça o Desafio 31 Dias pelo link do perfil.'],
];

const silabas = (w) => {
  const s = w.toLowerCase().replace(/[^a-záàâãéêíóôõúüç0-9]/g, '');
  if (/^\d+$/.test(s)) return { '31': 4 }[s] ?? s.length * 2; // "trinta e um"
  const g = s.match(/[aeiouáàâãéêíóôõúü]+/g);
  return Math.max(1, g ? g.length : 1);
};

// tempo (s) em que cada palavra começa a ser falada
const PALAVRAS = [];
for (const [ini, fim, frase] of FALAS) {
  const ws = frase.split(' ');
  const pesos = ws.map((w) => silabas(w) + (/[,?.]$/.test(w) ? 0.6 : 0));
  const total = pesos.reduce((a, b) => a + b, 0);
  let acc = 0;
  ws.forEach((w, i) => {
    PALAVRAS.push({ w: w.replace(/[,]$/, ''), t: +(ini + (acc / total) * (fim - ini)).toFixed(3) });
    acc += pesos[i];
  });
}

/** Pega as palavras faladas a partir da n-ésima ocorrência de `inicio` até completar `texto`. */
let cursor = 0;
function sinc(texto) {
  const alvo = texto.replace(/\*/g, '').replace(/\n/g, ' ').split(' ').filter(Boolean);
  const norm = (s) => s.toLowerCase().replace(/[^a-záàâãéêíóôõúüç0-9]/g, '');
  while (cursor < PALAVRAS.length && norm(PALAVRAS[cursor].w) !== norm(alvo[0])) cursor++;
  if (cursor >= PALAVRAS.length) throw new Error(`não achei "${alvo[0]}" na fala`);
  const tempos = alvo.map((_, i) => PALAVRAS[cursor + i].t - 0.06); // aparece um tiquinho antes
  cursor += alvo.length;
  return tempos;
}

const T = (texto, estilo, extra) => {
  const tempos = sinc(texto);
  return { texto, estilo, pos: 'centro', tempos, ini: tempos[0], ...extra };
};

/* ------------------------------------------------------------------ textos */
const textos = [
  // A — boneco: dor
  T('Está cansado de sentir *dor* na coluna', 'titulo', { y: 220, fim: 4.1, tom: 'dor' }),
  T('e não sabe mais o que fazer?', 'apoio', { y: 480, fim: 4.1 }),
  // B — tipografia
  T('E se', 'selo', { y: 640, fim: 5.95 }),
  T('alguns\n*minutos*\npor dia', 'gigante', { y: 720, fim: 5.95, tom: 'alivio' }),
  // C — boneco: alívio
  T('pudessem ajudar a *aliviar*\nesse desconforto?', 'titulo', { y: 1240, fim: 9.05, tom: 'alivio' }),
  // D — tipografia: o produto
  T('Criamos o', 'selo', { y: 700, fim: 11.55 }),
  T('DESAFIO\n31 DIAS', 'marca', { y: 770, fim: 11.55 }),
  // E — tipografia: o que é
  T('uma rotina de', 'apoio', { y: 600, fim: 15.35 }),
  T('*exercícios guiados*', 'titulo', { y: 680, fim: 15.35, tom: 'alivio' }),
  T('com acompanhamento\nprofissional', 'titulo', { y: 900, fim: 15.35 }),
  // F — tipografia
  T('feita para você se', 'apoio', { y: 740, fim: 17.3 }),
  T('*movimentar*', 'gigante', { y: 820, fim: 17.3, tom: 'alivio' }),
  // G — boneco calmo
  T('e cuidar melhor da sua *coluna*', 'titulo', { y: 1300, fim: 19.45, tom: 'alivio' }),
  // H — tipografia: 31 dias
  T('São poucos minutos por dia', 'titulo', { y: 420, fim: 23.35 }),
  T('durante', 'selo', { y: 700, fim: 23.35 }),
];
const t31 = sinc('31 dias');
textos.push({ texto: '31', estilo: 'contador', pos: 'centro', y: 750, ini: t31[0] - 0.9, fim: 23.35, tempos: [t31[0] - 0.9], de: 1, ate: 31, dur: 1.0 });
textos.push({ texto: 'DIAS', estilo: 'selo', pos: 'centro', y: 1060, ini: t31[1], fim: 23.35, tempos: [t31[1]] });
textos.push({ texto: '', estilo: 'pontos', pos: 'centro', y: 1160, ini: 19.6, fim: 23.35, tempos: [19.6], n: 31, ate: 23.0 });
// I — encerramento
textos.push(T('Conheça o', 'selo', { y: 660, fim: 27.9 }));
textos.push(T('DESAFIO\n31 DIAS', 'marca', { y: 730, fim: 27.9 }));
textos.push(T('pelo *link do perfil*', 'cta', { y: 990, fim: 27.9, tom: 'alivio' }));
textos.push({ texto: 'Coluna em Movimento', estilo: 'assinatura', pos: 'centro', y: 1420, ini: 24.4, fim: 27.9, tempos: [24.4, 24.5, 24.6] });

/* ------------------------------------------------------------------- cenas */
// boneco só onde faz sentido: a dor, o alívio e o cuidado com a coluna
const cenas = [
  { ini: 0.0, fim: 4.2, tipo: 'boneco' },
  { ini: 4.2, fim: 5.85, tipo: 'tipo' },
  { ini: 5.85, fim: 9.1, tipo: 'boneco' },
  { ini: 9.1, fim: 11.6, tipo: 'tipo' },
  { ini: 11.6, fim: 15.4, tipo: 'tipo' },
  { ini: 15.4, fim: 17.25, tipo: 'tipo' },
  { ini: 17.25, fim: 19.5, tipo: 'boneco' },
  { ini: 19.5, fim: 23.4, tipo: 'tipo' },
  { ini: 23.4, fim: 27.9, tipo: 'tipo' },
];

const roteiro = {
  duracao: 27.9,
  cenas,
  trilhas: {
    camera: [
      // A: plano geral de frente, aproximando devagar
      { t: 0.0, ang: 18, dist: 5.0, alt: 1.0, alvoY: 1.12, fov: 26 },
      { t: 4.2, ang: 6, dist: 4.1, alt: 1.02, alvoY: 1.1 },
      // C: close na lombar, por trás
      { t: 5.85, ang: 172, dist: 1.9, alt: 1.08, alvoY: 0.98 },
      { t: 9.1, ang: 184, dist: 1.6, alt: 1.05, alvoY: 0.96 },
      // G: perfil, coluna saudável
      { t: 17.25, ang: 262, dist: 2.6, alt: 1.15, alvoY: 1.0 },
      { t: 19.5, ang: 280, dist: 2.35, alt: 1.15, alvoY: 1.0 },
    ],
    corpo: [
      { t: 0.0, opac: 0, dor: 0, calma: 0, dorT: 0.86, dorL: 0.13, varredura: -1, bloom: 0.42, escuro: 1 },
      { t: 0.9, opac: 1, escuro: 0 },
      { t: 1.0, dor: 0 },
      { t: 2.4, dor: 1 },
      { t: 5.85, dor: 1, calma: 0 },
      { t: sinc0('aliviar'), dor: 1 },
      { t: 8.7, dor: 0, calma: 0.35 },
      { t: 17.5, calma: 0.45, dor: 0 },
      { t: 27.9, calma: 0.45 },
    ],
  },
  textos,
};
function sinc0(w) {
  return PALAVRAS.find((p) => p.w.toLowerCase().startsWith(w)).t;
}

writeFileSync(new URL('./roteiro.json', import.meta.url), JSON.stringify(roteiro, null, 1));
console.log(PALAVRAS.map((p) => `${p.t.toFixed(2)} ${p.w}`).join('\n'));
