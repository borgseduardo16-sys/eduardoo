/*
 * Dados do cliente (ficha do Google enviada em 22/10/2026). Tudo o que o site mostra sai daqui. Português de Portugal.
 * ⚠ Confirmar: serviços e método (textos gerais de home staging), o que é o programa "Healthy Homes", WhatsApp
 * (assumido = telefone), horários (só se viu "Fecha 19:00") e o logótipo (redesenhado a partir da marca de água das fotos).
 */
export const EMPRESA = {
  nome: '5D Home Staging & Healthy Homes',
  curto: '5D Home Staging',
  categoria: 'Decorador de interiores',
  telefone: '+351 927 497 765',
  telefoneLink: 'tel:+351927497765',
  whatsapp: '351927497765',
  morada: 'Rua de Júlio Dinis 849',
  codigo: '4050-326 Porto',
  nota: '5,0',
  avaliacoes: 30,
};

export const urlWhats = (texto: string) => `https://wa.me/${EMPRESA.whatsapp}?text=${encodeURIComponent(texto)}`;
export const WHATSAPP_URL = urlWhats('Olá! Vi o vosso site e gostava de falar sobre home staging.');
const q = encodeURIComponent('5D Home Staging & Healthy Homes, Rua de Júlio Dinis 849, 4050-326 Porto, Portugal');
export const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${q}`;
export const ROTA_URL = `https://www.google.com/maps/dir/?api=1&destination=${q}`;

/** Projetos: fotografias reais enviadas. As legendas descrevem só o que se vê. */
export const PROJETOS = [
  { id: 'depois', divisao: 'Cozinha', t: 'Vidro menta, mesa posta', d: 'A mesma cozinha da abertura, já preparada: loiça, individuais em fibra, fruta e verde.', pos: '45% 55%' },
  { id: 'luz', divisao: 'Sala', t: 'Luz indireta e linho', d: 'Sanca iluminada, cortinados em linho, tapete orgânico e plantas.', pos: '40% 50%' },
  { id: 'wc', divisao: 'Casa de banho', t: 'Mármore e mar', d: 'Quadro em azuis, toalhas botânicas e escada em madeira.', pos: '50% 50%' },
  { id: 'estudio', divisao: 'Estúdio', t: 'Um T0 que parece maior', d: 'Ripado branco, banco em madeira, tons de musgo e mostarda.', pos: '45% 50%' },
  { id: 'mezanine', divisao: 'Mezanino', t: 'Dormir acima de tudo', d: 'Guarda em vidro, roupa de cama branca e almofadas em violeta.', pos: '35% 50%' },
  { id: 'lareira', divisao: 'Sala', t: 'Sol de fim de tarde', d: 'Sofá em tons areia, almofadas coral, girassóis junto à lareira.', pos: '45% 55%' },
] as const;

/** ⚠ Serviços típicos de home staging — confirmar a lista real com o cliente. */
export const SERVICOS = [
  { t: 'Home staging para venda', d: 'Preparamos o imóvel para as fotografias e as visitas, para que quem procura casa se imagine lá a viver.', img: 'depois', pos: '45% 55%' },
  { t: 'Arrendamento e alojamento local', d: 'Ambientes práticos, resistentes e fotogénicos, pensados para quem chega com a mala na mão.', img: 'estudio', pos: '45% 50%' },
  { t: 'Consultoria de decoração', d: 'Uma visita, uma leitura do espaço e um plano claro: o que manter, o que mudar e por onde começar.', img: 'luz', pos: '40% 50%' },
  { t: 'Healthy Homes', d: 'Casas pensadas para o bem-estar: luz natural, ar, materiais e organização ao serviço de quem lá vive.', img: 'lareira', pos: '45% 55%' },
] as const;

/** ⚠ Método geral — confirmar as etapas reais. */
export const METODO = [
  ['Visita', 'Conhecemos o imóvel, o público e o objetivo: vender, arrendar ou viver melhor.'],
  ['Proposta', 'Um plano à medida, com o que entra em cada divisão e o prazo de execução.'],
  ['Preparação', 'Levamos mobiliário, têxteis e detalhes e montamos tudo no local.'],
  ['Revelação', 'A casa fica pronta para fotografar, visitar e mostrar o melhor de si.'],
] as const;

export const FAQ = [
  { q: 'O que é home staging?', a: 'É preparar um imóvel para ser mostrado: organizar, decorar e equipar cada divisão para que quem visita (ou vê as fotografias) perceba o potencial da casa.' },
  { q: 'Trabalham com imóveis vazios e habitados?', a: 'Sim. Num imóvel vazio levamos o que for preciso; num imóvel habitado trabalhamos com o que já existe e acrescentamos o que falta.' },
  { q: 'Os preços estão no site?', a: 'Não: cada imóvel é diferente. Depois do pedido de proposta, falamos consigo e enviamos um orçamento à medida.' },
  { q: 'Posso pedir a proposta noutra língua?', a: 'No pedido de proposta pode indicar a língua em que prefere ser contactado.' },
];
