import type { Metadata } from 'next';
import { Lock } from 'lucide-react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = {
  title: 'Privacidade',
  description: 'Quais dados a MyPlace coleta, para quê, e como pedir acesso ou remoção.',
};

const COLETA = [
  { titulo: 'Conta', texto: 'Nome, e-mail e telefone informados no cadastro.' },
  { titulo: 'Pagamento', texto: 'CPF ou CNPJ, usado só para identificar a cobrança junto ao gateway de pagamento — número de cartão e dados bancários nunca passam pelos nossos servidores, ficam só com o gateway.' },
  { titulo: 'Localização', texto: 'Endereço completo do espaço (privado até uma reserva ser aceita) e, se você autorizar, sua localização aproximada para ordenar resultados por distância.' },
  { titulo: 'Conteúdo', texto: 'Fotos enviadas para anúncios (sem os metadados de câmera/GPS originais, removidos automaticamente) e o texto das conversas entre as partes.' },
  { titulo: 'Uso', texto: 'Registros técnicos de acesso e ações sensíveis (login, pagamento, denúncia, suspensão), guardados para segurança e auditoria.' },
];

export default function PrivacidadePage() {
  return (
    <>
      <SiteHeader />

      <main id="conteudo">
        <section className="px-4 sm:px-6 pt-12 pb-8 sm:pt-16">
          <div className="mx-auto max-w-2xl space-y-4">
            <p className="flex items-center gap-1.5 text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--accent)]">
              <Lock className="size-3.5" aria-hidden />
              Privacidade
            </p>
            <h1 className="text-[2rem] sm:text-[2.5rem] leading-[1.1] font-semibold">
              O que fazemos com seus dados
            </h1>
            <p className="text-[1.0625rem] text-[var(--content-muted)] leading-relaxed">
              Coletamos só o que é necessário para a plataforma funcionar — encontrar um
              espaço, cobrar um aluguel, resolver um problema. Nada é vendido a terceiros.
            </p>
          </div>
        </section>

        <section className="px-4 sm:px-6 pb-10">
          <div className="mx-auto max-w-2xl">
            <Alert tone="info" title="Produto em construção">
              Este texto descreve com precisão como os dados são tratados hoje, mas ainda não
              passou por revisão jurídica formal de adequação à LGPD — isso será feito antes do
              lançamento público.
            </Alert>
          </div>
        </section>

        <section className="px-4 sm:px-6 pb-12">
          <div className="mx-auto max-w-2xl space-y-4">
            <h2 className="text-[1.125rem] font-semibold">O que coletamos</h2>
            <ul className="space-y-3">
              {COLETA.map((c) => (
                <li key={c.titulo} className="rounded-[var(--radius-card)] border p-4 space-y-1">
                  <p className="font-medium text-[0.9375rem]">{c.titulo}</p>
                  <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">{c.texto}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="px-4 sm:px-6 pb-12">
          <div className="mx-auto max-w-2xl space-y-3">
            <h2 className="text-[1.125rem] font-semibold">Quem mais vê o quê</h2>
            <p className="text-[0.9375rem] text-[var(--content-muted)] leading-relaxed">
              O endereço exato de um espaço só é visível para você mesmo, e para o locatário
              depois que uma reserva é aceita. Outros usuários veem apenas nome, foto de
              perfil e o histórico de avaliações — nunca telefone, e-mail ou CPF/CNPJ.
              Moderadores da MyPlace podem ver dados relevantes só ao analisar uma denúncia.
            </p>
          </div>
        </section>

        <section className="px-4 sm:px-6 pb-16">
          <div className="mx-auto max-w-2xl space-y-3">
            <h2 className="text-[1.125rem] font-semibold">Seus direitos</h2>
            <p className="text-[0.9375rem] text-[var(--content-muted)] leading-relaxed">
              Seus dados de cadastro ficam visíveis em <strong>Minha conta</strong>. A edição e
              a exclusão desses dados pela própria tela ainda não estão prontas — enquanto
              isso, um pedido de correção ou remoção é atendido manualmente (ver{' '}
              <a href="/suporte" className="underline underline-offset-2">Suporte</a>).
              Dados que a lei exige guardar por mais tempo, como registros fiscais de
              pagamentos já realizados, não são removidos antes do prazo legal.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
