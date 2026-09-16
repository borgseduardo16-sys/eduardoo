/**
 * O que a plataforma protege — fonte unica dos textos de protecao.
 *
 * REGRA DE HONESTIDADE, ESTRUTURAL E NAO POR LEMBRANCA
 *
 * Cada item declara um `status`. A interface renderiza SOMENTE os `live`.
 * Um item `pending_phase` ou `needs_policy` nao aparece em lugar nenhum ate
 * mudar de status.
 *
 * Isso existe porque a tentacao aqui e enorme: escrever "feche pelo app que a
 * gente resolve qualquer problema" convence muito mais do que a verdade. Mas
 * prometer mediacao antes de existir um processo de mediacao e, na pratica,
 * publicidade enganosa — com risco sob o Codigo de Defesa do Consumidor, e com
 * um custo de confianca muito maior no dia em que alguem cobrar a promessa.
 *
 * Quando a Fase 7 entregar pagamento real, os itens de pagamento viram `live`
 * aqui e passam a aparecer sozinhos. Nenhum texto precisa ser cacado no codigo.
 */

export type ProtectionStatus =
  /** Funciona hoje. Pode ser exibido como garantia. */
  | 'live'
  /** Depende de uma fase ainda nao construida. Nao aparece na interface. */
  | 'pending_phase'
  /** Depende de uma decisao de negocio ou politica escrita. Nao aparece. */
  | 'needs_policy';

export type Protection = {
  key: string;
  title: string;
  description: string;
  /** Nome do icone lucide-react. */
  icon: string;
  status: ProtectionStatus;
  /** Para itens nao-live: o que falta. So aparece na documentacao interna. */
  blockedBy?: string;
};

export const PROTECTIONS: Protection[] = [
  // ----- Funciona hoje -----
  {
    key: 'conversa_registrada',
    title: 'A conversa fica registrada',
    description:
      'Tudo que for combinado no chat fica guardado com data e hora. Se houver divergência depois, existe um registro do que foi dito — coisa que uma conversa em aplicativo de mensagens particular não garante.',
    icon: 'MessagesSquare',
    status: 'live',
  },
  {
    key: 'endereco_protegido',
    title: 'Seu endereço só é revelado no momento certo',
    description:
      'O endereço exato do espaço aparece para o locatário apenas depois que você aceita a reserva. No mapa público, a posição é aproximada.',
    icon: 'MapPinned',
    status: 'live',
  },
  {
    key: 'denuncia',
    title: 'Canal de denúncia',
    description:
      'Você pode denunciar um anúncio, um usuário ou uma mensagem específica. A denúncia é confidencial e o conteúdo denunciado é preservado, mesmo que a pessoa apague depois.',
    icon: 'Flag',
    status: 'live',
  },
  {
    key: 'bloqueio',
    title: 'Bloqueio imediato',
    description:
      'Se alguém te incomodar, você bloqueia na hora, sem depender de análise de ninguém. A pessoa deixa de conseguir falar com você ou reservar seu espaço.',
    icon: 'Ban',
    status: 'live',
  },
  {
    key: 'alerta_golpe',
    title: 'Alerta sobre pedido de pagamento por fora',
    description:
      'Quando alguém envia chave Pix, telefone ou pede adiantamento no chat, você recebe um aviso na hora.',
    icon: 'ShieldAlert',
    status: 'live',
  },
  {
    key: 'historico_publico',
    title: 'Histórico visível antes de fechar',
    description:
      'Você vê há quanto tempo a pessoa está na plataforma, quantas locações ela concluiu e o que foi verificado na conta dela.',
    icon: 'BadgeCheck',
    status: 'live',
  },

  // ----- Ainda nao. Nao aparece na interface. -----
  {
    key: 'comprovante_pagamento',
    title: 'Comprovante de cada pagamento',
    description:
      'Todo pagamento gera comprovante com valor, data e destinatário, guardado na sua conta.',
    icon: 'ReceiptText',
    status: 'pending_phase',
    blockedBy: 'Fase 7 — integração de pagamento com o Asaas',
  },
  {
    key: 'estorno',
    title: 'Estorno pelo meio de pagamento',
    description:
      'Pagamento feito pela plataforma pode ser estornado pelo gateway quando cabível.',
    icon: 'Undo2',
    status: 'pending_phase',
    blockedBy: 'Fase 7 — integração de pagamento com o Asaas',
  },
  {
    key: 'mediacao',
    title: 'Mediação de conflito',
    description:
      'A plataforma media a conversa quando as partes não chegam a acordo.',
    icon: 'Scale',
    status: 'needs_policy',
    blockedBy:
      'Não existe processo de mediação definido: prazos, critérios, quem decide e o que acontece com o dinheiro durante a disputa. Exige decisão de negócio e revisão jurídica.',
  },
  {
    key: 'garantia_danos',
    title: 'Cobertura de danos',
    description: 'Cobertura para danos causados ao espaço durante a locação.',
    icon: 'ShieldCheck',
    status: 'needs_policy',
    blockedBy:
      'Exigiria produto de seguro ou fundo de garantia, com regras, limites e provisão financeira. Decisão de negócio, não de engenharia.',
  },
];

/** O que a interface pode exibir. Nunca renderize `PROTECTIONS` direto. */
export function liveProtections(): Protection[] {
  return PROTECTIONS.filter((p) => p.status === 'live');
}

/** Para docs/STATUS.md e painel interno — o que ainda nao podemos prometer. */
export function pendingProtections(): Protection[] {
  return PROTECTIONS.filter((p) => p.status !== 'live');
}

/**
 * O que a pessoa perde ao fechar por fora.
 *
 * Escrito como perda concreta, e nao como "é mais seguro aqui". Aviso vago
 * ninguem le; "não existe comprovante" a pessoa entende na hora.
 */
export const OFF_PLATFORM_RISKS = [
  {
    key: 'sem_registro',
    title: 'Não existe comprovante do combinado',
    description:
      'Conversa em aplicativo particular pode ser apagada dos dois lados. Sem registro, é a palavra de um contra a do outro.',
  },
  {
    key: 'sem_rastro',
    title: 'Pix para desconhecido não volta',
    description:
      'Transferência para a conta de outra pessoa é irreversível. Se o espaço não existir, o dinheiro não volta pelo banco.',
  },
  {
    key: 'sem_historico',
    title: 'A pessoa deixa de ter o que perder',
    description:
      'Dentro da plataforma, quem age de má-fé perde histórico, avaliações e a conta. Fora daqui, não perde nada.',
  },
  {
    key: 'sem_recurso',
    title: 'Não temos como agir',
    description:
      'Combinação feita fora da MyPlace não deixa rastro no nosso sistema. Não conseguimos verificar, intermediar nem cobrar ninguém por algo que não aconteceu aqui.',
  },
] as const;

/**
 * Sinais classicos de golpe neste tipo de anuncio.
 * Baseado no roteiro que se repete: puxar para fora, criar urgencia, pedir
 * adiantamento antes de qualquer visita.
 */
export const SCAM_PATTERNS = [
  {
    key: 'adiantamento',
    title: 'Pede pagamento antes da visita',
    description:
      'Sinal, caução ou "taxa de reserva" antes de você conhecer o espaço. Não existe motivo legítimo para isso.',
  },
  {
    key: 'urgencia',
    title: 'Cria urgência artificial',
    description:
      '"Tem outra pessoa querendo", "só seguro até hoje". Pressa serve para você não conferir nada.',
  },
  {
    key: 'fora_do_app',
    title: 'Insiste em sair da plataforma',
    description:
      'Quem quer levar a conversa para o WhatsApp logo no primeiro contato costuma querer sumir depois.',
  },
  {
    key: 'preco_absurdo',
    title: 'Preço muito abaixo do normal',
    description:
      'Galpão grande por preço de vaga de moto. Preço fora da curva é isca, não oportunidade.',
  },
  {
    key: 'recusa_visita',
    title: 'Evita a visita',
    description:
      '"Estou viajando", "o espaço está trancado". Se você não pode ver, não feche.',
  },
  {
    key: 'terceiro',
    title: 'Diz que o espaço é de outra pessoa',
    description:
      'Quem anuncia precisa poder alugar. "É do meu tio" costuma significar que ninguém autorizou nada.',
  },
] as const;
