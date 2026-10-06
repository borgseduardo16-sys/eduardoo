/*
 * Dados do cliente (perfil do Google enviado por print em 06/10/2026). Tudo que o site mostra sai daqui.
 * ⚠ Confirmar com o cliente: o número do botão "WhatsApp" do perfil não aparece no print — assumimos o mesmo do telefone.
 */
export const EMPRESA = {
  nome: 'Lignum Móveis Planejados',
  curto: 'Lignum',
  cidade: 'Linhares – ES',
  telefone: '(27) 99806-2254',
  telefoneLink: 'tel:+5527998062254',
  whatsapp: '5527998062254',
  endereco: 'R. Monteiro Lobato, 2-116 — Palmital, Linhares – ES, 29918-899',
  plusCode: 'JWHQ+H4 Palmital, Linhares – ES',
};

export const urlWhats = (texto: string) => `https://wa.me/${EMPRESA.whatsapp}?text=${encodeURIComponent(texto)}`;
export const WHATSAPP_URL = urlWhats('Olá! Vim pelo site da Lignum e gostaria de um orçamento de móveis planejados.');
const q = encodeURIComponent('Lignum Móveis Planejados, R. Monteiro Lobato, 2-116 - Palmital, Linhares - ES, 29918-899');
export const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${q}`;
export const ROTA_URL = `https://www.google.com/maps/dir/?api=1&destination=${q}`;

/** Segunda a sexta, 07:00–18:00; sábado e domingo fechado (perfil do Google). */
export const HORARIOS: [string, string][] = [
  ['Segunda a sexta', '07:00 – 18:00'],
  ['Sábado', 'Fechado'],
  ['Domingo', 'Fechado'],
];
export const ABRE_MIN = 7 * 60;
export const FECHA_MIN = 18 * 60;

export const PROJETOS = [
  { img: 'cozinha', titulo: 'Cozinha em L com LED embutido', texto: 'Aéreos brancos e em madeira, nicho aberto e fitas de LED desenhando o móvel.', pos: '50% 38%' },
  { img: 'painel', titulo: 'Painel ripado com prateleiras iluminadas', texto: 'Ripas claras, prateleiras com LED e bancada suspensa em cinza.', pos: '50% 30%' },
  { img: 'nogueira', titulo: 'Lavatório suspenso em nogueira', texto: 'Portas e gavetas em veio contínuo, com moldura e acabamento de precisão.', pos: '50% 55%' },
  { img: 'rack', titulo: 'Rack suspenso ripado', texto: 'Frente em ripas brancas, painel amadeirado e iluminação vertical.', pos: '50% 50%' },
  { img: 'verde', titulo: 'Lavatório em verde acinzentado', texto: 'Cuba de apoio, puxadores cromados e tampo de pedra clara.', pos: '50% 60%' },
];

/** Resumo das avaliações no Google ("Saiba antes de sair"). */
export const DESTAQUES = [
  'Acabamento impecável',
  'Atendimento atencioso da equipe',
  'Qualidade dos móveis de alto padrão',
];

export const AMBIENTES = [
  { t: 'Cozinhas', d: 'Armários, nichos e iluminação embutida.', img: 'cozinha' },
  { t: 'Painéis e racks', d: 'Ripados, prateleiras e rack suspenso.', img: 'painel' },
  { t: 'Banheiros e lavatórios', d: 'Gabinetes suspensos sob medida.', img: 'verde' },
  { t: 'Sala, quarto e escritório', d: 'Bancadas, estantes e armários planejados.', img: 'rack' },
];

/** Acabamentos mostrados nos projetos das fotos — ampliados a partir das próprias fotos. */
export const ACABAMENTOS = [
  { id: 'nogueira', nome: 'Nogueira', desc: 'Madeirado escuro de veio marcado, como no lavatório suspenso.', img: 'nogueira', pos: '30% 55%', zoom: 330 },
  { id: 'carvalho', nome: 'Carvalho ripado', desc: 'Ripas claras que dão ritmo e textura ao painel.', img: 'painel', pos: '70% 14%', zoom: 330 },
  { id: 'branco', nome: 'Branco fosco', desc: 'Frentes lisas com puxador embutido e acabamento limpo.', img: 'cozinha', pos: '60% 72%', zoom: 300 },
  { id: 'verde', nome: 'Verde acinzentado', desc: 'Cor suave para gabinetes com personalidade.', img: 'verde', pos: '38% 62%', zoom: 330 },
  { id: 'led', nome: 'Iluminação em LED', desc: 'Fita embutida que valoriza o móvel e o ambiente.', img: 'cozinha', pos: '28% 58%', zoom: 320 },
];

export const FAQ = [
  { q: 'Como funciona o orçamento?', a: 'Você monta o pedido aqui no site em poucos passos (ambiente, tamanho, acabamento e prazo) e envia pelo WhatsApp. A equipe responde por lá para combinar os próximos passos.' },
  { q: 'Preciso saber as medidas?', a: 'Não. Se já tiver, informe; se não tiver, escolha "ainda não medi" — a medição e o projeto são combinados depois, direto com a equipe.' },
  { q: 'Posso mandar fotos do ambiente?', a: 'Pode. Depois de enviar o pedido, é só mandar fotos e referências na mesma conversa do WhatsApp.' },
  { q: 'Qual o horário de atendimento?', a: 'De segunda a sexta, das 07:00 às 18:00. Sábado e domingo fechado. Mensagens enviadas fora do horário são respondidas no próximo dia útil.' },
  { q: 'Onde fica a Lignum?', a: 'Na R. Monteiro Lobato, 2-116, bairro Palmital, em Linhares – ES (CEP 29918-899). Use o botão "Como chegar" para abrir a rota no mapa.' },
];
