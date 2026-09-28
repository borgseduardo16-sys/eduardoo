/**
 * Telefone: normalização e máscara — módulo puro (servidor e cliente).
 *
 * Nesta fase só celular brasileiro: DDD de dois dígitos (1–9 em cada) +
 * número de 9 dígitos começando com 9. É o que recebe SMS no Brasil; fixo
 * não recebe, e número estrangeiro exigiria outra política de custo e
 * fraude no provedor.
 */

/** "(27) 99999-8888", "27999998888", "+55 27 99999-8888" → "+5527999998888". Inválido → null. */
export function normalizeBrazilianMobile(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let digitos = input.replace(/\D/g, '');
  if (digitos.length === 13 && digitos.startsWith('55')) digitos = digitos.slice(2);
  if (digitos.length !== 11) return null;
  if (!/^[1-9]{2}9\d{8}$/.test(digitos)) return null;
  return `+55${digitos}`;
}

/**
 * "+5527999998888" → "(27) •••••-8888". Na tela da própria pessoa, para ela
 * reconhecer qual número está em jogo sem o número inteiro ficar exposto em
 * print, histórico ou por cima do ombro.
 */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  const d = e164.replace(/\D/g, '');
  const nacional = d.startsWith('55') && d.length === 13 ? d.slice(2) : d;
  if (nacional.length < 6) return '•••';
  return `(${nacional.slice(0, 2)}) •••••-${nacional.slice(-4)}`;
}
