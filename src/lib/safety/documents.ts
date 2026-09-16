/**
 * Validacao de CPF e CNPJ.
 *
 * Modulo puro, sem dependencia de rede ou banco. Serve a dois lugares:
 *   1. Cadastro de recebimento (KYC) — rejeitar documento invalido antes de
 *      mandar para o gateway e receber um erro generico de volta.
 *   2. Detector de dados de contato — CPF e CNPJ sao chaves Pix, entao um
 *      numero valido no meio de uma conversa e sinal de negociacao por fora.
 *
 * A validacao e o digito verificador oficial, nao "tem 11 numeros". Isso
 * elimina quase todo falso positivo: uma sequencia aleatoria de 11 digitos
 * tem ~1 em 100 de chance de passar.
 *
 * O que ela NAO faz: dizer se o documento existe na Receita Federal. Isso
 * exige consulta externa e nao e responsabilidade deste modulo.
 */

/** Deixa so os digitos. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function computeCheckDigit(digits: number[], weights: number[]): number {
  const sum = digits.reduce((acc, d, i) => acc + d * weights[i]!, 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/**
 * Valida CPF pelo digito verificador.
 *
 * Sequencias de digito repetido (000…, 111…) passam na conta mas sao invalidas
 * por definicao — sao o caso mais comum de dado de teste vazando para producao.
 */
export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digits = cpf.split('').map(Number);
  const dv1 = computeCheckDigit(digits.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (dv1 !== digits[9]) return false;

  const dv2 = computeCheckDigit(digits.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return dv2 === digits[10];
}

/** Valida CNPJ pelo digito verificador. */
export function isValidCnpj(value: string): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const digits = cnpj.split('').map(Number);
  const dv1 = computeCheckDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (dv1 !== digits[12]) return false;

  const dv2 = computeCheckDigit(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return dv2 === digits[13];
}

export type DocumentKind = 'cpf' | 'cnpj';

/** Identifica e valida em uma chamada so. Devolve null se nao for valido. */
export function identifyDocument(value: string): DocumentKind | null {
  const digits = onlyDigits(value);
  if (digits.length === 11) return isValidCpf(digits) ? 'cpf' : null;
  if (digits.length === 14) return isValidCnpj(digits) ? 'cnpj' : null;
  return null;
}

/** Formata para exibicao: 12345678901 -> 123.456.789-01 */
export function formatDocument(value: string): string {
  const d = onlyDigits(value);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return value;
}

/**
 * Mascara para log e suporte: 123.456.789-01 -> ***.456.789-**
 *
 * CPF e dado pessoal sob a LGPD. Ele nunca deve aparecer inteiro em log, tela
 * de suporte ou mensagem de erro — so o suficiente para a pessoa reconhecer
 * qual documento e o dela.
 */
export function maskDocument(value: string): string {
  const d = onlyDigits(value);
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return `**.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-**`;
  return '***';
}

/** DDDs em uso no Brasil. Usado para nao tratar qualquer numero como telefone. */
export const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/**
 * Reconhece telefone brasileiro a partir dos digitos.
 * - 11 digitos: DDD + 9 + 8 digitos (celular atual)
 * - 10 digitos: DDD + 8 digitos (fixo, ou celular no formato antigo)
 * Aceita o prefixo 55 do pais.
 */
export function isBrazilianPhone(digits: string): boolean {
  let d = onlyDigits(digits);
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return false;

  const ddd = Number(d.slice(0, 2));
  if (!DDDS_VALIDOS.has(ddd)) return false;

  if (d.length === 11) return d[2] === '9';
  // Fixo comeca com 2-5; celular antigo comeca com 6-9.
  return /^[2-9]/.test(d[2]!);
}
