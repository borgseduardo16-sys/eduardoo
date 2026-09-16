import type { Metadata } from 'next';
import Link from 'next/link';
import { OctagonAlert } from 'lucide-react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { ProtectionNotice } from '@/components/safety/protection-notice';
import { VisitChecklist } from '@/components/safety/visit-checklist';
import { SCAM_PATTERNS } from '@/lib/safety/protection';

export const metadata: Metadata = {
  title: 'Como a MyPlace protege você',
  description:
    'O que muda ao fechar pela plataforma, o que conferir na visita ao espaço e como reconhecer um golpe.',
};

export default function ProtecaoPage() {
  return (
    <>
      <SiteHeader />

      <main id="conteudo">
        <section className="px-4 sm:px-6 pt-12 pb-10 sm:pt-16">
          <div className="mx-auto max-w-2xl space-y-4">
            <h1 className="text-[2rem] sm:text-[2.5rem] leading-[1.1] font-semibold">
              Feche pela MyPlace
            </h1>
            <p className="text-[1.0625rem] text-[var(--content-muted)] leading-relaxed">
              Alugar um espaço é combinar algo com uma pessoa que você não conhece. A
              plataforma existe para que isso deixe rastro: conversa registrada, pagamento
              rastreável e um canal para agir quando algo sai errado.
            </p>
            <p className="text-[1.0625rem] text-[var(--content-muted)] leading-relaxed">
              Combinado por fora não deixa rastro nenhum — e aí não há o que fazer.
            </p>
          </div>
        </section>

        <section className="px-4 sm:px-6 pb-12">
          <div className="mx-auto max-w-2xl">
            <ProtectionNotice variant="full" />
          </div>
        </section>

        {/* Visita — o pedido central: conhecer o espaço antes de fechar */}
        <section className="px-4 sm:px-6 py-12 sm:py-16 bg-[var(--surface-sunken)] border-y">
          <div className="mx-auto max-w-2xl space-y-8">
            <div className="space-y-3">
              <h2 className="text-[1.5rem] font-semibold">Sempre visite antes de fechar</h2>
              <p className="text-[var(--content-muted)] leading-relaxed">
                Nenhuma verificação que fazemos substitui você ver o espaço com seus olhos.
                Leve este checklist na visita — ele muda conforme o tipo de espaço e fica
                salvo no seu celular enquanto você marca.
              </p>
            </div>

            <div className="rounded-[var(--radius-card)] border bg-[var(--surface)] p-5 sm:p-6">
              <VisitChecklist spaceType="garagem" />
            </div>

            <p className="text-[0.8125rem] text-[var(--content-subtle)] leading-relaxed">
              Este é o checklist de garagem, como exemplo. Na página de cada anúncio ele
              aparece ajustado ao tipo de espaço daquele anúncio.
            </p>
          </div>
        </section>

        {/* Golpes */}
        <section id="golpes" className="px-4 sm:px-6 py-12 sm:py-16 scroll-mt-20">
          <div className="mx-auto max-w-2xl space-y-8">
            <div className="flex items-start gap-3">
              <OctagonAlert
                className="size-5 shrink-0 mt-1"
                style={{ color: 'var(--color-critical)' }}
                aria-hidden
              />
              <div className="space-y-2">
                <h2 className="text-[1.5rem] font-semibold">Como reconhecer um golpe</h2>
                <p className="text-[var(--content-muted)] leading-relaxed">
                  O roteiro se repete: puxar a conversa para fora, criar pressa e pedir
                  adiantamento antes de qualquer visita. Se você vir mais de um destes
                  sinais, pare.
                </p>
              </div>
            </div>

            <ul className="grid gap-5 sm:grid-cols-2">
              {SCAM_PATTERNS.map((s) => (
                <li key={s.key} className="space-y-1">
                  <h3 className="text-[0.9375rem] font-medium">{s.title}</h3>
                  <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
                    {s.description}
                  </p>
                </li>
              ))}
            </ul>

            <div className="rounded-[var(--radius-card)] border p-5 space-y-2">
              <h3 className="font-semibold text-[0.9375rem]">Se você vir qualquer um desses</h3>
              <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
                Denuncie o anúncio ou a mensagem e bloqueie a pessoa. As duas coisas são
                confidenciais — a pessoa denunciada nunca sabe quem denunciou. Se houver
                ameaça, procure também a polícia (190).
              </p>
              <Link
                href="/minha-conta/seguranca"
                className="inline-block text-[0.875rem] text-[var(--accent)] underline underline-offset-4"
              >
                Centro de segurança da conta
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
