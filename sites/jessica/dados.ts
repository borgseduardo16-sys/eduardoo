/*
 * Dados do cliente (print do Google enviado em 16/10/2026). Tudo que o site mostra sai daqui.
 * ⚠ Confirmar: serviços e pacotes reais, @ do Instagram (o perfil só mostra "instagram.com"), horário de contato
 * (o Google marca "Aberto 24 horas"), WhatsApp (assumido = telefone) e autorização dos casais para o uso das fotos.
 */
export const EMPRESA = {
  nome: 'Jéssica Fernanda',
  cidade: 'Araras – SP',
  telefone: '(19) 99434-0896',
  telefoneLink: 'tel:+5519994340896',
  whatsapp: '5519994340896',
  endereco: 'Av. Zurita, 2 — 4 km, Jardim Belvedere, Araras – SP, 13601-020',
};

export const urlWhats = (texto: string) => `https://wa.me/${EMPRESA.whatsapp}?text=${encodeURIComponent(texto)}`;
export const WHATSAPP_URL = urlWhats('Olá, Jéssica! Vim pelo seu site e gostaria de conversar sobre o meu evento.');
const q = encodeURIComponent('Jéssica Fernanda Cerimonialista, Av. Zurita, 2 - 4km - Jardim Belvedere, Araras - SP, 13601-020');
export const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${q}`;
export const ROTA_URL = `https://www.google.com/maps/dir/?api=1&destination=${q}`;

/** Portfólio: fotos reais enviadas. Legendas descrevem apenas o que a foto mostra. */
export const PORTFOLIO = [
  { img: 'veu', t: 'A noiva e o véu', d: 'O instante antes do altar.', pos: '50% 40%' },
  { img: 'ipe', t: 'Ensaio entre as flores do ipê', d: 'Um casal, a luz da manhã e o campo.', pos: '55% 55%' },
  { img: 'bolhas', t: 'Saída da cerimônia', d: 'Bolhas, sorrisos e a porta da igreja.', pos: '55% 40%' },
  { img: 'igreja', t: 'Diante da igreja', d: 'Buquê de hortênsias e o caminho de pedras.', pos: '50% 50%' },
  { img: 'encantado', t: 'Um ensaio de conto de fadas', d: 'Quando o tema é a imaginação.', pos: '50% 45%' },
  { img: 'escadaria', t: 'Ensaio urbano', d: 'Abraço, vestido ao vento e escadaria.', pos: '45% 50%' },
  { img: 'cachorro', t: 'Quem também faz parte da família', d: 'Um ensaio com o cachorrinho no gramado.', pos: '50% 55%' },
];

/** Serviços típicos de cerimonial — ⚠ trocar pelos serviços e pacotes reais da Jéssica. */
export const SERVICOS = [
  { t: 'Assessoria completa', sub: 'Do planejamento ao grande dia', img: 'veu', pos: '50% 40%', itens: ['Planejamento e cronograma', 'Indicação e gestão de fornecedores', 'Reuniões e visitas técnicas', 'Cerimonial no dia do evento'] },
  { t: 'Assessoria parcial', sub: 'Para quem já começou a organizar', img: 'igreja', pos: '50% 50%', itens: ['Revisão de contratos e fornecedores', 'Roteiro e cronograma do dia', 'Ensaio da cerimônia', 'Cerimonial no dia do evento'] },
  { t: 'Cerimonial do dia', sub: 'Tudo no lugar, na hora certa', img: 'bolhas', pos: '55% 40%', itens: ['Reunião de alinhamento', 'Roteiro da cerimônia e da festa', 'Recepção de fornecedores', 'Condução do evento'] },
  { t: 'Mini wedding e celebrações íntimas', sub: 'Pequenos encontros, grandes cuidados', img: 'encantado', pos: '50% 45%', itens: ['Planejamento sob medida', 'Roteiro do evento', 'Coordenação de equipe', 'Cerimonial no dia'] },
];

export const PROCESSO = [
  ['Conversa inicial', 'Um primeiro papo para conhecer vocês, a data, o estilo e o que não pode faltar.'],
  ['Proposta', 'Você recebe a proposta do serviço que faz sentido para o seu evento.'],
  ['Planejamento', 'Cronograma, fornecedores e roteiro construídos juntos, sem correria.'],
  ['O grande dia', 'Vocês vivem o momento. Eu cuido de todo o resto.'],
];

export const FAQ = [
  { q: 'Como funciona o orçamento?', a: 'Você simula o seu evento aqui no site (celebração, serviço, data, convidados e estilo) e envia pelo WhatsApp. A Jéssica responde por lá para marcar a conversa inicial.' },
  { q: 'Com quanto tempo de antecedência devo procurar?', a: 'Quanto antes, melhor: as datas mais procuradas costumam ser reservadas cedo. Mas vale conversar mesmo com o evento próximo — a disponibilidade é confirmada na hora.' },
  { q: 'Atende fora de Araras?', a: 'Conte no orçamento a cidade e o local do evento. A Jéssica responde se atende e como funciona.' },
  { q: 'Já preciso ter local e fornecedores?', a: 'Não. Você pode marcar "ainda estou procurando" — ajudar nessas escolhas faz parte do trabalho de assessoria.' },
  { q: 'Posso agendar uma conversa?', a: 'Pode. Envie o orçamento ou chame no WhatsApp e combine o melhor momento para a conversa inicial.' },
];
