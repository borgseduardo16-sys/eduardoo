import { formatBRL } from '@/lib/money';

/*
 * ÚNICO lugar com o link de compra. Todo botão de compra da página lê
 * `checkoutHref` daqui — para trocar o link, edite só esta constante.
 */
export const CHECKOUT_URL: string = 'https://pay.kiwify.com.br/xcctuGk';

/** Placeholder ainda não substituído (ou vazio) → o botão rola até a oferta em vez de abrir um link quebrado. */
const PLACEHOLDER = 'COLE_AQUI_SEU_LINK_DA_KIWIFY';
export const checkoutHref: string =
  CHECKOUT_URL && CHECKOUT_URL !== PLACEHOLDER && /^https?:\/\//.test(CHECKOUT_URL)
    ? CHECKOUT_URL
    : '#oferta';

export const PRODUTO = 'WhatsApp Business Profissional';

/** Dinheiro é inteiro em centavos; o texto sai de src/lib/money.ts. */
export const PRECO_CENTAVOS = 2990;
export const PRECO_TEXTO = formatBRL(PRECO_CENTAVOS);
