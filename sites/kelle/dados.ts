/*
 * Dados do cliente (print do Google enviado em 15/10/2026). Tudo que o site mostra sai daqui.
 * ⚠ Confirmar: nome completo do perfil ("Kelle Garcia - Atualle A…" aparece cortado), serviços e pacotes reais,
 * número do WhatsApp (assumido = telefone), autorização dos casais e crédito do(s) fotógrafo(s).
 */
export const EMPRESA = {
  nome: 'Kelle Garcia',
  cidade: 'Três Lagoas – MS',
  telefone: '(67) 99951-5616',
  telefoneLink: 'tel:+5567999515616',
  whatsapp: '5567999515616',
  endereco: 'R. Alaor Pimenta de Queiroz, 2021 — Jardim Alvorada, Três Lagoas – MS, 79611-190',
  nota: '5,0',
};

export const urlWhats = (texto: string) => `https://wa.me/${EMPRESA.whatsapp}?text=${encodeURIComponent(texto)}`;
export const WHATSAPP_URL = urlWhats('Olá, Kelle! Vim pelo seu site e gostaria de conversar sobre o meu evento.');
const q = encodeURIComponent('Kelle Garcia, R. Alaor Pimenta de Queiroz, 2021 - Jardim Alvorada, Três Lagoas - MS, 79611-190');
export const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${q}`;
export const ROTA_URL = `https://www.google.com/maps/dir/?api=1&destination=${q}`;

/** Seg–sex 08:00–18:00; sábado 08:00–13:00; domingo fechado (perfil do Google). Fuso de Mato Grosso do Sul. */
export const FUSO = 'America/Campo_Grande';
export const HORARIOS: [string, string][] = [
  ['Segunda a sexta', '08:00 – 18:00'],
  ['Sábado', '08:00 – 13:00'],
  ['Domingo', 'Fechado'],
];
export const FUNCIONAMENTO: Record<string, [number, number]> = {
  Mon: [480, 1080], Tue: [480, 1080], Wed: [480, 1080], Thu: [480, 1080], Fri: [480, 1080], Sat: [480, 780], Sun: [0, 0],
};

/** Capítulos do grande dia — fotos reais do portfólio. */
export const CAPITULOS = [
  { img: 'preparacao', n: 'I', t: 'A preparação', d: 'Horários, equipe e fornecedores alinhados para que a manhã seja só sua.', pos: '50% 30%' },
  { img: 'sorriso', n: 'II', t: 'O sim', d: 'Cerimônia conduzida em cada entrada, cada música, cada segundo.', pos: '50% 35%' },
  { img: 'pier', n: 'III', t: 'Os retratos', d: 'Tempo reservado para o pôr do sol e para as fotos que vão ficar.', pos: '45% 50%' },
  { img: 'flores', n: 'IV', t: 'A festa', d: 'Recepção, bolo, brindes e pista no ritmo que vocês sonharam.', pos: '50% 40%' },
  { img: 'luzes', n: 'V', t: 'Até o último brinde', d: 'Do primeiro convidado à despedida, alguém cuidando de tudo por vocês.', pos: '60% 40%' },
];

/** Serviços típicos de cerimonial — ⚠ trocar pelos serviços e pacotes reais da Kelle. */
export const SERVICOS = [
  { t: 'Assessoria completa', sub: 'Do planejamento ao grande dia', itens: ['Planejamento e cronograma', 'Indicação e gestão de fornecedores', 'Reuniões e visitas técnicas', 'Cerimonial no dia do evento'] },
  { t: 'Assessoria parcial', sub: 'Para quem já começou a organizar', itens: ['Revisão de contratos e fornecedores', 'Roteiro e cronograma do dia', 'Ensaio da cerimônia', 'Cerimonial no dia do evento'] },
  { t: 'Cerimonial do dia', sub: 'Tudo no lugar, na hora certa', itens: ['Reunião de alinhamento', 'Roteiro da cerimônia e da festa', 'Recepção de fornecedores', 'Condução do evento'] },
  { t: 'Outras celebrações', sub: 'Noivados, bodas, 15 anos', itens: ['Planejamento sob medida', 'Roteiro do evento', 'Coordenação de equipe', 'Cerimonial no dia'] },
];

export const PROCESSO = [
  ['O primeiro café', 'Uma conversa para conhecer vocês, a data, o estilo e o que não pode faltar.'],
  ['A proposta', 'Você recebe a proposta do serviço que faz sentido para o seu evento.'],
  ['O planejamento', 'Cronograma, fornecedores e roteiro construídos juntos, sem correria.'],
  ['O grande dia', 'Vocês vivem o momento. A equipe cuida de todo o resto.'],
];

export const FAQ = [
  { q: 'Como funciona o orçamento?', a: 'Você simula o seu evento aqui no site (tipo de celebração, serviço, data, convidados e estilo) e envia pelo WhatsApp. A Kelle responde por lá para marcar a primeira conversa.' },
  { q: 'Com quanto tempo de antecedência devo procurar?', a: 'Quanto antes, melhor: as datas mais procuradas costumam ser reservadas cedo. Mas vale conversar mesmo com o evento próximo — a disponibilidade é confirmada na hora.' },
  { q: 'Vocês atendem fora de Três Lagoas?', a: 'Conte no orçamento a cidade e o local do evento. A equipe responde se atende e como funciona.' },
  { q: 'Já preciso ter local e fornecedores?', a: 'Não. Você pode marcar "ainda estou procurando" — ajudar nessas escolhas faz parte do trabalho de assessoria.' },
  { q: 'Qual o horário de atendimento?', a: 'Segunda a sexta, das 08:00 às 18:00, e sábado, das 08:00 às 13:00. Mensagens fora do horário são respondidas no próximo atendimento.' },
];
