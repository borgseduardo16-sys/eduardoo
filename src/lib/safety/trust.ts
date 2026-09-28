/**
 * Sinais de confianca de um perfil (reescrito na Fase 21).
 *
 * POR QUE ISTO E A DEFESA MAIS FORTE CONTRA SAIR DA PLATAFORMA
 *
 * Aviso nao segura ninguem. O que muda o calculo e a pessoa ter algo a
 * PERDER: historico de locacoes concluidas e avaliacoes reais nao acompanham
 * ninguem para fora. Mostrar esse historico de forma honesta e o que torna a
 * permanencia economicamente racional.
 *
 * O QUE MUDOU NA FASE 21
 *
 * Antes havia um "nivel" sintetico (Conta nova / Historico consolidado /
 * Conta em revisao). Saiu, por tres motivos:
 * - era uma classificacao artificial, sem formula exposta a quem le;
 * - "Conta em revisao" publicava dado interno de moderacao (denuncias
 *   procedentes) — isso nao e informacao publica;
 * - "Conta nova" transformava ausencia de historico em algo negativo.
 *
 * A regra por tras de "Conta em revisao" continua valendo (ver `underReview`
 * e `shouldEmphasizeVisit`) — so deixou de ser publicada.
 *
 * Agora sao so SINAIS REAIS, cada um com a explicacao do que significa
 * (aparece ao tocar). Sinal que nao existe simplesmente nao aparece — nunca
 * vira um "x vermelho" nem um "0 avaliacoes".
 *
 * Premium, Destaque, Turbo e quantidade de anuncios NAO entram aqui:
 * popularidade/uso nao e confianca.
 *
 * Modulo puro — sem banco, sem rede. Recebe os dados e devolve a leitura.
 */
import { formatRating, reviewCountLabel } from '@/lib/reviews/format';
import { memberSinceLabel } from '@/lib/profiles/format';

/**
 * Verificacao de identidade: so estrutura nesta fase (coluna
 * `identity_verification_status`). Nao ha provedor integrado, entao o selo
 * nao aparece em lugar nenhum — mesmo que o banco diga 'verified', um valor
 * posto a mao nao e um processo real. Vira `true` quando existir o
 * processo de verdade.
 */
export const IDENTITY_VERIFICATION_AVAILABLE = false;

export type TrustInput = {
  createdAt: Date;
  emailVerified: boolean;
  phoneVerified: boolean;
  identityVerified?: boolean;
  completedBookings: number;
  /** Reputacao no papel que importa para quem esta lendo (ex.: como proprietario). */
  rating?: { average: string | null; count: number } | null;
  /**
   * Denuncias procedentes no limite de revisao
   * (`safety.auto_review_upheld_threshold`, o mesmo da moderacao).
   *
   * Dado INTERNO: nunca vira selo, texto nem motivo na tela. So faz a
   * recomendacao de visita subir de destaque — historico longo nao pode
   * mascarar denuncia confirmada (regra que existia desde a Fase 11 no
   * antigo nivel "Conta em revisao", mantida sem publicar a moderacao).
   */
  underReview?: boolean;
};

export type TrustSignalKey = 'email' | 'phone' | 'identity' | 'member_since' | 'bookings' | 'rating';

export type TrustSignal = {
  key: TrustSignalKey;
  label: string;
  /** O que o sinal significa. Obrigatorio: selo sem explicacao e decoracao. */
  explanation: string;
  /** Nome do icone lucide-react (ver components/safety/icon.tsx). */
  icon: string;
  group: 'verification' | 'history';
};

/** Texto das explicacoes — um lugar so, para perfil, anuncio e solicitacao dizerem o mesmo. */
export const TRUST_EXPLANATIONS = {
  email:
    'Esta pessoa confirmou o endereço de e-mail abrindo o link de confirmação enviado pela plataforma. O e-mail em si nunca é mostrado.',
  phone:
    'Esta pessoa confirmou um número de telefone através do processo de verificação da plataforma, com um código enviado por SMS. O número em si nunca é mostrado.',
  identity:
    'A identidade desta pessoa foi verificada através de um processo oficial da plataforma.',
  member_since: 'Data em que a conta foi criada na MyPlace.',
  bookings:
    'Aluguéis que chegaram ao fim dentro da MyPlace, contando os dois lados — como proprietário e como locatário.',
  rating:
    'Média das notas dadas por quem participou de uma locação concluída com esta pessoa. Só avalia quem alugou de verdade, uma vez por locação.',
} as const satisfies Record<TrustSignalKey, string>;

/**
 * Lista de sinais, na ordem em que devem aparecer: verificacoes primeiro,
 * historico depois.
 */
export function buildTrustSignals(input: TrustInput): TrustSignal[] {
  const signals: TrustSignal[] = [];

  if (input.emailVerified) {
    signals.push({
      key: 'email',
      label: 'E-mail verificado',
      explanation: TRUST_EXPLANATIONS.email,
      icon: 'MailCheck',
      group: 'verification',
    });
  }
  if (input.phoneVerified) {
    signals.push({
      key: 'phone',
      label: 'Telefone verificado',
      explanation: TRUST_EXPLANATIONS.phone,
      icon: 'Smartphone',
      group: 'verification',
    });
  }
  if (IDENTITY_VERIFICATION_AVAILABLE && input.identityVerified) {
    signals.push({
      key: 'identity',
      label: 'Identidade verificada',
      explanation: TRUST_EXPLANATIONS.identity,
      icon: 'BadgeCheck',
      group: 'verification',
    });
  }

  if (input.rating && input.rating.count > 0) {
    const nota = formatRating(input.rating.average);
    if (nota) {
      signals.push({
        key: 'rating',
        label: `${nota} ★ · ${reviewCountLabel(input.rating.count)}`,
        explanation: TRUST_EXPLANATIONS.rating,
        icon: 'Star',
        group: 'history',
      });
    }
  }

  if (input.completedBookings > 0) {
    signals.push({
      key: 'bookings',
      label: `${input.completedBookings} ${input.completedBookings === 1 ? 'locação concluída' : 'locações concluídas'}`,
      explanation: TRUST_EXPLANATIONS.bookings,
      icon: 'CircleCheckBig',
      group: 'history',
    });
  }

  signals.push({
    key: 'member_since',
    label: memberSinceLabel(input.createdAt),
    explanation: TRUST_EXPLANATIONS.member_since,
    icon: 'CalendarDays',
    group: 'history',
  });

  return signals;
}

/**
 * Deve recomendar visita presencial com mais enfase?
 *
 * Sempre recomendamos visitar. A recomendacao sobe de destaque quando a
 * outra parte ainda nao tem nenhuma locacao concluida nem avaliacao, ou
 * quando a moderacao ja confirmou denuncias contra ela (`underReview`) —
 * neste caso mesmo com historico longo. Nos dois casos, sem rotular a
 * pessoa nem dizer o motivo.
 */
export function shouldEmphasizeVisit(input: TrustInput): boolean {
  if (input.underReview) return true;
  return input.completedBookings === 0 && (input.rating?.count ?? 0) === 0;
}
