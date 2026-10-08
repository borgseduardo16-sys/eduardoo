import type { Metadata } from 'next';
import { settingInt } from '@/lib/settings';
import { loadFeePolicy } from '@/lib/bookings/fees';
import { isPremiumFinancial } from '@/lib/premium/queries';
import { loadDraftStep } from '@/lib/spaces/load-step';
import { todayInSaoPaulo } from '@/lib/dates';
import { WizardShell } from '@/components/anunciar/wizard-shell';
import { PriceForm } from '@/components/anunciar/price-form';

export const metadata: Metadata = { title: 'Como alugar · Anunciar' };

/** As taxas e o mínimo vêm do banco: mudar a política não exige alterar código. */
export default async function PrecoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ space }, minRent, politica] = await Promise.all([
    loadDraftStep(id),
    settingInt('booking.min_rent_cents', 3500),
    loadFeePolicy(),
  ]);
  // Premium PAGO e vigente do dono do rascunho (loadDraftStep já garante que é de quem está logado).
  const premiumFinanceiro = await isPremiumFinancial(space.ownerId);

  return (
    <WizardShell
      spaceId={id} currentStep="preco" reachedStep={space.draftStep}
      title="Como você quer alugar?"
      description="Aluguel mensal, com renovação todo mês. Defina o valor e quantas unidades você oferece. Dá para mudar depois: locação em andamento continua com o valor combinado."
    >
      <PriceForm
        spaceId={id}
        spaceType={space.type}
        initial={{
          priceMonthlyCents: space.priceMonthlyCents,
          quantityOffered: space.quantityOffered,
          quantityTotal: space.quantityTotal,
          availableFrom: space.availableFrom,
        }}
        today={todayInSaoPaulo()}
        minRentCents={minRent}
        ownerFeePolicy={politica.owner}
        premiumFinancial={premiumFinanceiro}
        renterFeeBps={politica.renterFeeBps}
        occupied={space.quantityOffered - space.quantityAvailable}
      />
    </WizardShell>
  );
}
