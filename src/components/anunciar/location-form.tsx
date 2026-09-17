'use client';

import { useActionState, useState } from 'react';
import { Search } from 'lucide-react';
import { saveStepAction, type SpaceActionState } from '@/lib/spaces/actions';
import { lookupCep, formatCep, CepError } from '@/lib/maps/cep';
import { UFS } from '@/lib/spaces/types';
import { LocationPicker, type LatLng } from '@/components/map/location-picker';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { StepActions } from './step-actions';
import { useAdvanceOnSave } from './use-advance';

type Initial = {
  postalCode: string | null; state: string | null; city: string | null;
  district: string | null; street: string | null; number: string | null;
  complement: string | null; lat: number | null; lng: number | null;
};

export function LocationForm({ spaceId, initial }: { spaceId: string; initial: Initial }) {
  const [state, action] = useActionState<SpaceActionState | undefined, FormData>(
    saveStepAction,
    undefined,
  );

  const [cep, setCep] = useState(initial.postalCode ? formatCep(initial.postalCode) : '');
  const [uf, setUf] = useState(initial.state ?? '');
  const [city, setCity] = useState(initial.city ?? '');
  const [district, setDistrict] = useState(initial.district ?? '');
  const [street, setStreet] = useState(initial.street ?? '');

  const [pin, setPin] = useState<LatLng | null>(
    initial.lat != null && initial.lng != null ? { lat: initial.lat, lng: initial.lng } : null,
  );

  const [cepStatus, setCepStatus] = useState<'idle' | 'buscando' | 'erro'>('idle');
  const [cepError, setCepError] = useState<string | null>(null);

  useAdvanceOnSave(state?.ok, `/anunciar/${spaceId}/caracteristicas`);

  async function buscarCep() {
    setCepStatus('buscando');
    setCepError(null);
    try {
      const r = await lookupCep(cep);
      setUf(r.state);
      setCity(r.city);
      if (r.district) setDistrict(r.district);
      if (r.street) setStreet(r.street);
      setCepStatus('idle');
    } catch (err) {
      setCepStatus('erro');
      setCepError(
        err instanceof CepError ? err.message : 'Não foi possível consultar o CEP agora.',
      );
    }
  }

  const err = (k: string) => state?.fieldErrors?.[k]?.[0];

  return (
    <form action={action} noValidate>
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="step" value="localizacao" />
      <input type="hidden" name="lat" value={pin?.lat ?? ''} />
      <input type="hidden" name="lng" value={pin?.lng ?? ''} />

      {state?.message && !state.ok && (
        <Alert tone="critical" className="mb-5">{state.message}</Alert>
      )}

      <div className="space-y-5">
        {/* CEP com busca */}
        <div className="space-y-1.5">
          <label htmlFor="cep" className="text-sm font-medium">
            CEP <span className="font-normal text-[var(--content-subtle)]">(opcional)</span>
          </label>
          <div className="flex gap-2">
            <Input
              id="cep"
              name="postalCode"
              value={cep}
              onChange={(e) => setCep(formatCep(e.target.value))}
              placeholder="29700-000"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={9}
              className="flex-1"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={buscarCep}
              loading={cepStatus === 'buscando'}
              disabled={cep.replace(/\D/g, '').length !== 8}
              className="shrink-0"
            >
              {cepStatus !== 'buscando' && <Search className="size-4" aria-hidden />}
              Buscar
            </Button>
          </div>
          {cepError ? (
            <p role="alert" className="text-[0.8125rem] text-[var(--color-caution)]">{cepError}</p>
          ) : (
            <p className="text-[0.8125rem] text-[var(--content-muted)]">
              Preenche o endereço automaticamente. Você pode digitar tudo à mão também.
            </p>
          )}
        </div>

        <div className="grid grid-cols-[6rem_1fr] gap-3">
          <Field label="Estado" htmlFor="state" error={err('state')}>
            <select
              id="state"
              name="state"
              value={uf}
              onChange={(e) => setUf(e.target.value)}
              required
              className="w-full h-11 px-3 rounded-[var(--radius-field)] bg-[var(--surface)] border border-[var(--border-strong)] text-base md:text-[0.9375rem] focus:outline-none focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]/20"
            >
              <option value="">UF</option>
              {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>

          <Field label="Cidade" htmlFor="city" error={err('city')}>
            <Input
              name="city" value={city} onChange={(e) => setCity(e.target.value)}
              autoComplete="address-level2" required
            />
          </Field>
        </div>

        <Field label="Bairro" htmlFor="district" error={err('district')}>
          <Input
            name="district" value={district} onChange={(e) => setDistrict(e.target.value)}
            autoComplete="address-level3" required
          />
        </Field>

        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Field label="Rua" htmlFor="street" error={err('street')}>
            <Input
              name="street" value={street} onChange={(e) => setStreet(e.target.value)}
              autoComplete="address-line1" required
            />
          </Field>
          <Field label="Número" htmlFor="number" error={err('number')}>
            <Input name="number" defaultValue={initial.number ?? ''} inputMode="numeric" required />
          </Field>
        </div>

        <Field label="Complemento" htmlFor="complement" optional error={err('complement')}
          hint="Bloco, fundos, ao lado do portão azul…">
          <Input name="complement" defaultValue={initial.complement ?? ''} />
        </Field>

        {/* Mapa */}
        <div className="space-y-2 pt-2">
          <h2 className="text-sm font-medium">Marque o local no mapa</h2>
          {(err('lat') || err('lng')) && (
            <p role="alert" className="text-[0.8125rem] text-[var(--color-critical)]">
              {err('lat') ?? err('lng')}
            </p>
          )}
          <LocationPicker value={pin} onChange={setPin} />
        </div>
      </div>

      <StepActions backHref="/anunciar" />
    </form>
  );
}
