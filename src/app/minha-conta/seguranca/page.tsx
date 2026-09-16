import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Ban, Flag, MessageSquareWarning, ShieldCheck } from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { listBlockedUsers } from '@/lib/safety/queries';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { UnblockButton } from '@/components/safety/block-button';

export const metadata: Metadata = { title: 'Segurança' };

/**
 * Centro de segurança da conta.
 *
 * A lista de bloqueios vem do banco, do usuário autenticado — se estiver vazia
 * é porque ele não bloqueou ninguém, não porque a tela é maquete.
 */
export default async function SegurancaPage() {
  const user = await requireUser('/minha-conta/seguranca');
  const blocked = await listBlockedUsers(user.id);

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-3xl px-4 sm:px-6 py-10 space-y-10">
        <header className="space-y-2">
          <Link
            href="/minha-conta"
            className="inline-flex items-center gap-1.5 text-[0.875rem] text-[var(--content-muted)] hover:text-[var(--content)]"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Minha conta
          </Link>
          <h1 className="text-[1.75rem] font-semibold">Segurança</h1>
          <p className="text-[var(--content-muted)]">
            Ferramentas para você se proteger sem depender de ninguém.
          </p>
        </header>

        {/* Bloqueios — dado real */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Ban className="size-4 text-[var(--content-muted)]" aria-hidden />
            <h2 className="font-semibold">Pessoas bloqueadas</h2>
          </div>

          {blocked.length === 0 ? (
            <div className="rounded-[var(--radius-card)] border border-dashed p-8 text-center space-y-2">
              <p className="text-[0.9375rem] text-[var(--content-muted)]">
                Você não bloqueou ninguém.
              </p>
              <p className="text-[0.8125rem] text-[var(--content-subtle)] max-w-sm mx-auto leading-relaxed">
                Ao bloquear alguém, vocês deixam de conseguir conversar ou negociar pela
                plataforma — e a conversa existente entre vocês é encerrada na hora.
              </p>
            </div>
          ) : (
            <ul className="divide-y rounded-[var(--radius-card)] border">
              {blocked.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium truncate">{b.fullName ?? 'Usuário'}</p>
                    <p className="text-[0.8125rem] text-[var(--content-muted)]">
                      Bloqueado em{' '}
                      {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(b.blockedAt)}
                      {b.reason ? ` · ${b.reason}` : ''}
                    </p>
                  </div>
                  <UnblockButton userId={b.id} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Como a plataforma protege */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-[var(--content-muted)]" aria-hidden />
            <h2 className="font-semibold">O que já protege você</h2>
          </div>

          <ul className="space-y-4">
            {[
              {
                icon: ShieldCheck,
                t: 'Seu endereço fica privado',
                d: 'O endereço exato do seu espaço só aparece para o locatário depois que a reserva é aceita. No mapa público, a posição é aproximada.',
              },
              {
                icon: MessageSquareWarning,
                t: 'Avisamos sobre pedidos de pagamento por fora',
                d: 'Quando alguém envia telefone, chave Pix ou pede adiantamento no chat, você recebe um alerta. Pagamento fora da plataforma não tem comprovante, mediação nem reembolso.',
              },
              {
                icon: Flag,
                t: 'Denúncia confidencial',
                d: 'Você pode denunciar um anúncio, um usuário ou uma mensagem específica. A pessoa denunciada nunca sabe quem denunciou.',
              },
              {
                icon: Ban,
                t: 'Bloqueio com efeito imediato',
                d: 'Bloquear não depende de análise de ninguém. Vale na hora, nos dois sentidos, e impede conversa e reserva.',
              },
            ].map((item) => (
              <li key={item.t} className="flex gap-3">
                <item.icon className="size-4 mt-1 shrink-0 text-[var(--accent)]" aria-hidden />
                <div className="space-y-1">
                  <h3 className="text-[0.9375rem] font-medium">{item.t}</h3>
                  <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
                    {item.d}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-[var(--radius-card)] border p-5 space-y-2 bg-[var(--surface-sunken)]">
          <h2 className="font-semibold text-[0.9375rem]">Em caso de emergência</h2>
          <p className="text-[0.875rem] text-[var(--content-muted)] leading-relaxed">
            Se houver ameaça à sua integridade física, procure a polícia (190). A MyPlace
            coopera com autoridades quando formalmente requisitada, mas não substitui um
            boletim de ocorrência.
          </p>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
