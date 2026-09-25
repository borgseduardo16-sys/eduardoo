import type { Metadata } from 'next';
import { FileText } from 'lucide-react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = {
  title: 'Termos de Uso',
  description: 'As regras de uso da MyPlace, em linguagem direta.',
};

const SECOES = [
  {
    titulo: '1. O que é a MyPlace',
    paragrafos: [
      'A MyPlace é uma plataforma de intermediação: conecta pessoas que têm espaço sobrando (garagem, depósito, galpão, sala, quarto) a pessoas que precisam alugar esse tipo de espaço. A MyPlace não é proprietária, locadora nem fiadora de nenhum espaço anunciado — o contrato de aluguel é sempre entre proprietário e locatário.',
      'A plataforma intermedeia a comunicação e o pagamento entre as partes, e existe para que isso deixe rastro: conversa registrada e pagamento rastreável.',
    ],
  },
  {
    titulo: '2. Conta e responsabilidade',
    paragrafos: [
      'Você é responsável pela veracidade dos dados que informa, pelas fotos e descrições que publica e pelo que combina com a outra parte dentro da plataforma.',
      'Contas podem ser suspensas por descumprimento destas regras, denúncias procedentes ou reincidência — sempre com motivo registrado e auditável.',
    ],
  },
  {
    titulo: '3. Publicação de anúncios',
    paragrafos: [
      'Um anúncio precisa descrever o espaço real, com fotos do espaço real, e só pode ser publicado com as informações mínimas exigidas (tipo, localização, ao menos 3 fotos, preço, disponibilidade).',
      'A localização exata (rua, número, complemento) só é revelada ao locatário depois que uma reserva é aceita — antes disso, só a área aproximada aparece publicamente.',
    ],
  },
  {
    titulo: '4. Reserva e pagamento',
    paragrafos: [
      'O aluguel é uma assinatura mensal recorrente, cobrada automaticamente pela plataforma através de um gateway de pagamento. A MyPlace cobra uma taxa sobre cada transação — os percentuais atuais estão sempre visíveis em /taxas antes de qualquer confirmação.',
      'O repasse ao proprietário acontece depois que o pagamento é confirmado pelo gateway, já descontada a taxa da plataforma.',
    ],
  },
  {
    titulo: '5. Cancelamento e encerramento',
    paragrafos: [
      'Qualquer uma das partes pode cancelar uma solicitação antes dela ser aceita, ou encerrar um aluguel já ativo — o histórico da reserva permanece registrado para ambas as partes.',
      'Cancelar não gera reembolso automático de valores já cobrados; casos específicos são avaliados manualmente.',
    ],
  },
  {
    titulo: '6. Conteúdo proibido',
    paragrafos: [
      'Não são permitidos: anúncios de espaços que não existem ou não pertencem a quem publica, tentativa de contornar a plataforma para combinar pagamento por fora, assédio ou discurso de ódio nas mensagens, e uso do espaço alugado para fins ilegais.',
      'Denúncias são analisadas por um moderador humano e podem resultar em remoção de conteúdo ou suspensão de conta.',
    ],
  },
];

export default function TermosPage() {
  return (
    <>
      <SiteHeader />

      <main id="conteudo">
        <section className="px-4 sm:px-6 pt-12 pb-8 sm:pt-16">
          <div className="mx-auto max-w-2xl space-y-4">
            <p className="flex items-center gap-1.5 text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--accent)]">
              <FileText className="size-3.5" aria-hidden />
              Termos de Uso
            </p>
            <h1 className="text-[2rem] sm:text-[2.5rem] leading-[1.1] font-semibold">
              Regras de uso da MyPlace
            </h1>
          </div>
        </section>

        <section className="px-4 sm:px-6 pb-10">
          <div className="mx-auto max-w-2xl">
            <Alert tone="info" title="Produto em construção">
              A MyPlace ainda está em desenvolvimento e este texto descreve, com a maior
              precisão possível, como a plataforma funciona hoje — não é, ainda, um contrato
              revisado por um advogado nem substitui uma consultoria jurídica antes do
              lançamento público. Vai ser formalizado antes de qualquer uso comercial real.
            </Alert>
          </div>
        </section>

        <section className="px-4 sm:px-6 pb-16">
          <div className="mx-auto max-w-2xl space-y-10">
            {SECOES.map((s) => (
              <div key={s.titulo} className="space-y-3">
                <h2 className="text-[1.125rem] font-semibold">{s.titulo}</h2>
                {s.paragrafos.map((p, i) => (
                  <p key={i} className="text-[0.9375rem] text-[var(--content-muted)] leading-relaxed">
                    {p}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
