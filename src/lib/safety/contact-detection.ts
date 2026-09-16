import { isValidCpf, isValidCnpj, isBrazilianPhone, onlyDigits } from './documents';

/**
 * Detector de dados de contato em mensagens.
 *
 * POR QUE ISTO EXISTE
 *
 * O golpe mais comum em marketplace de aluguel entre pessoas segue sempre o
 * mesmo roteiro: o anunciante puxa a conversa para o WhatsApp, pede um Pix de
 * "sinal" e some. Fora da plataforma nao existe comprovante, mediacao,
 * historico nem reembolso — e a vitima nao tem a quem recorrer.
 *
 * Detectar a troca de contato serve a duas coisas ao mesmo tempo: proteger
 * quem esta prestes a cair no golpe, e sustentar a plataforma como o lugar
 * onde a transacao acontece.
 *
 * O QUE ELE FAZ E O QUE NAO FAZ
 *
 * Ele SINALIZA. Nao bloqueia o envio, nem censura a mensagem. Bloquear
 * quebraria conversa legitima ("meu galpao fica na rua 27, numero 1500") e
 * empurraria as pessoas para ofuscacao cada vez mais criativa, o que piora a
 * deteccao. Sinalizar permite avisar quem esta conversando e alimentar a fila
 * de moderacao sem impedir ninguem de se comunicar.
 *
 * LIMITACAO CONHECIDA E DECLARADA
 *
 * Nao detecta numero escrito por extenso ("nove nove sete tres..."), nem
 * combinacao por imagem, nem codigo combinado entre as partes. Quem quiser
 * contornar, contorna. O objetivo e cobrir o caso comum e criar atrito no
 * caminho do golpe — nao prometer barreira intransponivel.
 */

export type ContactKind =
  | 'telefone'
  | 'email'
  | 'cpf'
  | 'cnpj'
  | 'chave_pix'
  | 'rede_social'
  | 'link'
  | 'mencao_pagamento_externo';

export type ContactMatch = {
  kind: ContactKind;
  /** Trecho que disparou a deteccao. Vai para moderacao, nunca para a outra parte. */
  excerpt: string;
  confidence: 'alta' | 'media';
};

export type DetectionResult = {
  matches: ContactMatch[];
  /** Tipos encontrados, sem repeticao — o que vai para messages.flag_reason. */
  kinds: ContactKind[];
  /** true quando ha ao menos uma deteccao de alta confianca. */
  shouldWarn: boolean;
};

/** Remove acentos para que "está" e "esta" sejam a mesma coisa nos padroes. */
function stripDiacritics(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Desfaz as ofuscacoes comuns de e-mail antes de procurar o padrao.
 * "joao (arroba) gmail ponto com" vira "joao@gmail.com".
 */
function deobfuscateEmail(text: string): string {
  return text
    .replace(/\s*[[({<]?\s*(arroba|at)\s*[\])}>]?\s*/gi, '@')
    .replace(/\s*[[({<]\s*@\s*[\])}>]\s*/g, '@')
    .replace(/\s*[[({<]?\s*(ponto|dot)\s*[\])}>]?\s*/gi, '.')
    .replace(/\s*[[({<]\s*\.\s*[\])}>]\s*/g, '.');
}

/**
 * Encontra sequencias de digitos que podem estar separadas por espaco, ponto,
 * hifen, barra, parenteses ou "+".
 *
 * A VIRGULA NAO entra na lista de proposito: em portugues ela e separador
 * decimal, e incluir faria "R$ 1.234,56" virar a sequencia "123456".
 */
function digitRuns(text: string): { digits: string; excerpt: string }[] {
  const runs: { digits: string; excerpt: string }[] = [];
  const pattern = /(?:\+?\d[\s.\-()/]{0,2}){7,}\d/g;

  for (const match of text.matchAll(pattern)) {
    const excerpt = match[0].trim();
    const digits = onlyDigits(excerpt);
    if (digits.length >= 8) runs.push({ digits, excerpt });
  }
  return runs;
}

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const URL = /\b(?:https?:\/\/|www\.)[^\s<>"']{3,}/gi;

const REDES = [
  { re: /\b(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\/\S*/gi, conf: 'alta' as const },
  { re: /\b(?:instagram\.com|t\.me|telegram\.me|facebook\.com|fb\.me)\/\S*/gi, conf: 'alta' as const },
  { re: /(?:^|[^\w@/])@([a-z0-9._]{3,30})\b/gi, conf: 'media' as const },
  { re: /\b(?:whats?app|whats|zap|zapzap|telegram|insta|instagram)\b/gi, conf: 'media' as const },
];

/**
 * Mencao a pagamento fora da plataforma.
 *
 * Aqui esta o sinal mais valioso do detector: mesmo sem numero nenhum,
 * "me manda um pix de sinal" ja e o golpe em andamento.
 *
 * Reparar que NAO ha um padrao para a palavra "pix" sozinha. O Pix e o meio
 * de pagamento principal DENTRO da plataforma — "posso pagar por Pix?" e uma
 * pergunta legitima e frequente. Sinalizar toda mencao encheria a fila de
 * moderacao de ruido e treinaria o time a ignorar o alerta.
 *
 * O que interessa e o Pix DIRETO: pedido de envio, chave, ou adiantamento.
 */
const PAGAMENTO_EXTERNO = [
  /\b(?:me\s+)?(?:manda|mande|envia|envie|faz|faca|passa|passe|transfere)\s+(?:um\s+|o\s+)?pix\b/gi,
  /\bpix\s+(?:adiantado|antecipado|direto|por\s+fora|de\s+sinal|do\s+sinal|na\s+m[aã]o)/gi,
  /\b(?:minha|meu|a)\s+chave\s+(?:do\s+)?pix\b/gi,
  /\bchave\s+pix\b/gi,
  /\b(?:transfer[eê]ncia|dep[oó]sito)\s+(?:banc[aá]ri[ao]|direto|por\s+fora)/gi,
  /\b(?:por|em)\s+dinheiro\s+(?:vivo|na\s+m[aã]o)/gi,
  /\bfora\s+d[ao]\s+(?:app|aplicativo|plataforma|site)/gi,
  /\b(?:sem|evitar|pular|fugir\s+d[ae])\s+(?:a\s+)?taxa\b/gi,
  /\b(?:combina|combinamos|acertamos|resolve)\s+(?:por\s+)?fora\b/gi,
];

/** Palavra solta que so vira sinal quando acompanhada de uma forma de contato. */
const PIX_SOLTO = /\bpix\b/i;

/** Chave Pix aleatoria: UUID v4, com ou sem hifens. */
const CHAVE_ALEATORIA = /\b[0-9a-f]{8}-?[0-9a-f]{4}-?4[0-9a-f]{3}-?[89ab][0-9a-f]{3}-?[0-9a-f]{12}\b/gi;

function push(
  out: ContactMatch[],
  kind: ContactKind,
  excerpt: string,
  confidence: 'alta' | 'media',
) {
  const trimmed = excerpt.trim().slice(0, 120);
  if (!trimmed) return;
  // Uma mesma coisa detectada por dois padroes nao vira duas ocorrencias.
  if (out.some((m) => m.kind === kind && m.excerpt === trimmed)) return;
  out.push({ kind, excerpt: trimmed, confidence });
}

/**
 * Analisa um texto e devolve o que encontrou.
 * Funcao pura: mesma entrada, mesma saida, sem efeito colateral.
 */
export function detectContactInfo(text: string): DetectionResult {
  const matches: ContactMatch[] = [];

  if (typeof text !== 'string' || text.trim() === '') {
    return { matches: [], kinds: [], shouldWarn: false };
  }

  const normalized = stripDiacritics(text);
  const deobfuscated = deobfuscateEmail(normalized);

  // --- E-mail (inclusive ofuscado) ---
  for (const m of deobfuscated.matchAll(EMAIL)) {
    push(matches, 'email', m[0], 'alta');
  }

  // --- Chave Pix aleatoria ---
  for (const m of normalized.matchAll(CHAVE_ALEATORIA)) {
    push(matches, 'chave_pix', m[0], 'alta');
  }

  // --- Redes sociais e mensageiros ---
  for (const { re, conf } of REDES) {
    for (const m of normalized.matchAll(re)) {
      push(matches, 'rede_social', m[0], conf);
    }
  }

  // --- Links ---
  for (const m of normalized.matchAll(URL)) {
    // Link de rede social ja foi contado acima.
    if (!/wa\.me|whatsapp|instagram|t\.me|telegram|facebook|fb\.me/i.test(m[0])) {
      push(matches, 'link', m[0], 'media');
    }
  }

  // --- Mencao a pagamento por fora ---
  for (const re of PAGAMENTO_EXTERNO) {
    for (const m of normalized.matchAll(re)) {
      push(matches, 'mencao_pagamento_externo', m[0], 'media');
    }
  }

  // --- Numeros: telefone, CPF, CNPJ ---
  for (const { digits, excerpt } of digitRuns(normalized)) {
    // O digito verificador e o que separa documento de sequencia qualquer.
    if (digits.length === 11 && isValidCpf(digits)) {
      push(matches, 'cpf', excerpt, 'alta');
      continue;
    }
    if (digits.length === 14 && isValidCnpj(digits)) {
      push(matches, 'cnpj', excerpt, 'alta');
      continue;
    }
    if (isBrazilianPhone(digits)) {
      // 11 digitos com DDD valido e 9 na frente dificilmente e outra coisa.
      const confidence = onlyDigits(digits).replace(/^55/, '').length === 11 ? 'alta' : 'media';
      push(matches, 'telefone', excerpt, confidence);
    }
  }

  /*
   * "Pix" sozinho nao diz nada. "Pix" junto de um telefone, e-mail, CPF ou
   * chave e outra conversa: e a combinacao exata do golpe — a pessoa manda
   * a forma de contato e a forma de pagar na mesma mensagem.
   */
  const temFormaDeContato = matches.some((m) =>
    ['telefone', 'email', 'cpf', 'cnpj', 'chave_pix'].includes(m.kind),
  );
  if (temFormaDeContato && PIX_SOLTO.test(normalized)) {
    push(matches, 'mencao_pagamento_externo', 'pix + forma de contato', 'alta');
  }

  const kinds = [...new Set(matches.map((m) => m.kind))];
  return {
    matches,
    kinds,
    shouldWarn: matches.some((m) => m.confidence === 'alta'),
  };
}

/** Valor para `messages.flag_reason`. Guarda os TIPOS, nunca o dado em si. */
export function buildFlagReason(result: DetectionResult): string | null {
  if (result.matches.length === 0) return null;
  return `contato:${result.kinds.join(',')}`;
}

/** Aviso mostrado a quem esta conversando. */
export function contactWarningMessage(result: DetectionResult): string | null {
  if (!result.shouldWarn) return null;

  const temPagamento =
    result.kinds.includes('chave_pix') ||
    result.kinds.includes('cpf') ||
    result.kinds.includes('mencao_pagamento_externo');

  if (temPagamento) {
    return (
      'Atenção: pagamentos feitos fora da MyPlace não têm comprovante, mediação ' +
      'nem reembolso. Pedido de Pix antecipado é o golpe mais comum neste tipo de ' +
      'anúncio. Mantenha o pagamento pela plataforma.'
    );
  }

  return (
    'Trocar telefone ou e-mail antes de fechar a reserva tira você da proteção da ' +
    'plataforma: sem histórico da conversa, não há como mediar um problema depois.'
  );
}
