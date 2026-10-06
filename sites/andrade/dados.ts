/*
 * Dados REAIS do cliente (perfil do Google e do WhatsApp Business enviados pelo dono do projeto).
 * Tudo que aparece no site sai daqui — para atualizar telefone, horário ou endereço, edite só este arquivo.
 */
export const EMPRESA = {
  nome: 'Andrade Móveis Planejados',
  cidade: 'São Mateus – ES',
  telefone: '(27) 99630-0795',
  telefoneLink: 'tel:+5527996300795',
  whatsapp: '5527996300795',
  endereco: 'Rua Manoel Barcelos Sobrinho — Fátima, São Mateus – ES, 29933-630',
  enderecoCurto: 'Rua Manoel Barcelos Sobrinho, Fátima',
  // Google: 5,0 com 10 avaliações (print de 06/10/2026)
  nota: '5,0',
  avaliacoes: 10,
};

const msg = 'Olá! Vim pelo site e gostaria de um orçamento de móveis planejados.';
export const WHATSAPP_URL = `https://wa.me/${EMPRESA.whatsapp}?text=${encodeURIComponent(msg)}`;
const q = encodeURIComponent('Andrade Móveis Planejados, Rua Manoel Barcelos Sobrinho, Fátima, São Mateus - ES, 29933-630');
export const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${q}`;
export const ROTA_URL = `https://www.google.com/maps/dir/?api=1&destination=${q}`;

/** Seg–sex 08:30–18:00; sáb e dom fechado (perfil do WhatsApp Business). */
export const HORARIOS: [string, string][] = [
  ['Segunda a sexta', '08:30 – 18:00'],
  ['Sábado', 'Fechado'],
  ['Domingo', 'Fechado'],
];

export const PROJETOS = [
  { img: 'home', titulo: 'Home theater com nichos iluminados', texto: 'Painel com moldura em LED, nichos com prateleiras de vidro e rack suspenso.', pos: '50% 50%' },
  { img: 'cozinha-vidro', titulo: 'Cozinha com aéreos em vidro', texto: 'Portas de vidro com perfil, bancada em pedra escura e frente ripada.', pos: '50% 45%' },
  { img: 'painel', titulo: 'Painel amadeirado com LED', texto: 'Placa marmorizada emoldurada por luz e rack ripado suspenso.', pos: '50% 45%' },
  { img: 'cozinha-madeira', titulo: 'Cozinha com bancada americana', texto: 'Madeira, nichos iluminados, pendentes e bancada em granito.', pos: '50% 40%' },
  { img: 'bancada', titulo: 'Bancada ripada com LED', texto: 'Frente ripada iluminada por baixo e armários em grafite.', pos: '50% 55%' },
];

/** Do resumo das avaliações no Google ("Saiba antes de sair"). */
export const DESTAQUES = ['Acabamento impecável', 'Qualidade dos materiais', 'Pontualidade', 'Profissionalismo'];
export const CITACAO = 'Excelente acabamento, qualidade e profissionalismo.';
