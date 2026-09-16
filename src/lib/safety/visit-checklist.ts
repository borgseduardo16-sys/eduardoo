/**
 * Checklist de visita ao espaco, antes de fechar.
 *
 * A visita e a unica verificacao que nenhum sistema substitui. Foto se copia
 * da internet, endereco se inventa, conversa se finge. Estar no lugar, nao.
 *
 * O item mais importante da lista inteira e "nao pague nada na visita":
 * praticamente todo golpe deste tipo depende de conseguir um adiantamento
 * antes de a pessoa conferir qualquer coisa.
 */

export type SpaceTypeKey =
  | 'garagem' | 'vaga_carro' | 'vaga_moto' | 'deposito' | 'quarto'
  | 'galpao' | 'sala' | 'escritorio' | 'loja' | 'terreno' | 'outro';

export type ChecklistItem = {
  key: string;
  label: string;
  hint?: string;
  /** Vazio = vale para todo tipo de espaco. */
  appliesTo?: SpaceTypeKey[];
  /** Destaque visual. Reservado para o que protege dinheiro. */
  critical?: boolean;
};

export type ChecklistGroup = {
  key: string;
  title: string;
  items: ChecklistItem[];
};

const GROUPS: ChecklistGroup[] = [
  {
    key: 'seguranca',
    title: 'Antes de qualquer coisa',
    items: [
      {
        key: 'nao_pagar',
        label: 'Não pague nada durante a visita',
        hint: 'Nem sinal, nem caução, nem "taxa de reserva". O pagamento acontece pela plataforma, depois que a reserva for aceita. Quem pede dinheiro na visita está aplicando um golpe.',
        critical: true,
      },
      {
        key: 'confirmar_pessoa',
        label: 'Confirme que quem atende é quem anunciou',
        hint: 'Peça para ver um documento. O nome tem que bater com o do anúncio.',
        critical: true,
      },
      {
        key: 'avisar_alguem',
        label: 'Avise alguém para onde você vai',
        hint: 'Mande o endereço e o horário para alguém de confiança. Se puder, vá acompanhado.',
        critical: true,
      },
      {
        key: 'horario',
        label: 'Marque em horário com movimento',
        hint: 'Durante o dia, com gente por perto. Evite visita à noite em local isolado.',
      },
    ],
  },
  {
    key: 'espaco',
    title: 'Confira o espaço',
    items: [
      {
        key: 'bate_com_fotos',
        label: 'O lugar é o mesmo das fotos',
        hint: 'Foto antiga ou de outro imóvel é o sinal mais comum de anúncio falso.',
        critical: true,
      },
      {
        key: 'endereco_confere',
        label: 'O endereço é o que estava no anúncio',
      },
      {
        key: 'tamanho',
        label: 'Meça o espaço',
        hint: 'Leve uma trena ou use o aplicativo de medida do celular. Confirme se cabe o que você precisa guardar.',
      },
      {
        key: 'umidade',
        label: 'Procure umidade, infiltração e goteira',
        hint: 'Olhe o teto, os cantos do chão e o cheiro do ambiente. Mancha escura no rodapé é sinal de infiltração.',
        appliesTo: ['garagem', 'deposito', 'quarto', 'galpao', 'sala', 'escritorio', 'loja'],
      },
      {
        key: 'piso',
        label: 'Veja a condição do piso',
        appliesTo: ['garagem', 'deposito', 'galpao', 'terreno'],
      },
      {
        key: 'drenagem',
        label: 'Verifique se alaga quando chove',
        hint: 'Pergunte diretamente e procure marca d\'água nas paredes.',
        appliesTo: ['garagem', 'deposito', 'galpao', 'terreno', 'loja'],
      },
      {
        key: 'manobra',
        label: 'Teste se seu veículo entra e manobra',
        hint: 'Se possível, entre com o veículo durante a visita. Largura de portão engana no olho.',
        appliesTo: ['garagem', 'vaga_carro', 'vaga_moto', 'galpao', 'terreno'],
      },
      {
        key: 'pe_direito',
        label: 'Confira a altura do pé-direito e da entrada',
        appliesTo: ['galpao', 'deposito', 'garagem', 'loja'],
      },
    ],
  },
  {
    key: 'acesso',
    title: 'Acesso e segurança do local',
    items: [
      {
        key: 'tranca',
        label: 'Teste a tranca, o portão e a fechadura',
        hint: 'Abra e feche você mesmo.',
      },
      {
        key: 'chave',
        label: 'Pergunte quem mais tem a chave',
        hint: 'Se outras pessoas têm acesso, você precisa saber antes.',
        critical: true,
      },
      {
        key: 'horarios',
        label: 'Confirme os horários em que você pode entrar',
        hint: 'Combine por escrito no chat da plataforma.',
      },
      {
        key: 'iluminacao',
        label: 'Veja a iluminação do local e do entorno',
      },
      {
        key: 'vizinhanca',
        label: 'Observe a vizinhança',
        hint: 'Se possível, pergunte a um vizinho há quanto tempo aquilo é alugado.',
      },
      {
        key: 'camera',
        label: 'Confirme se a câmera anunciada existe e funciona',
        hint: 'Câmera desligada no anúncio como "monitorado" é informação falsa.',
      },
    ],
  },
  {
    key: 'registro',
    title: 'Antes de ir embora',
    items: [
      {
        key: 'fotos',
        label: 'Tire fotos do estado atual do espaço',
        hint: 'Serve de prova depois, se houver discussão sobre dano pré-existente.',
        critical: true,
      },
      {
        key: 'escrever_no_chat',
        label: 'Escreva no chat tudo que foi combinado pessoalmente',
        hint: 'O que for acertado só na conversa presencial não existe para ninguém. Mande no chat da plataforma e peça confirmação.',
        critical: true,
      },
      {
        key: 'sem_pressa',
        label: 'Não feche na hora se ficou com dúvida',
        hint: 'Pressa para fechar na visita é sinal de alerta. Um espaço legítimo continua disponível amanhã.',
      },
    ],
  },
];

/** Checklist filtrado pelo tipo de espaco. */
export function checklistFor(spaceType: SpaceTypeKey): ChecklistGroup[] {
  return GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.appliesTo || item.appliesTo.includes(spaceType)),
  })).filter((group) => group.items.length > 0);
}

/** Quantos itens a pessoa vai ver, para mostrar progresso. */
export function checklistCount(spaceType: SpaceTypeKey): number {
  return checklistFor(spaceType).reduce((total, g) => total + g.items.length, 0);
}

/** Só os críticos — usado no resumo curto antes de reservar. */
export function criticalItems(spaceType: SpaceTypeKey): ChecklistItem[] {
  return checklistFor(spaceType)
    .flatMap((g) => g.items)
    .filter((i) => i.critical);
}
