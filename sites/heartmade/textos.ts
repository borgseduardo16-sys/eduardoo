/*
 * Heartmade | Weddings & Events (Funchal, Madeira) — dados reais da ficha do Google (22/10/2026) e textos em
 * português de Portugal e inglês. Avaliações omitidas a pedido.
 * ⚠ Confirmar: serviços (inferidos da ficha "Assessoria e cerimonial de casamentos" e do letreiro "festas · eventos ·
 * decor"), WhatsApp (assumido = telefone), atendimento em inglês, horários (só se viu "Fecha 18:00") e autorização para
 * as fotos (aparecem os noivos e o cartaz "Tati & Pedro").
 */
export const EMPRESA = {
  nome: 'Heartmade',
  completo: 'Heartmade | Weddings & Events',
  telefone: '+351 935 951 872',
  telefoneLink: 'tel:+351935951872',
  whatsapp: '351935951872',
  morada: 'Av. da Madalena 80A',
  codigo: '9020-330 Funchal',
};
export const urlWhats = (texto: string) => `https://wa.me/${EMPRESA.whatsapp}?text=${encodeURIComponent(texto)}`;
const q = encodeURIComponent('Heartmade Weddings & Events, Av. da Madalena 80A, 9020-330 Funchal, Portugal');
export const ROTA_URL = `https://www.google.com/maps/dir/?api=1&destination=${q}`;

export type Lingua = 'pt' | 'en';

const pt = {
  sigla: 'PT',
  outra: 'EN',
  trocar: 'Switch to English',
  nav: { historias: 'Histórias', servicos: 'Serviços', estilos: 'Estilos', contacto: 'Contacto', cta: 'Pedir proposta', ctaCurto: 'Proposta' },
  whatsOla: 'Olá! Vi o vosso site e gostava de falar sobre um casamento/evento.',
  hero: {
    kicker: 'Weddings & Events · Funchal, Madeira',
    l1: 'Casamentos feitos',
    l2: 'à mão,',
    l3: 'com o coração.',
    sub: 'Planeamento, decoração e coordenação de casamentos e celebrações na Madeira. Do primeiro esboço ao último brinde, cada detalhe passa pelas nossas mãos.',
    cta: 'Pedir proposta',
    ver: 'Ver histórias',
    role: 'Role',
  },
  manifesto: {
    kicker: 'Heart · made',
    texto: 'Heartmade quer dizer feito com o coração. É assim que trabalhamos: flores escolhidas uma a uma, mesas postas como em casa e um plano que deixa os noivos livres para viver o dia.',
    destaque: ['coração', 'viver'],
  },
  diaNoite: {
    kicker: 'Um jardim, duas luzes',
    t1: 'Ao fim da tarde,',
    d1: 'o jardim recebe os convidados: veludo verde-oliva, castiçais de prata e flores que caem em cascata.',
    t2: 'quando as velas se acendem,',
    d2: 'o mesmo jardim transforma-se. É para este momento que desenhamos cada detalhe.',
  },
  rolo: {
    kicker: 'Histórias reais',
    titulo: 'O rolo',
    em: 'de filme.',
    sub: 'Fotografias de casamentos que preparámos na Madeira.',
    dica: 'Deslize para o lado',
    continue: 'Continue a rolar',
    fotos: {
      igreja: 'O sim, entre azulejos',
      pergola: 'A saída, debaixo da latada',
      mesaverde: 'Veludo, prata e amaranto',
      hortensias: 'Hortênsias e espelho',
      campestre: 'Xadrez, limões e velas',
      boasvindas: 'Bem-vindos, com flores',
      noite: 'O jardim à luz das velas',
    } as Record<string, string>,
  },
  servicos: {
    kicker: 'Serviços',
    titulo: 'Tudo o que um grande dia',
    em: 'pede.',
    itens: [
      { t: 'Planeamento e assessoria', d: 'Orçamento, calendário, espaço e fornecedores: organizamos tudo para que cada decisão seja simples e tranquila.', img: 'igreja', pos: '50% 40%' },
      { t: 'Coordenação do dia', d: 'Estamos presentes do início ao fim, a garantir horários e detalhes enquanto os noivos e os convidados aproveitam.', img: 'pergola', pos: '50% 50%' },
      { t: 'Decoração e flores', d: 'Cenários, mesas, iluminação e arranjos florais desenhados à medida de cada história.', img: 'hortensias', pos: '50% 40%' },
      { t: 'Festas e eventos', d: 'Batizados, aniversários, jantares e eventos privados, com o mesmo cuidado de um casamento.', img: 'campestre', pos: '40% 55%' },
    ],
  },
  estilos: {
    kicker: 'Estilos',
    titulo: 'Três casamentos,',
    em: 'três mundos.',
    itens: [
      { t: 'Jardim botânico', d: 'Veludo verde-oliva, prata antiga, hortênsias brancas e amaranto suspenso, debaixo das palmeiras.', fotos: ['mesaverde', 'hortensias'] },
      { t: 'Campestre', d: 'Toalhas em xadrez, limões, vasos de barro e velas, numa tenda iluminada por luzinhas.', fotos: ['campestre', 'pergola'] },
      { t: 'Cor e alegria', d: 'Laranjas, corais e vermelhos: do ramo da noiva ao cartaz ilustrado de boas-vindas.', fotos: ['boasvindas', 'igreja'] },
    ],
  },
  faixa: 'Funchal · Madeira · Portugal · Weddings & Events',
  proposta: {
    kicker: 'Proposta',
    titulo: 'Contem-nos a vossa',
    em: 'história.',
    sub: 'Cinco passos, dois minutos. O pedido segue pelo WhatsApp e respondemos com uma proposta à medida, sem compromisso.',
  },
  visita: {
    kicker: 'Visite-nos',
    titulo: 'O nosso espaço no',
    em: 'Funchal.',
    sub: 'Na loja da Avenida da Madalena mostramos ideias, peças e materiais. Combine uma visita connosco.',
    whats: 'WhatsApp',
    ligar: 'Ligar',
    rota: 'Como chegar',
    fotoAlt: 'A loja Heartmade na Avenida da Madalena, com o letreiro dourado e a montra decorada',
  },
  faqTitulo: 'Perguntas frequentes',
  faq: [
    { q: 'Com quanta antecedência devemos contactar?', a: 'Quanto mais cedo, melhor: as datas mais procuradas esgotam. Mesmo com pouco tempo, vale a pena perguntar.' },
    { q: 'Podemos pedir só a decoração?', a: 'No pedido de proposta indiquem o que procuram (planeamento, coordenação, decoração e flores) e respondemos com o que faz sentido para o vosso dia.' },
    { q: 'Os preços estão no site?', a: 'Não: cada casamento é único. Depois do pedido, enviamos uma proposta à medida.' },
  ],
  rodape: { frase: 'Feito com o coração, na Madeira.', direitos: 'Todos os direitos reservados.' },
  form: {
    passo: 'Passo', de: 'de', pronto: 'O vosso pedido',
    titulos: ['A celebração', 'Data e local', 'Convidados e estilo', 'Serviços', 'Contacto'],
    continuar: 'Continuar', resumo: 'Ver resumo', voltar: 'Voltar', editar: 'Editar dados',
    q0: ['Que celebração vamos', 'preparar', '?'],
    eventos: [
      { v: 'Casamento', sub: 'Civil, religioso ou simbólico', img: 'igreja' },
      { v: 'Renovação de votos', sub: 'Para voltar a dizer sim', img: 'pergola' },
      { v: 'Evento privado', sub: 'Jantares, festas, aniversários', img: 'campestre' },
      { v: 'Outra celebração', sub: 'Contem-nos no fim' },
    ],
    q1: ['Quando e', 'onde', '?'],
    data: 'Data', semData: 'Ainda não temos data', local: 'Zona', espaco: 'Espaço (opcional)', espacoPh: 'Ex.: quinta no Funchal',
    zonas: ['Funchal', 'Outro concelho da Madeira', 'Porto Santo', 'Ainda sem espaço'],
    q2: ['Quantos convidados e que', 'estilo', '?'],
    convidados: 'Convidados', convidadosOp: ['Até 30', '30 a 80', '80 a 150', 'Mais de 150', 'Ainda não sabemos'],
    estilo: 'Estilo (podem escolher vários)', estilos: ['Jardim botânico', 'Campestre', 'Cor e alegria', 'Clássico', 'Minimalista', 'Ainda não sabemos'],
    q3: ['Como podemos', 'ajudar', '?'],
    servicos: 'Serviços (podem escolher vários)', servicosOp: ['Planeamento completo', 'Coordenação do dia', 'Decoração e flores', 'Ainda não sabemos'],
    valor: 'Valor de referência (opcional)', valorNota: 'Ajuda-nos a propor algo realista. Não é um compromisso.',
    valores: ['Até 10 000 €', '10 000 a 20 000 €', '20 000 a 40 000 €', 'Mais de 40 000 €', 'Prefiro não indicar'],
    q4: ['Para onde enviamos a', 'proposta', '?'],
    nome: 'Os vossos nomes', nomePh: 'Ex.: Ana & Miguel', tel: 'Telefone / WhatsApp', telPh: '9xx xxx xxx ou +44 …', email: 'Email (opcional)', lingua: 'Língua de contacto',
    linguas: ['Português', 'English', 'Deutsch', 'Français'],
    obs: 'Mais alguma coisa? (opcional)', obsPh: 'Ex.: tema, cores, número de dias, ideias que já guardaram…',
    erros: { evento: 'Escolham o tipo de celebração para continuar.', data: 'Escolham uma data ou marquem "ainda não temos data".', passada: 'Essa data já passou. Escolham uma data futura.', nome: 'Indiquem o vosso nome.', tel: 'Indiquem um telefone válido (9 a 15 dígitos, com indicativo se for estrangeiro).', email: 'O email não parece válido.' },
    final: ['Está pronto,', '.'],
    finalSub: 'Ao enviar, o WhatsApp abre com a mensagem preenchida: só falta tocar em enviar.',
    enviar: 'Enviar pelo WhatsApp', copiar: 'Copiar resumo', copiado: 'Copiado!', privado: 'Os vossos dados ficam no vosso dispositivo até tocarem em enviar.',
    msg: {
      ola: 'Olá, Heartmade! Pedido de proposta feito pelo site.', evento: 'Celebração', data: 'Data', porDefinir: 'ainda por definir', local: 'Local', naoIndicado: 'não indicado',
      convidados: 'Convidados', estilo: 'Estilo', servicos: 'Serviços', valor: 'Valor de referência', nome: 'Nomes', tel: 'Telefone', email: 'Email', lingua: 'Língua de contacto', mais: 'Mais detalhes',
    },
  },
};

const en: typeof pt = {
  sigla: 'EN',
  outra: 'PT',
  trocar: 'Mudar para português',
  nav: { historias: 'Stories', servicos: 'Services', estilos: 'Styles', contacto: 'Contact', cta: 'Request a proposal', ctaCurto: 'Proposal' },
  whatsOla: 'Hello! I saw your website and would like to talk about a wedding/event.',
  hero: {
    kicker: 'Weddings & Events · Funchal, Madeira',
    l1: 'Weddings made',
    l2: 'by hand,',
    l3: 'from the heart.',
    sub: 'Wedding and event planning, design and coordination in Madeira. From the first sketch to the last toast, every detail goes through our hands.',
    cta: 'Request a proposal',
    ver: 'See our stories',
    role: 'Scroll',
  },
  manifesto: {
    kicker: 'Heart · made',
    texto: 'Heartmade means made from the heart. That is how we work: flowers chosen one by one, tables set as if at home, and a plan that leaves the couple free to live the day.',
    destaque: ['heart', 'live'],
  },
  diaNoite: {
    kicker: 'One garden, two lights',
    t1: 'In the late afternoon,',
    d1: 'the garden welcomes the guests: olive velvet, silver candelabra and flowers falling like waterfalls.',
    t2: 'when the candles are lit,',
    d2: 'the same garden is transformed. This is the moment we design every detail for.',
  },
  rolo: {
    kicker: 'Real stories',
    titulo: 'The film',
    em: 'roll.',
    sub: 'Photographs from weddings we prepared in Madeira.',
    dica: 'Swipe sideways',
    continue: 'Keep scrolling',
    fotos: {
      igreja: 'The “I do”, among azulejos',
      pergola: 'The exit, under the vine pergola',
      mesaverde: 'Velvet, silver and amaranth',
      hortensias: 'Hydrangeas and mirrors',
      campestre: 'Gingham, lemons and candles',
      boasvindas: 'A floral welcome',
      noite: 'The garden by candlelight',
    },
  },
  servicos: {
    kicker: 'Services',
    titulo: 'Everything a great day',
    em: 'needs.',
    itens: [
      { t: 'Planning & consulting', d: 'Budget, timeline, venue and suppliers: we organise everything so that every decision is simple and calm.', img: 'igreja', pos: '50% 40%' },
      { t: 'On-the-day coordination', d: 'We are there from start to finish, keeping schedules and details on track while the couple and guests enjoy.', img: 'pergola', pos: '50% 50%' },
      { t: 'Design & flowers', d: 'Settings, tables, lighting and floral arrangements designed around each story.', img: 'hortensias', pos: '50% 40%' },
      { t: 'Parties & events', d: 'Christenings, birthdays, dinners and private events, with the same care as a wedding.', img: 'campestre', pos: '40% 55%' },
    ],
  },
  estilos: {
    kicker: 'Styles',
    titulo: 'Three weddings,',
    em: 'three worlds.',
    itens: [
      { t: 'Botanical garden', d: 'Olive velvet, antique silver, white hydrangeas and hanging amaranth, under the palm trees.', fotos: ['mesaverde', 'hortensias'] },
      { t: 'Countryside', d: 'Gingham tablecloths, lemons, terracotta pots and candles, in a marquee lit by fairy lights.', fotos: ['campestre', 'pergola'] },
      { t: 'Colour & joy', d: 'Oranges, corals and reds: from the bridal bouquet to the illustrated welcome sign.', fotos: ['boasvindas', 'igreja'] },
    ],
  },
  faixa: 'Funchal · Madeira · Portugal · Weddings & Events',
  proposta: {
    kicker: 'Proposal',
    titulo: 'Tell us your',
    em: 'story.',
    sub: 'Five steps, two minutes. Your request is sent via WhatsApp and we reply with a tailored proposal, with no commitment.',
  },
  visita: {
    kicker: 'Visit us',
    titulo: 'Our studio in',
    em: 'Funchal.',
    sub: 'At our shop on Avenida da Madalena we show ideas, pieces and materials. Book a visit with us.',
    whats: 'WhatsApp',
    ligar: 'Call',
    rota: 'Directions',
    fotoAlt: 'The Heartmade shop on Avenida da Madalena, with its golden sign and decorated window',
  },
  faqTitulo: 'Frequently asked questions',
  faq: [
    { q: 'How far in advance should we get in touch?', a: 'The earlier the better: the most popular dates sell out. Even if time is short, it is worth asking.' },
    { q: 'Can we book design and flowers only?', a: 'In the proposal request, tell us what you are looking for (planning, coordination, design and flowers) and we will reply with what makes sense for your day.' },
    { q: 'Are prices on the website?', a: 'No: every wedding is unique. After your request, we send you a tailored proposal.' },
  ],
  rodape: { frase: 'Made from the heart, in Madeira.', direitos: 'All rights reserved.' },
  form: {
    passo: 'Step', de: 'of', pronto: 'Your request',
    titulos: ['The celebration', 'Date & place', 'Guests & style', 'Services', 'Contact'],
    continuar: 'Continue', resumo: 'See summary', voltar: 'Back', editar: 'Edit details',
    q0: ['What are we', 'celebrating', '?'],
    eventos: [
      { v: 'Wedding', sub: 'Civil, religious or symbolic', img: 'igreja' },
      { v: 'Vow renewal', sub: 'To say yes again', img: 'pergola' },
      { v: 'Private event', sub: 'Dinners, parties, birthdays', img: 'campestre' },
      { v: 'Other celebration', sub: 'Tell us at the end' },
    ],
    q1: ['When and', 'where', '?'],
    data: 'Date', semData: 'We don’t have a date yet', local: 'Area', espaco: 'Venue (optional)', espacoPh: 'E.g. a quinta in Funchal',
    zonas: ['Funchal', 'Elsewhere in Madeira', 'Porto Santo', 'No venue yet'],
    q2: ['How many guests and what', 'style', '?'],
    convidados: 'Guests', convidadosOp: ['Up to 30', '30 to 80', '80 to 150', 'More than 150', 'Not sure yet'],
    estilo: 'Style (choose as many as you like)', estilos: ['Botanical garden', 'Countryside', 'Colour & joy', 'Classic', 'Minimalist', 'Not sure yet'],
    q3: ['How can we', 'help', '?'],
    servicos: 'Services (choose as many as you like)', servicosOp: ['Full planning', 'On-the-day coordination', 'Design & flowers', 'Not sure yet'],
    valor: 'Budget guide (optional)', valorNota: 'It helps us suggest something realistic. It is not a commitment.',
    valores: ['Up to €10,000', '€10,000 to €20,000', '€20,000 to €40,000', 'More than €40,000', 'Prefer not to say'],
    q4: ['Where should we send the', 'proposal', '?'],
    nome: 'Your names', nomePh: 'E.g. Anna & Michael', tel: 'Phone / WhatsApp', telPh: '+44 … or +49 …', email: 'Email (optional)', lingua: 'Preferred language',
    linguas: ['Português', 'English', 'Deutsch', 'Français'],
    obs: 'Anything else? (optional)', obsPh: 'E.g. theme, colours, number of days, ideas you have saved…',
    erros: { evento: 'Choose the type of celebration to continue.', data: 'Pick a date or tick “we don’t have a date yet”.', passada: 'That date has passed. Please choose a future date.', nome: 'Please tell us your names.', tel: 'Please enter a valid phone number (9 to 15 digits, with country code).', email: 'That email doesn’t look right.' },
    final: ['All set,', '.'],
    finalSub: 'When you send it, WhatsApp opens with the message ready: just tap send.',
    enviar: 'Send via WhatsApp', copiar: 'Copy summary', copiado: 'Copied!', privado: 'Your details stay on your device until you tap send.',
    msg: {
      ola: 'Hello, Heartmade! Proposal request from your website.', evento: 'Celebration', data: 'Date', porDefinir: 'not decided yet', local: 'Place', naoIndicado: 'not specified',
      convidados: 'Guests', estilo: 'Style', servicos: 'Services', valor: 'Budget guide', nome: 'Names', tel: 'Phone', email: 'Email', lingua: 'Preferred language', mais: 'More details',
    },
  },
};

export const TEXTOS: Record<Lingua, typeof pt> = { pt, en };
export type Textos = typeof pt;

/** Fotos do rolo de filme, na ordem. */
export const ROLO = [
  { id: 'igreja', pos: '50% 45%' },
  { id: 'mesaverde', pos: '50% 50%' },
  { id: 'pergola', pos: '50% 50%' },
  { id: 'hortensias', pos: '50% 45%' },
  { id: 'campestre', pos: '45% 55%' },
  { id: 'boasvindas', pos: '50% 50%' },
] as const;
