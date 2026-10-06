/*
 * Dados do cliente (perfil do Google enviado por print em 06/10/2026). Tudo que o site mostra sai daqui.
 * ⚠ Confirmar com o cliente: serviços oferecidos, capacidade, preços, política de reserva e o número de WhatsApp
 * (assumimos o mesmo telefone do perfil). O site NÃO mostra preços nem capacidade — nada foi inventado.
 */
export const EMPRESA = {
  nome: 'Casa Olion',
  cidade: 'Sorriso – MT',
  telefone: '(66) 99239-3320',
  telefoneLink: 'tel:+5566992393320',
  whatsapp: '5566992393320',
  endereco: 'Av. Blumenau Sul — Rota do Sol, Sorriso – MT, 78895-061',
};

export const urlWhats = (texto: string) => `https://wa.me/${EMPRESA.whatsapp}?text=${encodeURIComponent(texto)}`;
export const WHATSAPP_URL = urlWhats('Olá! Vim pelo site da Casa Olion e gostaria de saber mais sobre o espaço para o meu evento.');
const q = encodeURIComponent('Casa Olion, Av. Blumenau Sul - Rota do Sol, Sorriso - MT, 78895-061');
export const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${q}`;
export const ROTA_URL = `https://www.google.com/maps/dir/?api=1&destination=${q}`;

/** Segunda a sábado 08:00–17:00; domingo 08:00–meio-dia (perfil do Google). Fuso de Mato Grosso. */
export const FUSO = 'America/Cuiaba';
export const HORARIOS: [string, string][] = [
  ['Segunda a sábado', '08:00 – 17:00'],
  ['Domingo', '08:00 – 12:00'],
];
/** minutos de abertura/fechamento por dia (Intl weekday curto, em inglês) */
export const FUNCIONAMENTO: Record<string, [number, number]> = {
  Mon: [480, 1020], Tue: [480, 1020], Wed: [480, 1020], Thu: [480, 1020], Fri: [480, 1020], Sat: [480, 1020], Sun: [480, 720],
};

/** Fotos reais do espaço. `credito`: foto de fotógrafo (marca d'água visível na imagem). */
export const GALERIA = [
  { img: 'salao', titulo: 'Salão envidraçado de frente para a piscina', texto: 'Portas de vidro amplas que unem o salão ao jardim e à área da piscina.', pos: '50% 50%' },
  { img: 'arcos', titulo: 'Alameda de arcos floridos', texto: 'Caminho em pedra com arcos de flores: uma entrada pensada para cerimônias.', pos: '50% 40%', credito: 'Foto: Welliton Barbosa' },
  { img: 'mesa', titulo: 'Mesa posta ao ar livre', texto: 'Jantar no jardim com decoração temática, ao lado da piscina.', pos: '50% 55%', credito: 'Foto: Welliton Barbosa' },
  { img: 'piscina', titulo: 'Piscina com mesas altas e cascata', texto: 'Área de convivência com mesas altas, deck de madeira e parede de pedra.', pos: '50% 50%' },
  { img: 'jardim', titulo: 'Jardim e paisagismo', texto: 'Palmeiras, forrações e luminárias de jardim ao longo do caminho.', pos: '50% 50%' },
  { img: 'deck', titulo: 'Deck e fachada de vidro', texto: 'Piso amplo em madeira ao redor do salão, com canteiros floridos.', pos: '50% 50%' },
];

export const DESTAQUES = [
  { t: 'Salão envidraçado', d: 'Portas de vidro de ponta a ponta, com vista para o jardim.', img: 'salao', pos: '55% 55%' },
  { t: 'Piscina', d: 'Cenário de água e luz para o seu evento.', img: 'piscina', pos: '70% 50%' },
  { t: 'Jardim e paisagismo', d: 'Palmeiras, flores e caminhos de pedra.', img: 'jardim', pos: '50% 50%' },
  { t: 'Gramado amplo', d: 'Espaço aberto para montar o ambiente do seu jeito.', img: 'gramado', pos: '50% 60%' },
  { t: 'Iluminação noturna', d: 'Luminárias de jardim e fachada iluminada quando a noite chega.', img: 'noite', pos: '40% 60%' },
  { t: 'Deck de madeira', d: 'Piso amplo ao redor do salão.', img: 'deck', pos: '60% 70%' },
];

export const OCASIOES = [
  { t: 'Casamentos', d: 'Cerimônia e recepção no mesmo endereço, entre arcos de flores, jardim e salão.', img: 'arcos' },
  { t: 'Aniversários e festas', d: 'Piscina, mesas e área aberta para receber família e amigos.', img: 'piscina' },
  { t: 'Festas infantis e temáticas', d: 'Decoração ao ar livre, como a mesa posta do jardim.', img: 'mesa' },
  { t: 'Formaturas e confraternizações', d: 'Salão e jardim para celebrar conquistas e encontros.', img: 'salao' },
];

export const FAQ = [
  { q: 'Como funciona o orçamento?', a: 'Você simula o seu evento aqui no site (tipo de celebração, data, convidados, espaços e serviços) e envia pelo WhatsApp. A equipe da Casa Olion responde por lá com as informações e os próximos passos.' },
  { q: 'Posso visitar o espaço antes de reservar?', a: 'A visita pode ser combinada pelo WhatsApp, dentro do horário de atendimento. Basta pedir na conversa.' },
  { q: 'Já preciso ter a data definida?', a: 'Não. No orçamento você pode marcar "ainda não defini a data". A disponibilidade das datas é confirmada pela equipe.' },
  { q: 'Quais serviços a Casa Olion oferece?', a: 'Os serviços variam conforme o evento. No orçamento você marca o que gostaria de ter e a equipe responde o que está disponível e como funciona.' },
  { q: 'Qual o horário de atendimento?', a: 'De segunda a sábado, das 08:00 às 17:00, e aos domingos, das 08:00 ao meio-dia. Em feriados os horários podem mudar. Mensagens fora do horário são respondidas assim que a equipe voltar.' },
  { q: 'Onde fica a Casa Olion?', a: 'Na Av. Blumenau Sul, Rota do Sol, em Sorriso – MT (CEP 78895-061). Use o botão "Como chegar" para abrir a rota no mapa.' },
];
