'use client';

import { useState, useTransition, useId } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle, LocateFixed, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

/** Sugestões do campo "o que você precisa". Casam com os tipos do banco. */
const TIPOS = [
  { value: 'garagem', label: 'Garagem' },
  { value: 'vaga_carro', label: 'Vaga' },
  { value: 'deposito', label: 'Depósito' },
  { value: 'galpao', label: 'Galpão' },
  { value: 'sala', label: 'Sala' },
  { value: 'terreno', label: 'Terreno' },
] as const;

type GeoState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'granted'; lat: number; lng: number }
  | { status: 'error'; message: string };

/**
 * Busca principal.
 *
 * A geolocalização é real: usa a API do navegador e trata cada caso de recusa
 * com a mensagem correspondente. Quando não dá para obter a posição, o campo
 * de endereço continua ali e funcionando — nunca inventamos uma localização
 * nem deixamos o usuário sem saída.
 */
export function SearchBar({ className, autoFocus = false }: { className?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [geo, setGeo] = useState<GeoState>({ status: 'idle' });
  const [tipo, setTipo] = useState('');
  const [onde, setOnde] = useState('');

  function usarMinhaLocalizacao() {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGeo({
        status: 'error',
        message: 'Este navegador não oferece localização. Digite o bairro ou a cidade abaixo.',
      });
      return;
    }

    setGeo({ status: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({
          status: 'granted',
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
        setOnde('');
      },
      (err) => {
        const mensagens: Record<number, string> = {
          1: 'Você não permitiu o acesso à localização. Para usar essa opção, libere a permissão nas configurações do navegador — ou digite o bairro e a cidade abaixo.',
          2: 'Não conseguimos determinar sua posição agora. Digite o bairro ou a cidade abaixo.',
          3: 'A busca por localização demorou demais. Tente de novo ou digite o endereço abaixo.',
        };
        setGeo({
          status: 'error',
          message: mensagens[err.code] ?? 'Não foi possível obter sua localização.',
        });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (tipo) params.set('tipo', tipo);

    if (geo.status === 'granted') {
      params.set('lat', String(geo.lat));
      params.set('lng', String(geo.lng));
      params.set('raio', '5000');
    } else if (onde.trim()) {
      params.set('onde', onde.trim());
    }

    startTransition(() => router.push(`/espacos?${params.toString()}`));
  }

  return (
    <div className={cn('space-y-3', className)}>
      <form
        onSubmit={submit}
        className={cn(
          'bg-[var(--surface-raised)] rounded-[var(--radius-card)] p-2',
          'border shadow-[var(--shadow-raised)]',
          'flex flex-col md:flex-row md:items-center gap-2',
        )}
      >
        <div className="flex-1 min-w-0 px-3 py-2">
          <label htmlFor={`${id}-tipo`} className="block text-2xs font-medium text-[var(--content-subtle)] uppercase tracking-wide">
            O que você precisa?
          </label>
          <input
            id={`${id}-tipo`}
            list={`${id}-tipos`}
            value={tipo ? (TIPOS.find((t) => t.value === tipo)?.label ?? tipo) : ''}
            onChange={(e) => {
              const match = TIPOS.find((t) => t.label.toLowerCase() === e.target.value.toLowerCase());
              setTipo(match ? match.value : e.target.value);
            }}
            placeholder="Garagem, depósito, galpão…"
            autoFocus={autoFocus}
            className="w-full bg-transparent border-0 p-0 mt-0.5 text-base md:text-[0.9375rem] placeholder:text-[var(--content-subtle)] focus:outline-none"
          />
          <datalist id={`${id}-tipos`}>
            {TIPOS.map((t) => (
              <option key={t.value} value={t.label} />
            ))}
          </datalist>
        </div>

        <div className="hidden md:block w-px self-stretch my-2 bg-[var(--border)]" aria-hidden />

        <div className="flex-1 min-w-0 px-3 py-2 border-t md:border-t-0">
          <label htmlFor={`${id}-onde`} className="block text-2xs font-medium text-[var(--content-subtle)] uppercase tracking-wide">
            Onde?
          </label>
          <input
            id={`${id}-onde`}
            value={geo.status === 'granted' ? 'Perto de mim' : onde}
            onChange={(e) => {
              setOnde(e.target.value);
              if (geo.status === 'granted') setGeo({ status: 'idle' });
            }}
            placeholder="Bairro, cidade ou CEP"
            autoComplete="address-level2"
            className="w-full bg-transparent border-0 p-0 mt-0.5 text-base md:text-[0.9375rem] placeholder:text-[var(--content-subtle)] focus:outline-none"
          />
        </div>

        <Button type="submit" size="lg" loading={pending} className="md:w-auto w-full shrink-0">
          {!pending && <Search aria-hidden />}
          Encontrar espaços
        </Button>
      </form>

      <div className="flex items-center gap-3 px-1">
        <button
          type="button"
          onClick={usarMinhaLocalizacao}
          disabled={geo.status === 'locating'}
          className="inline-flex items-center gap-2 text-[0.875rem] text-[var(--content-muted)] hover:text-[var(--accent)] transition-colors disabled:opacity-60"
        >
          {geo.status === 'locating' ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
          ) : (
            <LocateFixed className="size-4" aria-hidden />
          )}
          {geo.status === 'locating' ? 'Obtendo sua localização…' : 'Usar minha localização'}
        </button>

        {geo.status === 'granted' && (
          <span className="text-[0.8125rem] text-[var(--color-positive)]">
            Localização obtida
          </span>
        )}
      </div>

      {geo.status === 'error' && <Alert tone="warning">{geo.message}</Alert>}
    </div>
  );
}
