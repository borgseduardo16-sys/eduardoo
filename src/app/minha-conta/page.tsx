import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Bell,
  BellRing,
  CalendarCheck,
  ChevronRight,
  CircleCheck,
  Circle,
  Heart,
  House,
  LifeBuoy,
  LogOut,
  ShieldCheck,
  Sparkle,
  Star,
  UserRound,
  BadgeCheck,
  type LucideIcon,
} from 'lucide-react';
import { requireUser } from '@/lib/auth/dal';
import { signOutAction } from '@/lib/auth/actions';
import { isPremium } from '@/lib/promotions/queries';
import { isIntegrationConfigured } from '@/lib/env';
import { getOwnProfileForEdit } from '@/lib/profiles/queries';
import { getVerificationOverview } from '@/lib/verification/queries';
import { signImagePath } from '@/lib/storage/signed-urls';
import { displayNameOr } from '@/lib/profiles/format';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PushNotificationToggle } from '@/components/notifications/push-toggle';
import { UserAvatar } from '@/components/profile/user-avatar';

export const metadata: Metadata = { title: 'Minha conta', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const PAPEL_LABEL = {
  user: 'Locatário',
  owner: 'Proprietário',
  admin: 'Administrador',
} as const;

/**
 * Painel da conta. Os dados vêm do banco, do usuário autenticado — nada aqui
 * é exemplo.
 */
export default async function MinhaContaPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; senha?: string }>;
}) {
  const user = await requireUser('/minha-conta');
  const params = await searchParams;
  const [premium, perfil, verificacoes] = await Promise.all([
    isPremium(user.id),
    getOwnProfileForEdit(user.id),
    getVerificationOverview(user.id),
  ]);
  const avatarUrl = await signImagePath(perfil?.avatarPath ?? null);
  const pushConfigurado = isIntegrationConfigured('push');
  const nome = displayNameOr(perfil?.publicName ?? null, 'tudo bem');

  const telefoneOk = Boolean(verificacoes.phone.verifiedAt);
  // Primeiro acesso (§46): sugestões curtas e opcionais, nunca uma checklist obrigatória.
  const sugestoes = [
    { feito: Boolean(perfil?.avatarPath), rotulo: 'Adicionar uma foto', href: '/minha-conta/perfil' },
    { feito: Boolean(perfil?.bio), rotulo: 'Escrever uma apresentação curta', href: '/minha-conta/perfil' },
    ...(verificacoes.phone.available
      ? [{ feito: telefoneOk, rotulo: 'Verificar seu telefone', href: '/minha-conta/verificacoes' }]
      : []),
  ];
  const mostrarComeco = sugestoes.some((s) => !s.feito);

  return (
    <>
      <SiteHeader />

      <main id="conteudo" className="mx-auto max-w-4xl px-4 sm:px-6 py-10 space-y-8">
        {params.email === 'confirmado' && (
          <Alert tone="success" title="E-mail confirmado">
            Sua conta está ativa.
          </Alert>
        )}
        {params.senha === 'alterada' && (
          <Alert tone="success" title="Senha alterada">
            Sua nova senha já está valendo.
          </Alert>
        )}

        <header className="flex flex-col sm:flex-row sm:items-center gap-4">
          <UserAvatar url={avatarUrl} name={perfil?.publicName ?? null} size="lg" />
          <div className="min-w-0 space-y-1">
            <h1 className="text-[1.75rem] font-semibold break-words">Olá, {nome}</h1>
            <p className="text-[var(--content-muted)] break-all">
              {user.email} · {PAPEL_LABEL[user.role]}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[0.875rem]">
              <Link href={`/perfil/${user.id}`} className="text-[var(--accent)] underline-offset-4 hover:underline">
                Ver meu perfil público
              </Link>
              <Link href="/minha-conta/perfil" className="text-[var(--accent)] underline-offset-4 hover:underline">
                Editar perfil
              </Link>
            </div>
          </div>
        </header>

        {mostrarComeco && (
          <section aria-labelledby="comeco-titulo" className="rounded-[var(--radius-card)] bg-[var(--surface-sunken)] p-5 space-y-3">
            <div className="space-y-1">
              <h2 id="comeco-titulo" className="font-semibold">
                Seu perfil está começando agora.
              </h2>
              <p className="text-[0.875rem] text-[var(--content-muted)]">
                Complete algumas informações para facilitar sua experiência na plataforma. É opcional.
              </p>
            </div>
            <ul className="space-y-1.5">
              {sugestoes.map((s) => (
                <li key={s.rotulo}>
                  {s.feito ? (
                    <span className="inline-flex items-center gap-2 text-[0.9375rem] text-[var(--content-muted)]">
                      <CircleCheck className="size-4 text-[var(--color-positive)]" aria-hidden />
                      <span className="line-through decoration-[var(--content-subtle)]">{s.rotulo}</span>
                      <span className="sr-only">(feito)</span>
                    </span>
                  ) : (
                    <Link href={s.href} className="inline-flex items-center gap-2 text-[0.9375rem] hover:text-[var(--accent)]">
                      <Circle className="size-4 text-[var(--content-subtle)]" aria-hidden />
                      {s.rotulo}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-[var(--radius-card)] border p-5 sm:p-6 space-y-4">
          <h2 className="font-semibold">Sua conta</h2>
          <dl className="grid gap-4 sm:grid-cols-2 text-[0.9375rem]">
            <div>
              <dt className="text-[var(--content-subtle)] text-[0.8125rem]">Nome completo (privado)</dt>
              <dd className="break-words">{user.fullName ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-[var(--content-subtle)] text-[0.8125rem]">E-mail (privado)</dt>
              <dd className="break-all">{user.email}</dd>
            </div>
            <div>
              <dt className="text-[var(--content-subtle)] text-[0.8125rem]">Situação</dt>
              <dd className="inline-flex items-center gap-1.5">
                <CircleCheck className="size-4 text-[var(--color-positive)]" aria-hidden />
                Ativa
              </dd>
            </div>
            <div>
              <dt className="text-[var(--content-subtle)] text-[0.8125rem]">Verificações</dt>
              <dd>
                <Link href="/minha-conta/verificacoes" className="hover:text-[var(--accent)]">
                  E-mail {verificacoes.email.verifiedAt ? 'verificado' : 'pendente'} · Telefone{' '}
                  {telefoneOk ? 'verificado' : verificacoes.phone.available ? 'não verificado' : 'indisponível'}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-[var(--content-subtle)] text-[0.8125rem]">Termos aceitos em</dt>
              <dd>
                {user.acceptedTermsAt
                  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(user.acceptedTermsAt)
                  : '—'}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-[var(--radius-card)] border p-5 sm:p-6 space-y-3">
          <h2 className="font-semibold">Notificações no celular</h2>
          <p className="text-[0.875rem] text-[var(--content-muted)]">
            Além do sininho aqui no site, você pode receber um aviso de verdade no seu
            celular — reserva aceita, mensagem nova, pagamento — mesmo com o app fechado.
          </p>
          <PushNotificationToggle pushConfigurado={pushConfigurado} />
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">Atalhos</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <Atalho href="/minha-conta/perfil" icon={UserRound} titulo="Perfil" texto="Foto, nome de exibição e apresentação." />
            <Atalho
              href="/minha-conta/verificacoes"
              icon={BadgeCheck}
              titulo="Verificações"
              texto="E-mail e telefone confirmados viram selos no seu perfil."
            />
            <Atalho href="/meus-espacos" icon={House} titulo="Meus espaços" texto="Anúncios, solicitações e recebimentos." />
            <Atalho href="/reservas" icon={CalendarCheck} titulo="Minhas reservas" texto="O que você pediu ou está alugando." />
            <Atalho href="/favoritos" icon={Heart} titulo="Favoritos" texto="Espaços que você salvou." />
            <Atalho
              href={`/perfil/${user.id}#avaliacoes`}
              icon={Star}
              titulo="Avaliações"
              texto="O que disseram de você depois de cada locação."
            />
            <Atalho href="/notificacoes" icon={Bell} titulo="Notificações" texto="Tudo que aconteceu nas suas reservas e anúncios." />
            <Atalho
              href="/notificacoes/preferencias"
              icon={BellRing}
              titulo="Preferências de notificação"
              texto="Escolha o que chega no sininho e no celular."
            />
            <Atalho href="/minha-conta/seguranca" icon={ShieldCheck} titulo="Segurança" texto="Senha, bloqueios e como denunciar." />
            <Atalho
              href="/premium"
              icon={Sparkle}
              titulo={premium ? 'Você é Membro Premium' : 'Conheça o Premium'}
              texto={
                premium
                  ? 'Veja seus Destaques e Turbo disponíveis este mês.'
                  : 'Destaques e Turbo gratuitos todo mês para seus anúncios.'
              }
            />
            <Atalho href="/suporte" icon={LifeBuoy} titulo="Ajuda" texto="Dúvidas, problemas com uma reserva ou pagamento." />
          </div>
        </section>

        {/* No celular é o único "Sair" — o do cabeçalho só aparece em telas maiores. */}
        <form action={signOutAction} className="border-t pt-6">
          <Button type="submit" variant="secondary" size="md">
            <LogOut aria-hidden />
            Sair da conta
          </Button>
        </form>
      </main>

      <SiteFooter />
    </>
  );
}

function Atalho({
  href,
  icon: Icon,
  titulo,
  texto,
}: {
  href: string;
  icon: LucideIcon;
  titulo: string;
  texto: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 rounded-[var(--radius-card)] border p-4 hover:bg-[var(--surface-sunken)] transition-colors"
    >
      <span className="flex gap-3 items-start min-w-0">
        <Icon className="size-4 mt-0.5 shrink-0 text-[var(--accent)]" aria-hidden />
        <span className="min-w-0">
          <span className="block font-medium text-[0.9375rem]">{titulo}</span>
          <span className="block text-[0.875rem] text-[var(--content-muted)] leading-relaxed">{texto}</span>
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-[var(--content-subtle)]" aria-hidden />
    </Link>
  );
}
