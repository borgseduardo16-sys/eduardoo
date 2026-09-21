/**
 * Classificador de presenca digital.
 *
 * Regra central do produto: uma empresa so vira lead se NAO tiver nenhuma
 * presenca que cumpra a funcao de um site (site proprio, cardapio digital,
 * catalogo, agendamento, loja virtual...). Rede social e canal de contato
 * (WhatsApp, Instagram, Facebook, TikTok, YouTube, Telegram) NUNCA descarta
 * sozinho — ver os exemplos no pedido original do produto.
 *
 * A unica informacao disponivel para essa analise e o campo "website" que o
 * proprio Google Places devolve no perfil da empresa (o mesmo link que
 * aparece no botao "Site" da ficha do Google Maps/Google Business Profile).
 * Nao ha chamada nenhuma que "adivinhe" Instagram/WhatsApp fora desse campo —
 * quando a Places API nao devolve um valor, o dado e "Nao encontrado", nunca
 * inventado (ver regra de confiabilidade do produto).
 */

export type WebsiteClassification =
  | 'none'
  | 'own_site'
  | 'builder_page'
  | 'menu'
  | 'catalog'
  | 'scheduling'
  | 'ecommerce'
  | 'link_in_bio'
  | 'whatsapp'
  | 'instagram'
  | 'facebook'
  | 'social_other'
  | 'unknown';

export type DiscardBucket = 'site' | 'menu' | 'catalog' | 'scheduling' | 'other';

export type ClassificationResult = {
  classification: WebsiteClassification;
  /** true = essa presenca substitui um site, o lead deve ser descartado. */
  isFunctionalSite: boolean;
  /** true = nao ha evidencia suficiente para decidir com seguranca. */
  isAmbiguous: boolean;
  /** Explicacao curta em portugues, pronta para mostrar na tela. */
  detailPt: string;
  /** Qual contador do dashboard essa classificacao alimenta, se descartar. */
  discardBucket: DiscardBucket | null;
  /** Link extraido, quando o proprio campo "website" era uma rede social. */
  extracted?: { whatsapp?: string; instagram?: string; facebook?: string };
};

const SOCIAL_HOSTS: Record<string, 'whatsapp' | 'instagram' | 'facebook' | 'social_other'> = {
  'wa.me': 'whatsapp',
  'api.whatsapp.com': 'whatsapp',
  'chat.whatsapp.com': 'whatsapp',
  'web.whatsapp.com': 'whatsapp',
  'instagram.com': 'instagram',
  'instagr.am': 'instagram',
  'facebook.com': 'facebook',
  'fb.com': 'facebook',
  'fb.me': 'facebook',
  'm.facebook.com': 'facebook',
  'tiktok.com': 'social_other',
  'youtube.com': 'social_other',
  'youtu.be': 'social_other',
  't.me': 'social_other',
  'telegram.me': 'social_other',
  'twitter.com': 'social_other',
  'x.com': 'social_other',
  'linkedin.com': 'social_other',
  'threads.net': 'social_other',
};

/** Agregadores de "link na bio" — podem so listar redes sociais, ou podem
 * incluir cardapio/catalogo. Sem abrir o link nao ha como saber com certeza. */
const LINK_IN_BIO_HOSTS = [
  'linktr.ee',
  'beacons.ai',
  'bio.link',
  'allmylinks.com',
  'lit.link',
  'campsite.bio',
  'milkshake.app',
  'shorby.com',
  'snipfeed.co',
  'linkin.bio',
  'msha.ke',
];

/** Construtor de site "gratuito" do proprio Google Business Profile. */
const GOOGLE_BUSINESS_SITE_HOSTS = ['business.site'];

/** Construtores de site genericos — a pagina resultante FUNCIONA como site
 * proprio da empresa (landing page), mesmo hospedada em subdominio de terceiro. */
const BUILDER_HOST_SUFFIXES = [
  'wixsite.com',
  'godaddysites.com',
  'sites.google.com',
  'weebly.com',
  'webnode.com',
  'webnode.com.br',
  'jimdosite.com',
  'strikingly.com',
  'carrd.co',
  'site123.me',
  'yolasite.com',
  'wordpress.com',
  'tilda.ws',
  'webflow.io',
  'canva.site',
  'super.site',
  'notion.site',
];

const MENU_HOST_SUFFIXES = [
  'goomer.app',
  'goomer.com.br',
  'cardapioweb.com',
  'anota.ai',
  'cardapio.io',
  'meucardapio.ai',
  'cardapiodigital.io',
  'fidelizi.com.br',
  'ifood.com.br',
  'ubereats.com',
  'rappi.com.br',
  'aiqfome.com',
  '99food.com.br',
];

const SCHEDULING_HOST_SUFFIXES = [
  'trinks.com',
  'booksy.com',
  'fresha.com',
  'simplesagenda.com.br',
  'boaconsulta.com',
  'doctoralia.com.br',
  'setmore.com',
  'appointlet.com',
  'acuityscheduling.com',
  'calendly.com',
  'timify.com',
  'agendaonline.com.br',
  'clinicorp.com',
];

const ECOMMERCE_HOST_SUFFIXES = [
  'nuvemshop.com.br',
  'nuvemshop.com',
  'lojaintegrada.com.br',
  'tray.com.br',
  'vtex.com',
  'myvtex.com',
  'myshopify.com',
  'shopify.com',
  'magazord.com.br',
  'lojavirtualnuvem.com.br',
  'wake.tech',
  'mercadoshops.com.br',
  'elo7.com.br',
];

/** Palavras fortes no proprio host/caminho de um dominio nao catalogado —
 * usadas so para escolher o MOTIVO do descarte, nunca para decidir se
 * descarta (dominio proprio ja descarta por si so, ver `own_site`). */
const KEYWORD_HINTS: Array<{ bucket: DiscardBucket; words: string[] }> = [
  { bucket: 'menu', words: ['cardapio', 'cardápio', 'menu', 'delivery'] },
  { bucket: 'catalog', words: ['catalogo', 'catálogo', 'produtos', 'loja', 'shop', 'store'] },
  { bucket: 'scheduling', words: ['agendamento', 'agenda', 'booking', 'marcarhorario', 'reserva'] },
];

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

function matchesSuffix(host: string, suffixes: string[]): string | null {
  return suffixes.find((s) => host === s || host.endsWith(`.${s}`)) ?? null;
}

function keywordHint(haystack: string): DiscardBucket | null {
  const normalized = haystack.toLowerCase();
  for (const { bucket, words } of KEYWORD_HINTS) {
    if (words.some((w) => normalized.includes(w))) return bucket;
  }
  return null;
}

/**
 * Classifica o campo "website" devolvido pelo Google Places para uma empresa.
 *
 * `websiteRaw` deve ser exatamente o que a API devolveu (`null`/`undefined`
 * quando o campo nao existe) — nunca um valor construido aqui.
 */
export function classifyWebsite(websiteRaw: string | null | undefined): ClassificationResult {
  const raw = websiteRaw?.trim();
  if (!raw) {
    return {
      classification: 'none',
      isFunctionalSite: false,
      isAmbiguous: false,
      detailPt: 'Nenhum link de site foi informado no perfil do Google.',
      discardBucket: null,
    };
  }

  let url: URL;
  try {
    url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return {
      classification: 'unknown',
      isFunctionalSite: false,
      isAmbiguous: true,
      detailPt: `O link informado ("${raw}") nao pode ser interpretado com segurança.`,
      discardBucket: null,
    };
  }

  const host = normalizeHost(url.hostname);
  const fullUrl = url.toString();

  const social = SOCIAL_HOSTS[host];
  if (social) {
    const label =
      social === 'whatsapp'
        ? 'WhatsApp'
        : social === 'instagram'
          ? 'Instagram'
          : social === 'facebook'
            ? 'Facebook'
            : 'uma rede social';
    return {
      classification: social,
      isFunctionalSite: false,
      isAmbiguous: false,
      detailPt: `O link informado no perfil do Google é ${label}, não um site próprio.`,
      discardBucket: null,
      extracted:
        social === 'whatsapp'
          ? { whatsapp: fullUrl }
          : social === 'instagram'
            ? { instagram: fullUrl }
            : social === 'facebook'
              ? { facebook: fullUrl }
              : undefined,
    };
  }

  if (LINK_IN_BIO_HOSTS.includes(host)) {
    return {
      classification: 'link_in_bio',
      isFunctionalSite: false,
      isAmbiguous: true,
      detailPt:
        'O link é uma página agregadora de links ("link na bio"). Pode listar só redes sociais ou também um cardápio/catálogo — verificação recomendada.',
      discardBucket: null,
    };
  }

  if (matchesSuffix(host, GOOGLE_BUSINESS_SITE_HOSTS)) {
    return {
      classification: 'builder_page',
      isFunctionalSite: true,
      isAmbiguous: false,
      detailPt: 'A empresa já tem um site gratuito gerado pelo próprio Google Business Profile.',
      discardBucket: 'site',
    };
  }

  const schedulingHit = matchesSuffix(host, SCHEDULING_HOST_SUFFIXES);
  if (schedulingHit) {
    return {
      classification: 'scheduling',
      isFunctionalSite: true,
      isAmbiguous: false,
      detailPt: `Foi identificada uma página própria de agendamento (${schedulingHit}).`,
      discardBucket: 'scheduling',
    };
  }

  const menuHit = matchesSuffix(host, MENU_HOST_SUFFIXES);
  if (menuHit) {
    return {
      classification: 'menu',
      isFunctionalSite: true,
      isAmbiguous: false,
      detailPt: `Foi identificada uma página de cardápio digital (${menuHit}).`,
      discardBucket: 'menu',
    };
  }

  const ecommerceHit = matchesSuffix(host, ECOMMERCE_HOST_SUFFIXES);
  if (ecommerceHit) {
    return {
      classification: 'ecommerce',
      isFunctionalSite: true,
      isAmbiguous: false,
      detailPt: `Foi identificada uma loja virtual própria (${ecommerceHit}).`,
      discardBucket: 'catalog',
    };
  }

  const builderHit = matchesSuffix(host, BUILDER_HOST_SUFFIXES);
  if (builderHit) {
    return {
      classification: 'builder_page',
      isFunctionalSite: true,
      isAmbiguous: false,
      detailPt: `Foi identificada uma página própria criada em construtor de sites (${builderHit}).`,
      discardBucket: 'site',
    };
  }

  // Dominio proprio, fora de qualquer lista conhecida: e o caso mais comum
  // (site oficial de verdade) — a palavra no host so refina o MOTIVO exibido.
  const hint = keywordHint(host) ?? keywordHint(url.pathname);
  if (hint === 'menu') {
    return {
      classification: 'own_site',
      isFunctionalSite: true,
      isAmbiguous: false,
      detailPt: `Foi identificado um domínio próprio com página de cardápio (${host}).`,
      discardBucket: 'menu',
    };
  }
  if (hint === 'scheduling') {
    return {
      classification: 'own_site',
      isFunctionalSite: true,
      isAmbiguous: false,
      detailPt: `Foi identificado um domínio próprio com página de agendamento (${host}).`,
      discardBucket: 'scheduling',
    };
  }
  if (hint === 'catalog') {
    return {
      classification: 'own_site',
      isFunctionalSite: true,
      isAmbiguous: false,
      detailPt: `Foi identificado um domínio próprio com catálogo de produtos (${host}).`,
      discardBucket: 'catalog',
    };
  }

  return {
    classification: 'own_site',
    isFunctionalSite: true,
    isAmbiguous: false,
    detailPt: `Foi identificado um site/domínio próprio (${host}).`,
    discardBucket: 'site',
  };
}
