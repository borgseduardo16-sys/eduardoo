/**
 * Sinais de confianca de um perfil.
 *
 * POR QUE ISTO E A DEFESA MAIS FORTE CONTRA SAIR DA PLATAFORMA
 *
 * Aviso nao segura ninguem. Quem quer combinar por fora combina, e um alerta
 * a mais na tela nao muda isso.
 *
 * O que muda o calculo e a pessoa ter algo a PERDER: um proprietario com 14
 * locacoes concluidas e documento conferido nao troca esse historico por
 * economizar 3% num mes — porque o historico e o que faz o proximo locatario
 * escolher o anuncio dele. Reputacao construida aqui nao acompanha ninguem
 * para fora.
 *
 * Por isso este modulo existe: nao para enfeitar o perfil, mas para tornar a
 * permanencia economicamente racional.
 *
 * Modulo puro — sem banco, sem rede. Recebe os dados e devolve a leitura.
 */

export type TrustInput = {
  createdAt: Date;
  emailVerified: boolean;
  phoneVerified: boolean;
  documentVerified: boolean;
  completedBookings: number;
  upheldReports: number;
  /** Media das avaliacoes, quando ja houver alguma. */
  ratingAvg?: number | null;
  ratingCount?: number;
};

export type TrustLevel = 'novo' | 'em_construcao' | 'estabelecido' | 'consolidado' | 'sob_revisao';

export type TrustSignal = {
  key: string;
  label: string;
  /** Nome do icone lucide-react. */
  icon: string;
  tone: 'positive' | 'neutral' | 'caution';
};

export type TrustProfile = {
  level: TrustLevel;
  levelLabel: string;
  /** Explicacao curta do nivel, para quem esta olhando o perfil. */
  levelHint: string;
  signals: TrustSignal[];
  /** Quantas das tres verificacoes a pessoa completou. */
  verificationsDone: number;
  verificationsTotal: number;
  /** O que falta verificar — vira a lista de proximos passos no proprio perfil. */
  missing: { key: string; label: string; why: string }[];
};

const DIA = 24 * 60 * 60 * 1000;

function mesesDesde(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (30 * DIA));
}

const LEVEL_COPY: Record<TrustLevel, { label: string; hint: string }> = {
  sob_revisao: {
    label: 'Conta em revisão',
    hint: 'Esta conta tem denúncias procedentes e está sendo analisada.',
  },
  novo: {
    label: 'Conta nova',
    hint: 'Ainda sem histórico na plataforma. Visite o espaço antes de fechar.',
  },
  em_construcao: {
    label: 'Construindo histórico',
    hint: 'Já tem verificações, mas poucas locações concluídas.',
  },
  estabelecido: {
    label: 'Histórico consistente',
    hint: 'Verificado e com locações concluídas na plataforma.',
  },
  consolidado: {
    label: 'Histórico consolidado',
    hint: 'Verificado, com várias locações concluídas e boa avaliação.',
  },
};

/**
 * Calcula o nivel de confianca.
 *
 * Deliberadamente NAO e uma nota de 0 a 100. Numero unico convida a comparar
 * "87 contra 84", o que nao quer dizer nada e passa uma precisao que o dado
 * nao tem. Faixas com explicacao sao mais honestas e mais uteis para decidir.
 */
export function computeTrustProfile(input: TrustInput): TrustProfile {
  const verifications = [input.emailVerified, input.phoneVerified, input.documentVerified];
  const verificationsDone = verifications.filter(Boolean).length;

  let level: TrustLevel;
  if (input.upheldReports >= 3) {
    // Denuncia procedente domina qualquer outro sinal. Um perfil com historico
    // longo E denuncias confirmadas e mais perigoso, nao menos.
    level = 'sob_revisao';
  } else if (input.completedBookings >= 5 && verificationsDone === 3 && (input.ratingAvg ?? 0) >= 4.5) {
    level = 'consolidado';
  } else if (input.completedBookings >= 2 && verificationsDone >= 2) {
    level = 'estabelecido';
  } else if (verificationsDone >= 1 || input.completedBookings >= 1) {
    level = 'em_construcao';
  } else {
    level = 'novo';
  }

  const signals: TrustSignal[] = [];

  if (input.emailVerified) {
    signals.push({ key: 'email', label: 'E-mail confirmado', icon: 'Mail', tone: 'positive' });
  }
  if (input.phoneVerified) {
    signals.push({ key: 'phone', label: 'Telefone confirmado', icon: 'Smartphone', tone: 'positive' });
  }
  if (input.documentVerified) {
    signals.push({ key: 'document', label: 'Documento conferido', icon: 'BadgeCheck', tone: 'positive' });
  }

  const meses = mesesDesde(input.createdAt);
  if (meses >= 1) {
    signals.push({
      key: 'age',
      label: meses >= 12 ? `Na MyPlace há ${Math.floor(meses / 12)} ano(s)` : `Na MyPlace há ${meses} ${meses === 1 ? 'mês' : 'meses'}`,
      icon: 'CalendarDays',
      tone: 'neutral',
    });
  }

  if (input.completedBookings > 0) {
    signals.push({
      key: 'bookings',
      label: `${input.completedBookings} ${input.completedBookings === 1 ? 'locação concluída' : 'locações concluídas'}`,
      icon: 'CircleCheckBig',
      tone: 'positive',
    });
  }

  if (input.ratingCount && input.ratingCount > 0 && input.ratingAvg) {
    signals.push({
      key: 'rating',
      label: `${input.ratingAvg.toFixed(1)} de 5 em ${input.ratingCount} ${input.ratingCount === 1 ? 'avaliação' : 'avaliações'}`,
      icon: 'Star',
      tone: 'positive',
    });
  }

  if (level === 'novo') {
    signals.push({
      key: 'new',
      label: 'Sem histórico ainda',
      icon: 'CircleAlert',
      tone: 'caution',
    });
  }

  const missing: TrustProfile['missing'] = [];
  if (!input.emailVerified) {
    missing.push({
      key: 'email',
      label: 'Confirmar e-mail',
      why: 'Sem isso você não recebe avisos de reserva e pagamento.',
    });
  }
  if (!input.phoneVerified) {
    missing.push({
      key: 'phone',
      label: 'Confirmar telefone',
      why: 'Aumenta a confiança de quem vai negociar com você.',
    });
  }
  if (!input.documentVerified) {
    missing.push({
      key: 'document',
      label: 'Conferir documento',
      why: 'Obrigatório para receber pagamentos. É o sinal que mais pesa para quem aluga.',
    });
  }

  return {
    level,
    levelLabel: LEVEL_COPY[level].label,
    levelHint: LEVEL_COPY[level].hint,
    signals,
    verificationsDone,
    verificationsTotal: 3,
    missing,
  };
}

/**
 * Deve recomendar visita presencial antes de fechar?
 *
 * Sempre recomendamos visitar. Mas quando a outra parte tem pouco historico, o
 * aviso sobe de tom — e ai a recomendacao vira destaque, nao rodape.
 */
export function shouldEmphasizeVisit(trust: TrustProfile): boolean {
  return trust.level === 'novo' || trust.level === 'em_construcao' || trust.level === 'sob_revisao';
}
