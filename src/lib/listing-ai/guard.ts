import { detectFactMentions, normalizeSameLength } from '@/lib/search/need/rules';
import type { ListingSuggestionContent } from '@/db/schema';
import { TITLE_MAX, DESCRIPTION_MAX } from '@/lib/spaces/schemas';
import { MISSING_FIELDS, type ListingAiOutput, type MissingField } from './schema';

/**
 * Guarda de fatos da IA de anúncio (Fase 23) — módulo puro.
 *
 * A regra do pedido é absoluta: a IA não pode inventar metragem, segurança,
 * câmera, portão, banheiro, internet, cobertura, localização,
 * acessibilidade, características, regras, preço nem disponibilidade. O
 * prompt diz isso, mas prompt não é garantia — por isso cada FRASE sugerida
 * é conferida aqui contra o que o anúncio de fato informa (o que foi
 * marcado e o que o próprio proprietário escreveu). Frase que afirma algo
 * sem base sai inteira, e fica registrada em `removed` para auditoria.
 *
 * É conservadora de propósito: na dúvida, tira. Perder uma frase bonita é
 * barato; publicar "espaço monitorado por câmeras" num lugar sem câmera, não.
 */

export type ListingFacts = {
  /** Características marcadas no anúncio (chaves do catálogo). */
  featureKeys: string[];
  featureLabels: Map<string, string>;
  sizeM2: number | null;
  ceilingHeightM: number | null;
  photoCount: number;
  /** Tudo o que o PROPRIETÁRIO escreveu: título, descrição, regras, itens, horário. */
  ownerText: string;
  district: string | null;
  city: string | null;
};

export const RECOMMENDED_PHOTOS = 5;

const MESES = 'janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro';

const RE = {
  area: /(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:m2|m 2|mts2|metros? quadrados?)(?![a-z0-9])/g,
  altura: /(?:pe[ -]direito|altura)\s*(?:de\s*)?(\d{1,2}(?:[.,]\d{1,2})?)\s*m(?![a-z0-9])|(\d{1,2}(?:[.,]\d{1,2})?)\s*m(?:etros)?\s+de\s+altura/g,
  dinheiro: /r\$|\breais\b|\breal\b|\b\d+\s*mil\b|\bvalor\b|\bpreco\b|\bbarat[oa]s?\b|\bem conta\b/,
  disponibilidade: new RegExp(
    String.raw`\b(?:imediat[oa]s?|imediatamente|pronta entrega|pronto para uso|ja disponivel|disponivel (?:a partir|desde|imediatamente|agora|hoje|ja)|a partir de (?:\d|${MESES}|hoje|amanha)|livre (?:a partir|desde))\b|\b\d{1,2}/\d{1,2}\b|\b(?:${MESES})\b`,
  ),
  proximidade:
    /\b(?:perto|proxim[oa]s?|pertinho|ao lado|em frente|esquina|a (?:\d+|poucos|poucas) (?:metros|minutos|quadras|km|quilometros)|facil acesso|localizacao privilegiada|bem localizad[oa]|regiao nobre|bairro nobre|avenida|rodovia|br-?\d+|metro|estacao|shopping|supermercado|mercado|universidade|faculdade|hospital|escola|rodoviaria|aeroporto|praia|centro da cidade|comercio local)\b/g,
  seguranca: /\b(?:segur[oa]s?|seguranca|protegid[oa]s?(?! d[oa]s? (?:chuva|sol|tempo|umidade))|vigiad[oa]s?|monitorad[oa]s?|tranquil[oa]s?|sem risco|confiave(?:l|is))\b/,
  regra: /\b(?:proibid[oa]s?|permitid[oa]s?|nao (?:e|sao) permitid[oa]s?|nao permit\w*|nao aceit\w*|vedad[oa]s?|obrigatori[oa]s?)\b/g,
  horario: /\b(?:das|de|a partir das|ate as)\s*(\d{1,2})\s*(?:h|:\d{2}|horas)\b/g,
};

const SEGURANCA_MARCADA = ['camera', 'alarme', 'portaria'];
const VAZIAS_REGRA = new Set(['para', 'pelo', 'pela', 'sobre', 'entre', 'dentro', 'local', 'espaco', 'area', 'todo', 'toda', 'qualquer', 'nenhum', 'nenhuma', 'deste', 'desta', 'neste', 'nesta']);

type Contexto = {
  facts: ListingFacts;
  donoNorm: string;
  donoPositivas: Set<string>;
  donoNegativas: Set<string>;
  donoNaoSuportados: Set<string>;
  lugaresNorm: string[];
};

function contexto(facts: ListingFacts): Contexto {
  const dono = detectFactMentions(facts.ownerText);
  return {
    facts,
    donoNorm: normalizeSameLength(facts.ownerText),
    donoPositivas: new Set(dono.features.filter((f) => !f.negated).map((f) => f.key)),
    donoNegativas: new Set(dono.features.filter((f) => f.negated).map((f) => f.key)),
    donoNaoSuportados: new Set(dono.unsupported),
    lugaresNorm: [facts.district, facts.city].filter(Boolean).map((l) => normalizeSameLength(l!).trim()),
  };
}

function numero(v: string): number {
  return Number(v.replace(',', '.'));
}

/** Por que esta frase afirma algo sem base. Vazio = pode ficar. */
export function unsupportedClaims(frase: string, ctx: Contexto): string[] {
  const motivos: string[] = [];
  const norm = normalizeSameLength(frase);
  const { facts } = ctx;

  const mencoes = detectFactMentions(frase);
  for (const m of mencoes.features) {
    const nome = (facts.featureLabels.get(m.key) ?? m.key).toLowerCase();
    if (!m.negated && !facts.featureKeys.includes(m.key) && !ctx.donoPositivas.has(m.key)) {
      motivos.push(`afirma "${nome}" sem o anúncio informar`);
    }
    if (m.negated && !ctx.donoNegativas.has(m.key)) {
      motivos.push(`afirma que não há "${nome}" sem o anúncio dizer isso`);
    }
  }
  for (const n of mencoes.unsupported) {
    if (!ctx.donoNaoSuportados.has(n)) motivos.push(`fala de ${n.replace('_', '-')} sem o anúncio informar`);
  }

  for (const m of norm.matchAll(RE.area)) {
    const v = numero(m[1]!);
    const bate = facts.sizeM2 != null && Math.abs(v - facts.sizeM2) < 0.51;
    if (!bate && !ctx.donoNorm.includes(m[1]!)) motivos.push(`cita ${m[1]} m² diferente do anúncio`);
  }
  for (const m of norm.matchAll(RE.altura)) {
    const bruto = m[1] ?? m[2]!;
    const v = numero(bruto);
    const bate = facts.ceilingHeightM != null && Math.abs(v - facts.ceilingHeightM) < 0.051;
    if (!bate && !ctx.donoNorm.includes(bruto)) motivos.push(`cita altura de ${bruto} m sem o anúncio informar`);
  }
  if (RE.dinheiro.test(norm)) motivos.push('fala de preço ou valor');

  const disp = RE.disponibilidade.exec(norm);
  if (disp && !ctx.donoNorm.includes(disp[0])) motivos.push(`afirma disponibilidade ("${disp[0]}")`);

  for (const m of norm.matchAll(RE.proximidade)) {
    const eOLugar = (s: string) => ctx.lugaresNorm.some((l) => l && (s.includes(l) || l.includes(s)));
    if (eOLugar(m[0])) continue;
    if (!ctx.donoNorm.includes(m[0])) {
      motivos.push(`afirma localização ("${m[0]}") sem o anúncio dizer`);
      continue;
    }
    // O dono falou "perto" — mas perto DE QUÊ? O que vem depois também
    // precisa estar no que ele escreveu (ou ser o bairro/cidade do anúncio).
    const depois = norm.slice(m.index + m[0].length).split(/[.!?;,]/)[0] ?? '';
    const alvo = (depois.match(/[a-z0-9]{4,}/g) ?? []).slice(0, 3);
    const semBase = alvo.filter((w) => !ctx.donoNorm.includes(w) && !eOLugar(w));
    if (semBase.length > 0) motivos.push(`afirma localização ("${m[0]} ${semBase.join(' ')}") sem o anúncio dizer`);
  }

  // Nome de lugar ("no Jardim da Penha", "em Vila Velha"): só o bairro e a
  // cidade do anúncio, ou o que o próprio dono escreveu.
  const LUGAR = /\b(?:no|na|em|bairro)\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ]+(?:\s+(?:d[aeo]s?\s+)?[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ÿ]+)*)/g;
  for (const m of frase.matchAll(LUGAR)) {
    const nome = normalizeSameLength(m[1]!).trim();
    const conhecido = ctx.lugaresNorm.some((l) => l && (l === nome || l.includes(nome) || nome.includes(l)))
      || ctx.donoNorm.includes(nome);
    if (!conhecido) motivos.push(`cita um lugar ("${m[1]}") que não é o do anúncio`);
  }

  if (RE.seguranca.test(norm)) {
    const marcada = facts.featureKeys.some((k) => SEGURANCA_MARCADA.includes(k));
    const disse = /\b(?:segur|vigi|monitor|camera|alarme|portaria|porteiro)/.test(ctx.donoNorm);
    if (!marcada && !disse) motivos.push('afirma segurança sem o anúncio informar');
  }

  for (const m of norm.matchAll(RE.regra)) {
    const depois = norm.slice(m.index + m[0].length).split(/[.!?;]/)[0] ?? '';
    const palavras = (depois.match(/[a-z]{4,}/g) ?? []).filter((w) => !VAZIAS_REGRA.has(w)).slice(0, 4);
    const apoiada = palavras.some((w) => ctx.donoNorm.includes(w));
    if (!apoiada) motivos.push(`cria uma regra ("${m[0]}${depois.slice(0, 30)}") que o anúncio não tem`);
  }

  for (const m of norm.matchAll(RE.horario)) {
    if (!new RegExp(`\\b${m[1]}\\s*(?:h|:|horas)`).test(ctx.donoNorm)) motivos.push(`cita horário (${m[1]} h) sem o anúncio informar`);
  }

  return [...new Set(motivos)];
}

function frases(paragrafo: string): string[] {
  return paragrafo.split(/(?<=[.!?…])\s+/).map((f) => f.trim()).filter(Boolean);
}

/**
 * Aplica a guarda em toda a sugestão. Devolve só o que pode ser mostrado
 * ao proprietário, e a lista do que foi tirado (com o motivo).
 */
export function guardListingSuggestion(
  raw: ListingAiOutput,
  facts: ListingFacts,
  atual: { title: string; description: string },
): { content: ListingSuggestionContent; removed: string[] } {
  const ctx = contexto(facts);
  const removed: string[] = [];

  // Título: qualquer afirmação sem base derruba o título inteiro.
  let title: string | null = raw.titulo?.replace(/\s+/g, ' ').trim() ?? null;
  if (title) {
    const motivos = unsupportedClaims(title, ctx);
    if (motivos.length > 0) {
      removed.push(`Título "${title}": ${motivos.join('; ')}`);
      title = null;
    } else if (title.length < 10 || title.length > TITLE_MAX) {
      removed.push(`Título "${title}": fora do tamanho permitido (10 a ${TITLE_MAX} caracteres)`);
      title = null;
    } else if (title === atual.title.trim()) {
      title = null;
    }
  }

  // Descrição: frase por frase, mantendo os parágrafos.
  let description: string | null = null;
  if (raw.descricao?.trim()) {
    const paragrafos = raw.descricao.replace(/\r/g, '').split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean);
    const mantidos: string[] = [];
    for (const p of paragrafos) {
      const ok: string[] = [];
      for (const f of frases(p)) {
        const motivos = unsupportedClaims(f, ctx);
        if (motivos.length > 0) removed.push(`"${f}": ${motivos.join('; ')}`);
        else ok.push(f);
      }
      if (ok.length > 0) mantidos.push(ok.join(' '));
    }
    const texto = mantidos.join('\n\n').trim();
    if (texto.length >= 20 && texto.length <= DESCRIPTION_MAX && texto !== atual.description.trim()) description = texto;
    else if (texto.length > DESCRIPTION_MAX) removed.push('Descrição: passou do tamanho máximo do anúncio');
  }

  // O que falta: só o que realmente falta, sem valor, no máximo 6.
  const jaTem: Partial<Record<MissingField, boolean>> = {
    metragem: facts.sizeM2 != null,
    altura: facts.ceilingHeightM != null,
    fotos: facts.photoCount >= RECOMMENDED_PHOTOS,
  };
  const vistos = new Set<string>();
  const missingInfo = raw.faltando
    .filter((f) => (MISSING_FIELDS as readonly string[]).includes(f.campo) && !jaTem[f.campo])
    .map((f) => ({ field: f.campo, text: f.texto.replace(/\s+/g, ' ').trim().slice(0, 200) }))
    .filter((f) => f.text.length > 0 && !RE.dinheiro.test(normalizeSameLength(f.text)))
    .filter((f) => {
      const chave = `${f.field}:${f.text}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    })
    .slice(0, 6);

  // Dicas: sem afirmação sem base, curtas, no máximo 4.
  const tips = raw.dicas
    .map((d) => d.replace(/\s+/g, ' ').trim())
    .filter((d) => d.length > 0 && d.length <= 200)
    .filter((d) => {
      const motivos = unsupportedClaims(d, ctx);
      if (motivos.length > 0) removed.push(`Dica "${d}": ${motivos.join('; ')}`);
      return motivos.length === 0;
    })
    .slice(0, 4);

  return { content: { title, description, missingInfo, tips }, removed };
}
