/*
 * Dados do cliente (print do Google enviado em 21/10/2026). Tudo que o site mostra sai daqui. Português de Portugal.
 * ⚠ Confirmar: nome comercial completo (o título aparece cortado), concelhos de atuação ("Viana…" assumido Viana do Castelo),
 * serviços reais, horários (só se viu "Aberto · Fecha 17:00"), WhatsApp (assumido = telefone) e autorização dos clientes para
 * as fotos (aparecem nomes de crianças nos cenários; uma foto tem marca de água de fotógrafa — mantida).
 */
export const EMPRESA = {
  nome: 'Truz, Truz, Surpresa',
  curto: 'Truz, Truz, Surpresa',
  telefone: '+351 937 294 987',
  telefoneLink: 'tel:+351937294987',
  whatsapp: '351937294987',
  morada: 'Edifício Pinheiro Manso, Rua Arquitecto António Borges Vinagre, Loja 9, 4750-106 Barcelos',
  nota: '4,8',
  avaliacoes: 20,
  zonas: ['Barcelos', 'Braga', 'Guimarães', 'Viana do Castelo'],
};

export const urlWhats = (texto: string) => `https://wa.me/${EMPRESA.whatsapp}?text=${encodeURIComponent(texto)}`;
export const WHATSAPP_URL = urlWhats('Olá! Vi o vosso site e gostava de falar sobre a decoração da minha festa.');
const q = encodeURIComponent('Truz, Truz, Surpresa - Decoração de Festas, Rua Arquitecto António Borges Vinagre, Loja 9, 4750-106 Barcelos, Portugal');
export const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${q}`;
export const ROTA_URL = `https://www.google.com/maps/dir/?api=1&destination=${q}`;

/** Galeria: fotos reais enviadas. Legendas descrevem apenas o que a foto mostra. */
export const GALERIA = [
  { id: 'duarte', cat: 'Cenários', t: 'O urso no cesto de balão', d: 'Painéis em arco, balões em tons de pêssego e dourado, números luminosos.', pos: '50% 55%', ratio: '4/5' },
  { id: 'lua', cat: 'Cenários', t: 'A lua, as nuvens e as estrelas', d: 'Cenário azul e branco com painel de fotografias e arco personalizado.', pos: '50% 50%', ratio: '1/0.88', credito: 'Foto: Vitória Fotografia' },
  { id: 'joao', cat: 'Cenários', t: 'Urso gigante e arco duplo', d: 'Balões azuis e cor de pêssego, cortina dourada e mesa do bolo.', pos: '50% 50%', ratio: '1/1' },
  { id: 'mesa', cat: 'Mesas', t: 'Mesa posta em verde-esmeralda', d: 'Runners, eucalipto, velas e candeeiro de cristal.', pos: '45% 60%', ratio: '2/3' },
  { id: 'caixa', cat: 'Detalhes', t: 'Caixa de batizado personalizada', d: 'Vela, concha, manta bordada e selos de lacre dourados.', pos: '50% 55%', ratio: '2/3' },
  { id: 'cartao', cat: 'Detalhes', t: 'A caixa dos desejos', d: 'Cartões escritos à mão guardados em vidro e dourado.', pos: '50% 50%', ratio: '2/3' },
  { id: 'lembrancas', cat: 'Detalhes', t: 'Lembranças em frascos', d: 'Frascos com rolha e coração, em expositor dourado.', pos: '50% 50%', ratio: '2/3' },
] as const;

export const CATEGORIAS = ['Todos', 'Cenários', 'Mesas', 'Detalhes'] as const;

/** Serviços típicos de decoração de festas — ⚠ trocar pelos serviços reais. */
export const SERVICOS = [
  { n: 'I', t: 'Cenários e painéis', d: 'Arcos, painéis personalizados, balões e letras para o fundo da festa.' },
  { n: 'II', t: 'Mesa do bolo e doces', d: 'Pedestais, expositores e composição da mesa principal.' },
  { n: 'III', t: 'Lembranças e detalhes', d: 'Caixas, frascos, cartões e pequenos presentes para os convidados.' },
  { n: 'IV', t: 'Decoração de mesas', d: 'Toalhas, runners, centros de mesa, velas e flores para jantares e almoços.' },
];

export const PROCESSO = [
  ['Conversamos', 'Conte-nos o que imagina: a ocasião, a data, o espaço e o tema.'],
  ['Desenhamos', 'Propomos o cenário e os detalhes, com cores e materiais à medida.'],
  ['Montamos', 'No dia, a equipa monta tudo no local, a tempo da festa.'],
  ['Celebram', 'Os convidados chegam e a surpresa está pronta.'],
];

export const FAQ = [
  { q: 'Como funciona o pedido de orçamento?', a: 'Preenche o simulador (5 passos rápidos) e envia pelo WhatsApp. A equipa responde por lá com os próximos passos e uma proposta.' },
  { q: 'Em que zonas trabalham?', a: 'Barcelos, Braga, Guimarães e Viana do Castelo. Se a sua festa for noutra localidade, indique-a no pedido e confirmamos a disponibilidade.' },
  { q: 'Com quanta antecedência devo contactar?', a: 'Quanto mais cedo, melhor, porque as datas mais procuradas esgotam. Mesmo com a festa próxima, vale a pena perguntar: confirmamos a disponibilidade na hora.' },
  { q: 'Posso indicar o tema e as cores?', a: 'Claro. No simulador pode escolher as cores e o estilo, e na conversa afinamos todos os detalhes.' },
  { q: 'Os preços estão no site?', a: 'Não: cada festa é diferente. O orçamento é feito à medida depois de percebermos o que pretende. No simulador pode indicar um valor de referência em euros.' },
];
