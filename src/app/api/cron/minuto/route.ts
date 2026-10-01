import { NextResponse, type NextRequest } from 'next/server';
import { requireIntegration, IntegrationNotConfiguredError } from '@/lib/env';
import { timingSafeEqualStrings } from '@/lib/security/tokens';
import { runRentalMaintenance } from '@/lib/rentals/maintenance';

/**
 * GET /api/cron/minuto — manutenção do aluguel pelo relógio (Parte 12).
 *
 * A cada minuto: encerra o que venceu (prazo para pagar, janela de 7 minutos
 * para renovar, prazo final do pagamento pendente), manda os avisos ("Seu
 * aluguel termina em 10 minutos.", "último prazo", "encerrado") e executa no
 * gateway o que o banco marcou (cancelar recorrência, excluir cobrança,
 * estornar). Tudo idempotente: chamar duas vezes no mesmo minuto não
 * duplica aviso nem estorno.
 *
 * A CORREÇÃO não depende desta rota — disponibilidade e prazos são
 * calculados pelo relógio do banco, e as telas encerram o que venceu antes
 * de mostrar. Ela existe para o que precisa acontecer na hora certa mesmo
 * sem ninguém abrir o app (avisos e efeitos no gateway).
 *
 * NÃO está no vercel.json de propósito: o plano Hobby da Vercel recusa
 * agendamento por minuto. Quem chama é um agendador externo (ver
 * docs/SETUP.md) com `Authorization: Bearer <CRON_SECRET>` — o mesmo segredo
 * do job diário, que também roda esta manutenção como rede de segurança.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  let cronSecret: string;
  try {
    ({ CRON_SECRET: cronSecret } = requireIntegration('cron'));
  } catch (err) {
    if (err instanceof IntegrationNotConfiguredError) {
      console.error('[cron minuto] recebido antes do CRON_SECRET estar configurado:', err.message);
      return NextResponse.json({ ok: false, reason: 'integracao nao configurada' }, { status: 503 });
    }
    throw err;
  }

  const auth = request.headers.get('authorization') ?? '';
  const recebido = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!recebido || !timingSafeEqualStrings(recebido, cronSecret)) {
    console.error('[cron minuto] token invalido ou ausente');
    return NextResponse.json({ ok: false, reason: 'token invalido' }, { status: 401 });
  }

  const resumo = await runRentalMaintenance();
  return NextResponse.json({ ok: true, ...resumo });
}
