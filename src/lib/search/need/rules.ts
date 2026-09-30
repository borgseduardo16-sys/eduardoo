import { addToleranceCents, parseBRLToCents, InvalidAmountError } from '@/lib/money';
import type { SpaceTypeKey } from '@/lib/spaces/types';
import {
  emptyInterpretation,
  NEED_LIMITS,
  PURPOSE_TYPES,
  VEHICLE_REQUIRED_FEATURE,
  VEHICLE_TYPES,
  type NeedFeatureKey,
  type NeedInterpretation,
  type Purpose,
  type UnsupportedNeed,
  type Vehicle,
} from './vocabulary';

/**
 * Intérprete da busca por necessidade por REGRAS (Fase 23).
 *
 * É o caminho que sempre funciona: sem rede, sem IA, sem custo, e com o
 * mesmo resultado para o mesmo texto. A IA (quando configurada) só entra
 * para o que sobrar sem entender — ver `interpret.ts`.
 *
 * Como funciona: o texto é normalizado (minúsculas, sem acento) mantendo o
 * MESMO comprimento, para que um trecho reconhecido possa ser recortado do
 * texto original (o bairro aparece como a pessoa escreveu). Cada regra
 * "consome" o trecho que usou; o que não foi consumido e não é palavra
 * vazia vira `residual` — é isso que diz se vale chamar a IA.
 *
 * A ordem das regras importa e é de propósito: área e distância antes de
 * preço ("até 3 km" não é orçamento), datas antes de duração ("daqui a
 * 2 meses" é quando começa, não por quanto tempo), tudo antes do local
 * ("em torno de R$ 300" não é um bairro).
 */

export type RulesResult = {
  interpretation: NeedInterpretation;
  /** Palavras com conteúdo que nenhuma regra usou, como a pessoa escreveu. */
  residual: string[];
};

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

const MANTER = /[a-z0-9$/,.-]/;

/** Minúsculas, sem acento, só [a-z0-9$/,.-] e espaço — mesmo comprimento do original. */
export function normalizeSameLength(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '²') {
      out += '2';
      continue;
    }
    const base = c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const primeiro = base.charAt(0);
    out += primeiro && MANTER.test(primeiro) ? primeiro : ' ';
  }
  return out;
}

class Scanner {
  private readonly used: boolean[];

  constructor(readonly norm: string) {
    this.used = new Array<boolean>(norm.length).fill(false);
  }

  isFree(start: number, end: number): boolean {
    for (let i = start; i < end; i++) if (this.used[i]) return false;
    return true;
  }

  isUsed(i: number): boolean {
    return this.used[i] ?? false;
  }

  take(start: number, end: number) {
    for (let i = start; i < end; i++) this.used[i] = true;
  }

  /** Ocorrências ainda livres, na ordem do texto. */
  *free(re: RegExp): Generator<RegExpExecArray> {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = g.exec(this.norm)) !== null) {
      if (m[0].length === 0) {
        g.lastIndex++;
        continue;
      }
      if (this.isFree(m.index, m.index + m[0].length)) yield m;
    }
  }

  /** Ocorrências mesmo já consumidas (ex.: "moto" dentro de "vaga de moto"). */
  *all(re: RegExp): Generator<RegExpExecArray> {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = g.exec(this.norm)) !== null) {
      if (m[0].length === 0) {
        g.lastIndex++;
        continue;
      }
      yield m;
    }
  }
}

// ---------------------------------------------------------------------------
// Datas (strings AAAA-MM-DD, sem fuso: `today` já vem no fuso de São Paulo)
// ---------------------------------------------------------------------------

function isoFromUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseISO(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return isoFromUTC(d);
}

function addMonthsFirstDay(iso: string, n: number): string {
  const d = parseISO(iso);
  return isoFromUTC(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)));
}

function validDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return isoFromUTC(dt);
}

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};
const NOMES_MESES = Object.keys(MESES).join('|');

const NUMERO_POR_EXTENSO: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6,
  sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
};
const EXTENSO = Object.keys(NUMERO_POR_EXTENSO).join('|');

function numeroPequeno(token: string): number | null {
  if (/^\d{1,3}$/.test(token)) return Number(token);
  return NUMERO_POR_EXTENSO[token] ?? null;
}

// ---------------------------------------------------------------------------
// Dicionários
// ---------------------------------------------------------------------------

const FEATURES: [RegExp, NeedFeatureKey][] = [
  [/\bsem (?:umidade|mofo|goteiras?|infiltrac(?:ao|oes))\b/, 'seco_ventilado'],
  [/\b(?:acesso|entrada|portao) (?:para|pra|de) caminh(?:ao|oes)\b|\b(?:entra|cabe|passa) caminh(?:ao|oes)\b/, 'acesso_caminhao'],
  [/\b(?:acesso|entrada) (?:para|pra|de) carros?\b|\b(?:entra|cabe) (?:um )?carro\b/, 'acesso_carro'],
  [/\b(?:acesso|entrada) (?:para|pra|de) motos?\b/, 'acesso_moto'],
  [/\bcobert[oa]s?\b|\bcobertura\b|\bprotegid[oa]s? da chuva\b|\bdebaixo de telhado\b/, 'coberto'],
  [/\bfechad[oa]s?\b|\btrancad[oa]s?\b|\bcom chave\b|\bcom cadeado\b/, 'fechado'],
  [/\bportao(?: eletronico| automatico)?\b|\bportoes\b/, 'portao'],
  [/\b(?:acesso\s+)?24 ?h(?:rs?|oras)?\b|\b(?:acesso a )?qualquer hora(?:rio)?\b|\bdia e noite\b|\bacesso livre\b/, 'acesso_24h'],
  [/\bcameras?\b|\bcftv\b|\bmonitorad[oa]s?\b|\bmonitoramento\b/, 'camera'],
  [/\balarmes?\b/, 'alarme'],
  [/\bportaria\b|\bporteiros?\b|\bvigias?\b|\bvigilancia\b|\bvigiad[oa]s?\b/, 'portaria'],
  [/\b(?:bem )?iluminad[oa]s?\b|\biluminacao\b/, 'iluminacao'],
  [/\btomadas?\b|\benergia\b|\beletricidade\b|\bponto de luz\b/, 'energia'],
  [/\bagua\b|\btorneiras?\b|\bpias?\b/, 'agua'],
  [/\bbanheiros?\b|\blavabos?\b|\bwc\b|\bsanitarios?\b/, 'banheiro'],
  [/\bsec[oa]s?\b|\bventilad[oa]s?\b|\barejad[oa]s?\b/, 'seco_ventilado'],
  [/\bpiso de concreto\b|\bconcreto\b/, 'piso_concreto'],
  [/\bcarga e descarga\b|\bdocas?\b|\bdescarregar\b/, 'carga_descarga'],
  [/\belevador(?:es)?\b/, 'elevador'],
  [/\bterreo\b|\bsem escadas?\b/, 'terreo'],
  [/\bmobiliad[oa]s?\b|\bcom mobilia\b/, 'mobiliado'],
];

/** 'vaga' = vaga sem veículo dito — resolve depois (moto → vaga de moto). */
const TIPOS: [RegExp, SpaceTypeKey | 'vaga'][] = [
  [/\bvagas? (?:de|para|pra) (?:motos?|motocicletas?|bicicletas?|bikes?)\b/, 'vaga_moto'],
  [/\bvagas? (?:de|para|pra) (?:carros?|automove(?:l|is)|veiculos?)\b|\bvagas? de garagem\b|\bvagas? de estacionamento\b|\bestacionamentos?\b/, 'vaga_carro'],
  [/\bvagas?\b/, 'vaga'],
  [/\bgarage(?:m|ns)\b/, 'garagem'],
  [/\bdepositos?\b|\bself[ -]?storage\b|\bguarda[ -]?moveis\b/, 'deposito'],
  [/\bgalp(?:ao|oes)\b|\bbarrac(?:ao|oes)\b|\barmaz(?:em|ens)\b/, 'galpao'],
  [/\bsalas? comerciais?\b|\bsalas?\b|\bconsultorios?\b/, 'sala'],
  [/\bescritorios?\b|\bcoworking\b/, 'escritorio'],
  [/\blojas?\b(?!\s+virtua)|\bpontos? comerciais?\b|\bponto comercial\b/, 'loja'],
  [/\bterrenos?\b|\blotes?\b|\bpatio\b|\barea aberta\b/, 'terreno'],
  [/\bquartos?\b|\bcomodos?\b/, 'quarto'],
];

const VEICULOS: [RegExp, Vehicle][] = [
  [/\bmotos?\b|\bmotocicletas?\b|\bmotoca\b|\bscooters?\b|\bmotonetas?\b/, 'moto'],
  [/\bcaminh(?:ao|oes)\b|\bcarretas?\b|\bonibus\b|\bmicro-?onibus\b/, 'caminhao'],
  [/\bvans?\b|\bfurg(?:ao|oes)\b|\bcaminhonetes?\b|\bpick-?ups?\b|\bpicapes?\b|\bkombi\b|\butilitarios?\b/, 'utilitario'],
  [/\bcarros?\b|\bautomove(?:l|is)\b|\bveiculos?\b|\bsuv\b/, 'carro'],
  [/\bbicicletas?\b|\bbikes?\b|\bbicis?\b/, 'bicicleta'],
  [/\bbarcos?\b|\blanchas?\b|\bjet[ -]?skis?\b|\bbotes?\b|\bveleiros?\b|\bcaiaques?\b/, 'barco'],
  [/\btrailers?\b|\bmotor ?homes?\b|\breboques?\b|\bcarretinhas?\b|\bcampers?\b/, 'trailer'],
];

const GUARDAR = /\b(?:guardar|guarda|guardo|deixar|estacionar|armazenar|armazenagem|armazenamento|estocar)\b/;
const OBJETOS = /\b(?:moveis|mudanca|caixas?|coisas|objetos|pertences|bagagens?|malas?|equipamentos?|ferramentas?|materiais|material de construcao|documentos|arquivos?|eletrodomesticos|geladeira|fogao|colch(?:ao|oes)|sofas?|livros|brinquedos|roupas)\b/;
const FINALIDADES: [RegExp, Exclude<Purpose, 'guardar_veiculo' | 'armazenar'>][] = [
  [/\bestoques?\b|\bmercadorias?\b|\bprodutos\b|\binventario\b|\blogistica\b|\bdistribuicao\b|\be-?commerce\b|\bloja virtual\b/, 'estoque'],
  [/\btrabalhar\b|\bhome office\b|\batender(?: (?:clientes|pacientes|alunos))?\b|\batendimentos?\b|\breuni(?:ao|oes)\b|\bestudio\b|\bgravar\b|\bgravac(?:ao|oes)\b|\bdar aulas?\b/, 'trabalho'],
  [/\bvender\b|\bvendas\b|\bcomercio\b|\babrir (?:um |uma |o |a )?(?:negocio|comercio)\b|\bponto de venda\b|\bvitrine\b/, 'comercio'],
  [/\boficinas?\b|\bmarcenaria\b|\bserralheria\b|\bfabrica\b|\bfabricacao\b|\bproducao\b|\batelie[r]?\b|\bmontagem\b/, 'oficina'],
];

const NAO_SUPORTADOS: [RegExp, UnsupportedNeed][] = [
  [/\binternet\b|\bwi-?fi\b/, 'internet'],
  [/\bacessivel\b|\bacessibilidade\b|\bcadeirantes?\b|\bcadeira de rodas\b|\brampas?\b/, 'acessibilidade'],
  [/\bpets?\b|\bcachorros?\b|\bcaes\b|\bgatos?\b|\banima(?:l|is)\b|\bcanil\b/, 'animais'],
  [/\bar[ -]condicionado\b|\bclimatizad[oa]s?\b|\bclimatizacao\b/, 'ar_condicionado'],
];

const BARATO = /\bbarat(?:[oa]s?|inh[oa])\b|\bem conta\b|\beconomic[oa]\b|\bpreco baixo\b|\bmenor preco\b/;

const PERTO_DE_MIM = /\b(?:perto de mim|proximo de mim|proximo a mim|perto daqui|aqui perto|aqui por perto|por perto|perto de casa|perto da minha casa|proximo da minha casa|na minha regiao|minha regiao|no meu bairro|meu bairro)\b/;

/** Negação logo antes de uma característica: "sem portão", "não precisa de câmera". */
const NEGACAO = /(?:\bsem|\bnao precis[ao](?: ter)?|\bnao quero|\bnao necessariamente|\bdispenso|\bnao faco questao(?: de)?)\s+(?:de\s+|ter\s+|um\s+|uma\s+)?$/;

/** Palavras que não carregam critério nenhum (não viram resíduo). */
const VAZIAS = new Set(
  (
    'a o as os um uma uns umas de da do das dos em no na nos nas ao aos para pra pro pras pros por pelo pela ' +
    'pelos pelas com sem e ou que se mas onde quando como qual quais quanto eu me mim meu minha meus minhas ' +
    'seu sua voce voces nos gente preciso precisa precisando precisamos precisaria procuro procurando procura ' +
    'quero queria queremos gostaria busco buscando estou to tou esta tem tenha ter tenho tiver ser seja sendo ' +
    'bem bom boa muito muita pouco pouca mais menos so apenas tambem ja entao isso isto aqui ali la algum ' +
    'alguma alguns algumas lugar lugares local locais espaco espacos lugarzinho cantinho canto coisa algo tipo ' +
    'alugar aluguel alugo alugando alugaria locar locacao mensal mensalmente mes meses favor oi ola obrigado ' +
    'obrigada dia tarde noite pode podem possa posso poder consigo conseguir perto proximo cidade bairro ' +
    'regiao fica ficar uso usar utilizar pessoal particular preferencia preferencialmente idealmente ideal ' +
    'urgente certo qualquer ai sim nao ta tipo vez vezes onde tudo nada cada outro outra ate cerca volta ' +
    'torno grande pequeno pequena amplo ampla espacoso espacosa tamanho metros reais real valor preco '
  )
    .trim()
    .split(/\s+/),
);

/** Primeira palavra que nunca começa um nome de lugar ("no máximo", "em torno"…). */
const NAO_E_LUGAR = new Set(
  (
    'maximo minimo torno media mes meses ano anos dia dias semana semanas momento hora horas final fim inicio ' +
    'comeco caso lugar local espaco preco valor orcamento prazo periodo geral qualquer algum alguma um uma ' +
    'frente predio condominio rua casa minha meu seu sua nosso nossa breve cima baixo meio primeiro frente ' +
    'dinheiro conta vista cerca volta verao inverno outono primavera ferias natal carnaval feriado'
  )
    .trim()
    .split(/\s+/),
);

/** Palavras que encerram o nome de um lugar. */
const FIM_DE_LUGAR = new Set(
  (
    'por para pra pro com ate que onde pagando custando porque pois mas ou se e entre preciso quero tem tenha ' +
    'ter sem perto proximo cerca uns umas mais menos no na nos nas em a o as os um uma pelo pela coberta ' +
    'coberto fechado fechada'
  )
    .trim()
    .split(/\s+/),
);
const CONECTORES = new Set(['de', 'da', 'do', 'dos', 'das']);

// ---------------------------------------------------------------------------
// Dinheiro
// ---------------------------------------------------------------------------

const DINHEIRO = String.raw`(r\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*(mil|k)?\s*(reais|real|conto|contos|r\$)?`;

/** Grupos de `DINHEIRO` → centavos, ou null se não parecer valor válido. */
function centavosDe(inteiro: string | undefined, decimal: string | undefined, mil: string | undefined): number | null {
  if (!inteiro) return null;
  try {
    let cents = parseBRLToCents(decimal ? `${inteiro},${decimal}` : inteiro);
    if (mil) cents *= 1000;
    if (!Number.isSafeInteger(cents)) return null;
    if (cents < NEED_LIMITS.minPriceCents || cents > NEED_LIMITS.maxPriceCents) return null;
    return cents;
  } catch (err) {
    if (err instanceof InvalidAmountError) return null;
    throw err;
  }
}

const PALAVRA_DE_ORCAMENTO = /\b(?:orcamento|pagar|pago|pagando|custar|custando|custe|preco|valor|mensalidade|aluguel de|reais|real|conto|contos)\b|r\$/;

// ---------------------------------------------------------------------------
// Intérprete
// ---------------------------------------------------------------------------

export function interpretNeedByRules(input: string, ctx: { today: string }): RulesResult {
  const text = input.slice(0, NEED_LIMITS.maxTextLength);
  const norm = normalizeSameLength(text);
  const s = new Scanner(norm);
  const out = emptyInterpretation();
  const temContextoDeDinheiro = PALAVRA_DE_ORCAMENTO.test(norm);
  const limiteData = addDays(ctx.today, NEED_LIMITS.maxStartDays);

  const aceitarData = (iso: string | null): boolean => {
    if (!iso || iso < ctx.today || iso > limiteData) return false;
    if (iso === ctx.today) out.startNow = true;
    else if (!out.startDate) out.startDate = iso;
    return true;
  };

  // 0. "24/7" é acesso a qualquer hora, não 24 de julho.
  const features = new Set<NeedFeatureKey>();
  const faixasDeCaracteristica: [number, number][] = [];
  for (const m of s.free(/\b(?:acesso\s+)?24\s*\/\s*7\b/)) {
    features.add('acesso_24h');
    s.take(m.index, m.index + m[0].length);
  }

  // 1. Área: "20 m²", "pelo menos 30 metros quadrados".
  for (const m of s.free(/\b(?:(pelo menos|no minimo|minimo de|minimo|mais de|acima de|a partir de)\s+)?(?:(cerca de|uns|umas|por volta de|aproximadamente|mais ou menos|em torno de)\s+)?(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:m2|m 2|mts2|mt2|metros? quadrados?)(?![a-z0-9])/)) {
    const valor = Number(m[3]!.replace(',', '.'));
    if (!Number.isFinite(valor) || valor <= 0 || valor > NEED_LIMITS.maxSizeM2) continue;
    out.sizeMinM2 ??= Math.max(1, Math.floor(m[2] ? valor * 0.9 : valor));
    s.take(m.index, m.index + m[0].length);
  }

  // 2. Distância: "até 3 km", "num raio de 500 metros".
  for (const m of s.free(/\b(?:ate|no maximo|a menos de|num raio de|raio de|em um raio de|dentro de)\s+(\d{1,3}(?:[.,]\d)?)\s*(km|kms|quilometros?|metros|m)(?![a-z0-9])/)) {
    const n = Number(m[1]!.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) continue;
    const metros = m[2] === 'metros' || m[2] === 'm' ? n : n * 1000;
    out.radiusMeters ??= Math.round(Math.min(Math.max(metros, NEED_LIMITS.minRadiusMeters), NEED_LIMITS.maxRadiusMeters));
    s.take(m.index, m.index + m[0].length);
  }

  // 3. Quando começa.
  for (const m of s.free(/\b(?:agora|imediato|imediatamente|hoje|urgente|urgencia|o quanto antes|o mais rapido possivel|pra ja|para ja|de imediato|(?:n?essa|n?esta) semana)\b/)) {
    out.startNow = true;
    s.take(m.index, m.index + m[0].length);
  }
  for (const m of s.free(/\bamanha\b/)) {
    if (aceitarData(addDays(ctx.today, 1))) s.take(m.index, m.index + m[0].length);
  }
  for (const m of s.free(/\b(?:semana que vem|proxima semana)\b/)) {
    if (aceitarData(addDays(ctx.today, 7))) s.take(m.index, m.index + m[0].length);
  }
  for (const m of s.free(/\b(?:(?:no|para o|pro|a partir do) )?(?:mes que vem|proximo mes)\b/)) {
    if (aceitarData(addMonthsFirstDay(ctx.today, 1))) s.take(m.index, m.index + m[0].length);
  }
  for (const m of s.free(new RegExp(String.raw`\b(?:daqui a|daqui|dentro de|em)\s+(\d{1,2}|${EXTENSO})\s+(dias?|semanas?|mes|meses)\b`))) {
    const n = numeroPequeno(m[1]!);
    if (n == null) continue;
    const unidade = m[2]!;
    const iso = unidade.startsWith('dia')
      ? addDays(ctx.today, n)
      : unidade.startsWith('semana')
        ? addDays(ctx.today, n * 7)
        : addMonthsFirstDay(ctx.today, n);
    if (aceitarData(iso)) s.take(m.index, m.index + m[0].length);
  }
  for (const m of s.free(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/)) {
    const dia = Number(m[1]);
    const mes = Number(m[2]);
    const anoHoje = Number(ctx.today.slice(0, 4));
    let iso: string | null;
    if (m[3]) {
      const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      iso = validDate(ano, mes, dia);
    } else {
      iso = validDate(anoHoje, mes, dia);
      if (iso && iso < ctx.today) iso = validDate(anoHoje + 1, mes, dia);
    }
    if (aceitarData(iso)) s.take(m.index, m.index + m[0].length);
  }
  for (const m of s.free(new RegExp(String.raw`\b(?:(?:a partir do|no|do|para o|pro)\s+)?dia\s+(\d{1,2})(?:\s+de\s+(${NOMES_MESES}))?\b`))) {
    const dia = Number(m[1]);
    const anoHoje = Number(ctx.today.slice(0, 4));
    const mesHoje = Number(ctx.today.slice(5, 7));
    let iso: string | null;
    if (m[2]) {
      const mes = MESES[m[2]]!;
      iso = validDate(anoHoje, mes, dia);
      if (iso && iso < ctx.today) iso = validDate(anoHoje + 1, mes, dia);
    } else {
      iso = validDate(anoHoje, mesHoje, dia);
      if (!iso || iso < ctx.today) {
        const proximo = addMonthsFirstDay(ctx.today, 1);
        iso = validDate(Number(proximo.slice(0, 4)), Number(proximo.slice(5, 7)), dia);
      }
    }
    if (aceitarData(iso)) s.take(m.index, m.index + m[0].length);
  }
  for (const m of s.free(new RegExp(String.raw`\b(?:(?:a partir de|em|no mes de|para|pra|comecando em|inicio de|comeco de|no inicio de|desde|depois de)\s+)?(${NOMES_MESES})\b`))) {
    const mes = MESES[m[1]!]!;
    const anoHoje = Number(ctx.today.slice(0, 4));
    const mesHoje = Number(ctx.today.slice(5, 7));
    const iso = mes === mesHoje
      ? ctx.today
      : validDate(mes > mesHoje ? anoHoje : anoHoje + 1, mes, 1);
    if (aceitarData(iso)) s.take(m.index, m.index + m[0].length);
  }

  // 4. Por quanto tempo (informativo).
  for (const m of s.free(new RegExp(String.raw`\b(?:(?:por|durante|pelo periodo de|periodo de|prazo de|pelo prazo de)\s+)?(?:(?:cerca de|uns|umas|mais ou menos|aproximadamente|por volta de|em torno de|ate)\s+)?(\d{1,2}|${EXTENSO}|meio)\s+(mes|meses|semanas?|anos?|dias)\b`))) {
    const unidade = m[2]!;
    const qtd = m[1] === 'meio' ? 0.5 : numeroPequeno(m[1]!);
    if (qtd == null || qtd <= 0) continue;
    const meses = unidade.startsWith('ano')
      ? qtd * 12
      : unidade.startsWith('semana')
        ? Math.ceil((qtd * 7) / 30)
        : unidade === 'dias'
          ? Math.ceil(qtd / 30)
          : qtd;
    const inteiro = Math.max(1, Math.round(meses));
    if (inteiro > NEED_LIMITS.maxDurationMonths) continue;
    out.durationMonths ??= inteiro;
    s.take(m.index, m.index + m[0].length);
  }

  // 5. Orçamento.
  for (const m of s.free(new RegExp(String.raw`\bentre\s+${DINHEIRO}\s+(?:e|a)\s+${DINHEIRO}`))) {
    const temMoeda = Boolean(m[1] || m[4] || m[5] || m[6] || m[9] || m[10]) || temContextoDeDinheiro;
    if (!temMoeda) continue;
    // "entre 2 e 3 mil": o "mil" do segundo vale para o primeiro.
    const min = centavosDe(m[2], m[3], m[4] ?? m[9]);
    const max = centavosDe(m[7], m[8], m[9]);
    if (min == null || max == null || min > max) continue;
    out.priceMinCents ??= min;
    out.priceMaxCents ??= max;
    s.take(m.index, m.index + m[0].length);
  }
  for (const m of s.free(new RegExp(String.raw`\b(cerca de|uns|umas|por volta de|em torno de|mais ou menos|aproximadamente|aprox)\s+${DINHEIRO}`))) {
    const temMoeda = Boolean(m[2] || m[6]) || temContextoDeDinheiro;
    const cents = centavosDe(m[3], m[4], m[5]);
    if (!temMoeda || cents == null || out.priceMaxCents != null) continue;
    out.priceMaxCents = addToleranceCents(cents, NEED_LIMITS.approxToleranceBps);
    out.priceApprox = true;
    s.take(m.index, m.index + m[0].length);
  }
  for (const m of s.free(new RegExp(String.raw`\b(orcamento de|orcamento ate|orcamento|pagar ate|pagar|pago|pagando|custando ate|custando|que custe ate|que custe|custe ate|custe|valor de|valor ate|preco de|preco ate|aluguel de|aluguel ate|mensalidade de|limite de|ate|no maximo|maximo de|maximo|menos de|abaixo de|nao mais que|nao mais de|por ate)\s+${DINHEIRO}`))) {
    const palavraDeOrcamento = /^(?:orcamento|pagar|pago|pagando|custando|que custe|custe|valor|preco|aluguel|mensalidade|limite)/.test(m[1]!);
    const temMoeda = Boolean(m[2] || m[5] || m[6]);
    const cents = centavosDe(m[3], m[4], m[5]);
    if (cents == null || out.priceMaxCents != null) continue;
    if (!palavraDeOrcamento && !temMoeda && !temContextoDeDinheiro && cents < 3_000) continue;
    out.priceMaxCents = cents;
    s.take(m.index, m.index + m[0].length);
  }
  for (const m of s.free(new RegExp(String.raw`\b(a partir de|acima de|mais de|minimo de|no minimo)\s+${DINHEIRO}`))) {
    const temMoeda = Boolean(m[2] || m[5] || m[6]);
    const cents = centavosDe(m[3], m[4], m[5]);
    if (!temMoeda || cents == null || out.priceMinCents != null) continue;
    out.priceMinCents = cents;
    s.take(m.index, m.index + m[0].length);
  }
  for (const m of s.free(new RegExp(String.raw`r\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*(mil|k)?|\b(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*(mil)?\s*(?:reais|real|contos?)\b`))) {
    const cents = m[1] ? centavosDe(m[1], m[2], m[3]) : centavosDe(m[4], m[5], m[6]);
    if (cents == null || out.priceMaxCents != null) continue;
    out.priceMaxCents = cents;
    s.take(m.index, m.index + m[0].length);
  }
  if (out.priceMinCents != null && out.priceMaxCents != null && out.priceMinCents > out.priceMaxCents) {
    out.priceMinCents = null;
  }

  // 6. Perto de mim.
  for (const m of s.free(PERTO_DE_MIM)) {
    out.nearMe = true;
    s.take(m.index, m.index + m[0].length);
  }

  // 7. Características — "sem portão" não pede portão.
  for (const [re, key] of FEATURES) {
    for (const m of s.free(re)) {
      const comecaComSem = m[0].startsWith('sem ');
      const negada = !comecaComSem && NEGACAO.test(norm.slice(Math.max(0, m.index - 40), m.index));
      if (!negada) features.add(key);
      s.take(m.index, m.index + m[0].length);
      faixasDeCaracteristica.push([m.index, m.index + m[0].length]);
    }
  }

  // 8. Tipos ditos com todas as letras.
  const tiposExplicitos: { type: SpaceTypeKey | 'vaga'; at: number }[] = [];
  for (const [re, type] of TIPOS) {
    for (const m of s.free(re)) {
      tiposExplicitos.push({ type, at: m.index });
      s.take(m.index, m.index + m[0].length);
    }
  }

  // 9. Veículos — também dentro de "vaga de moto", mas não dentro de uma
  // característica: "depósito com acesso para carro" não é guardar carro.
  const veiculos: { vehicle: Vehicle; at: number }[] = [];
  const dentroDeCaracteristica = (i: number) => faixasDeCaracteristica.some(([a, b]) => i >= a && i < b);
  for (const [re, vehicle] of VEICULOS) {
    for (const m of s.all(re)) {
      if (dentroDeCaracteristica(m.index)) continue;
      if (!veiculos.some((v) => v.vehicle === vehicle)) veiculos.push({ vehicle, at: m.index });
      s.take(m.index, m.index + m[0].length);
    }
  }
  veiculos.sort((a, b) => a.at - b.at);

  // 10. Finalidade.
  let guardar = false;
  let estacionar = false;
  for (const m of s.free(GUARDAR)) {
    guardar = true;
    if (m[0] === 'estacionar') estacionar = true;
    s.take(m.index, m.index + m[0].length);
  }
  let objetos = false;
  for (const m of s.free(OBJETOS)) {
    objetos = true;
    s.take(m.index, m.index + m[0].length);
  }
  const outrasFinalidades: { purpose: Purpose; at: number }[] = [];
  for (const [re, purpose] of FINALIDADES) {
    for (const m of s.free(re)) {
      outrasFinalidades.push({ purpose, at: m.index });
      s.take(m.index, m.index + m[0].length);
    }
  }
  outrasFinalidades.sort((a, b) => a.at - b.at);

  if (estacionar && veiculos.length === 0) veiculos.push({ vehicle: 'carro', at: -1 });

  if (veiculos.length > 0 && !objetos) out.purpose = 'guardar_veiculo';
  else if (objetos || (guardar && outrasFinalidades.length === 0)) out.purpose = 'armazenar';
  else out.purpose = outrasFinalidades[0]?.purpose ?? null;
  out.vehicle = veiculos[0]?.vehicle ?? null;

  // 11. O que os anúncios não informam.
  const naoSuportados = new Set<UnsupportedNeed>();
  for (const [re, need] of NAO_SUPORTADOS) {
    for (const m of s.free(re)) {
      naoSuportados.add(need);
      s.take(m.index, m.index + m[0].length);
    }
  }
  out.unsupported = [...naoSuportados];

  // 12. "Barato".
  for (const m of s.free(BARATO)) {
    out.cheap = true;
    s.take(m.index, m.index + m[0].length);
  }

  // 13. Local — por último, só no que sobrou.
  out.location = extrairLocal(text, s);

  // ---- Tipos finais: dito > veículo > finalidade.
  const vagaDeMoto = out.vehicle === 'moto' || out.vehicle === 'bicicleta';
  const tipos: SpaceTypeKey[] = [];
  const addTipo = (t: SpaceTypeKey) => {
    if (!tipos.includes(t)) tipos.push(t);
  };
  if (tiposExplicitos.length > 0) {
    for (const t of tiposExplicitos.sort((a, b) => a.at - b.at)) {
      addTipo(t.type === 'vaga' ? (vagaDeMoto ? 'vaga_moto' : 'vaga_carro') : t.type);
    }
  } else if (veiculos.length > 0) {
    for (const v of veiculos) VEHICLE_TYPES[v.vehicle].forEach(addTipo);
  } else if (out.purpose && out.purpose !== 'guardar_veiculo') {
    PURPOSE_TYPES[out.purpose].forEach(addTipo);
  }
  out.types = tipos;

  for (const v of veiculos) {
    const exigida = VEHICLE_REQUIRED_FEATURE[v.vehicle];
    if (exigida) features.add(exigida);
  }
  out.featureKeys = [...features];

  // ---- Resíduo: o que tinha conteúdo e ninguém usou.
  const residual: string[] = [];
  const palavra = /[a-z0-9]+/g;
  let w: RegExpExecArray | null;
  while ((w = palavra.exec(norm)) !== null) {
    if (!s.isFree(w.index, w.index + w[0].length)) continue;
    // Número solto ("2 carros") não é critério que a busca saiba usar.
    if (VAZIAS.has(w[0]) || w[0].length < 2 || /^\d+$/.test(w[0])) continue;
    const original = text.slice(w.index, w.index + w[0].length);
    if (!residual.includes(original)) residual.push(original);
  }

  return { interpretation: out, residual };
}

/** "jardim da penha" → "Jardim da Penha". */
function tituloDeLugar(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((p, i) => (i > 0 && (CONECTORES.has(p.toLowerCase()) || p.toLowerCase() === 'e') ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

const REGIAO: Record<string, string> = {
  central: 'Centro', norte: 'Zona Norte', sul: 'Zona Sul', leste: 'Zona Leste', oeste: 'Zona Oeste', rural: 'Zona Rural',
};

function extrairLocal(text: string, s: Scanner): string | null {
  const norm = s.norm;

  for (const m of s.free(/\b(?:regiao|zona)\s+(central|norte|sul|leste|oeste|rural)\b/)) {
    s.take(m.index, m.index + m[0].length);
    return REGIAO[m[1]!]!;
  }

  const gatilhos = [
    /\b(?:perto|proximo|pertinho|ao lado|do lado|nas proximidades|nos arredores)\s+(?:do|da|de|dos|das|ao|a|aos|as)\s+/,
    /\bbairro\s+(?:do |da |de )?/,
    /\b(?:no|na|nos|nas|em)\s+(?:bairro\s+(?:do |da |de )?|cidade\s+(?:de\s+)?|regiao\s+(?:do|da|de)\s+)?/,
  ];
  for (const re of gatilhos) {
    for (const m of s.free(re)) {
      const inicio = m.index + m[0].length;
      const palavras: { start: number; end: number; w: string }[] = [];
      const palavra = /[a-z0-9]+/g;
      palavra.lastIndex = inicio;
      let w: RegExpExecArray | null;
      let fim = inicio;
      while ((w = palavra.exec(norm)) !== null && palavras.length < 5) {
        // Pontuação ou texto já usado no meio encerra o nome.
        const entre = norm.slice(fim, w.index);
        if (/[,.;!?/]/.test(entre) || !s.isFree(w.index, w.index + w[0].length)) break;
        if (palavras.length === 0 && (NAO_E_LUGAR.has(w[0]) || /^\d/.test(w[0]))) break;
        if (palavras.length > 0 && FIM_DE_LUGAR.has(w[0])) break;
        if (palavras.length === 0 && (FIM_DE_LUGAR.has(w[0]) || CONECTORES.has(w[0]))) break;
        palavras.push({ start: w.index, end: w.index + w[0].length, w: w[0] });
        fim = w.index + w[0].length;
      }
      while (palavras.length > 0 && CONECTORES.has(palavras[palavras.length - 1]!.w)) palavras.pop();
      if (palavras.length === 0) continue;
      const letras = palavras.map((p) => p.w).join('').replace(/[^a-z]/g, '');
      if (letras.length < 3) continue;
      const ini = palavras[0]!.start;
      const fimTrecho = palavras[palavras.length - 1]!.end;
      s.take(m.index, fimTrecho);
      return tituloDeLugar(text.slice(ini, fimTrecho));
    }
  }

  for (const m of s.free(/\bcentro\b/)) {
    s.take(m.index, m.index + m[0].length);
    return 'Centro';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Menções de fatos num texto qualquer (reusado pela guarda da IA de anúncio)
// ---------------------------------------------------------------------------

/** Negação comum em descrição: "não tem câmera", "não possui portão", "sem banheiro". */
const NEGACAO_DESCRICAO = /(?:\bnao (?:tem|possui|ha|conta com|oferece|dispoe de|dispomos de)|\bsem)\s+(?:de\s+|um\s+|uma\s+)?$/;

export type FactMentions = {
  features: { key: NeedFeatureKey; negated: boolean }[];
  unsupported: UnsupportedNeed[];
};

/**
 * Onde o texto fala de cada característica do catálogo (afirmando ou
 * negando) e de cada item que os anúncios não informam. Mesmo vocabulário
 * da busca por necessidade — a guarda de fatos da IA de anúncio
 * (src/lib/listing-ai/guard.ts) usa isto para saber o que uma frase afirma.
 */
export function detectFactMentions(text: string): FactMentions {
  const norm = normalizeSameLength(text);
  const features: FactMentions['features'] = [];
  for (const [re, key] of FEATURES) {
    const g = new RegExp(re.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = g.exec(norm)) !== null) {
      const comecaComSem = m[0].startsWith('sem ');
      const antes = norm.slice(Math.max(0, m.index - 40), m.index);
      features.push({ key, negated: !comecaComSem && (NEGACAO.test(antes) || NEGACAO_DESCRICAO.test(antes)) });
    }
  }
  const unsupported = new Set<UnsupportedNeed>();
  for (const [re, need] of NAO_SUPORTADOS) {
    if (new RegExp(re.source).test(norm)) unsupported.add(need);
  }
  return { features, unsupported: [...unsupported] };
}
