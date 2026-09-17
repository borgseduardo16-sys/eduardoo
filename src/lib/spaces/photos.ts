/**
 * O que sugerir que a pessoa fotografe.
 *
 * Isto e ORIENTACAO, nao formulario. Nao existe campo por sugestao e nada
 * aqui e marcado como "feito": nao temos como saber o que a foto mostra, e
 * dizer "visao geral: pronto" so porque existe uma foto seria inventar uma
 * informacao que o dono nao confirmou.
 *
 * A lista tambem nao bloqueia rascunho. Ela aparece, orienta, e sai da frente.
 */

export type PhotoSuggestion = {
  titulo: string;
  /** Uma frase de ajuda. O que fotografar, e por que aquilo importa. */
  dica: string;
};

/** Quantas fotos recomendamos. Nao e minimo nem maximo — e recomendacao. */
export const RECOMMENDED_PHOTOS = 5;

export const PHOTO_SUGGESTIONS: readonly PhotoSuggestion[] = [
  {
    titulo: 'Visão geral do espaço',
    dica: 'De longe, mostrando o espaço inteiro. É a foto que costuma virar capa.',
  },
  {
    titulo: 'Entrada/acesso',
    dica: 'O portão, a porta ou o corredor por onde a pessoa vai entrar.',
  },
  {
    titulo: 'Área principal',
    dica: 'O lugar onde as coisas vão ficar, vazio e com luz do dia.',
  },
  {
    titulo: 'Estrutura ou características importantes',
    dica: 'Teto, piso, tomada, prateleira, tranca — o que faz diferença no uso.',
  },
  {
    titulo: 'Outro ângulo do espaço',
    dica: 'A mesma área do outro lado, para dar noção de profundidade.',
  },
] as const;
