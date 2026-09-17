import Image from 'next/image';
import { CalendarCheck, Clock, MapPin, Ruler, ShieldCheck } from 'lucide-react';
import { formatBRL } from '@/lib/money';
import { spaceTypeLabel, type SpaceTypeKey } from '@/lib/spaces/types';
import { Icon } from '@/components/safety/icon';

export type PreviewData = {
  type: string;
  title: string | null;
  description: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  sizeM2: string | null;
  ceilingHeightM: string | null;
  priceMonthlyCents: number | null;
  availableFrom: string | null;
  accessHours: string | null;
  allowedItems: string | null;
  forbiddenItems: string | null;
  rulesText: string | null;
  photos: { id: string; url: string | null; alt: string | null }[];
  features: { key: string; label: string; icon: string | null }[];
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(`${iso}T12:00:00`));
}

/**
 * O anúncio como o público vai ver.
 *
 * Usado na revisão e na página pública. Repare no que NÃO está aqui: rua,
 * número e complemento. Isso não é esquecimento — é o requisito de
 * privacidade. Quem vê o anúncio sabe o bairro, não o endereço.
 */
export function SpacePreview({ data }: { data: PreviewData }) {
  const capa = data.photos[0];
  const resto = data.photos.slice(1, 5);
  const disponivel = formatDate(data.availableFrom);

  return (
    <article className="space-y-6">
      {/* Fotos */}
      {capa ? (
        <div className="space-y-2">
          <div className="relative aspect-[16/10] rounded-[var(--radius-card)] overflow-hidden bg-[var(--surface-sunken)] border">
            {capa.url ? (
              <Image
                src={capa.url} alt={capa.alt ?? data.title ?? 'Foto do espaço'}
                fill sizes="(max-width: 768px) 100vw, 640px"
                className="object-cover" unoptimized priority
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-[0.875rem] text-[var(--content-subtle)]">
                Foto indisponível
              </div>
            )}
          </div>
          {resto.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {resto.map((p, i) => (
                <div key={p.id} className="relative aspect-square rounded-[var(--radius-field)] overflow-hidden bg-[var(--surface-sunken)] border">
                  {p.url && (
                    <Image src={p.url} alt={p.alt ?? `Foto ${i + 2}`} fill sizes="160px" className="object-cover" unoptimized />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="aspect-[16/10] rounded-[var(--radius-card)] border border-dashed grid place-items-center text-[0.875rem] text-[var(--content-subtle)]">
          Sem fotos ainda
        </div>
      )}

      {/* Cabeçalho */}
      <header className="space-y-2">
        <p className="text-[0.8125rem] font-medium uppercase tracking-wide text-[var(--accent)]">
          {spaceTypeLabel(data.type as SpaceTypeKey)}
        </p>
        <h2 className="text-[1.5rem] font-semibold leading-tight">
          {data.title?.trim() || <span className="text-[var(--content-subtle)]">Sem título</span>}
        </h2>
        <p className="flex items-center gap-1.5 text-[var(--content-muted)]">
          <MapPin className="size-4 shrink-0" aria-hidden />
          {[data.district, data.city, data.state].filter(Boolean).join(', ') || 'Localização não informada'}
        </p>
      </header>

      {/* Preço */}
      <div className="flex items-baseline gap-2 pb-5 border-b">
        <span className="text-[1.75rem] font-semibold tabular-nums">
          {data.priceMonthlyCents && data.priceMonthlyCents > 1
            ? formatBRL(data.priceMonthlyCents)
            : '—'}
        </span>
        <span className="text-[var(--content-muted)]">por mês</span>
      </div>

      {/* Dados rápidos */}
      <dl className="grid grid-cols-2 gap-4 text-[0.875rem]">
        {data.sizeM2 && (
          <div className="flex gap-2.5">
            <Ruler className="size-4 mt-0.5 shrink-0 text-[var(--content-muted)]" aria-hidden />
            <div>
              <dt className="text-[var(--content-subtle)] text-[0.75rem]">Área</dt>
              <dd>{Number(data.sizeM2).toLocaleString('pt-BR')} m²</dd>
            </div>
          </div>
        )}
        {data.ceilingHeightM && (
          <div className="flex gap-2.5">
            <Ruler className="size-4 mt-0.5 shrink-0 text-[var(--content-muted)] rotate-90" aria-hidden />
            <div>
              <dt className="text-[var(--content-subtle)] text-[0.75rem]">Pé-direito</dt>
              <dd>{Number(data.ceilingHeightM).toLocaleString('pt-BR')} m</dd>
            </div>
          </div>
        )}
        {disponivel && (
          <div className="flex gap-2.5">
            <CalendarCheck className="size-4 mt-0.5 shrink-0 text-[var(--content-muted)]" aria-hidden />
            <div>
              <dt className="text-[var(--content-subtle)] text-[0.75rem]">Disponível</dt>
              <dd>a partir de {disponivel}</dd>
            </div>
          </div>
        )}
        {data.accessHours && (
          <div className="flex gap-2.5">
            <Clock className="size-4 mt-0.5 shrink-0 text-[var(--content-muted)]" aria-hidden />
            <div>
              <dt className="text-[var(--content-subtle)] text-[0.75rem]">Acesso</dt>
              <dd>{data.accessHours}</dd>
            </div>
          </div>
        )}
      </dl>

      {/* Descrição */}
      {data.description && (
        <section className="space-y-2 pt-5 border-t">
          <h3 className="font-semibold">Sobre o espaço</h3>
          <p className="text-[var(--content-muted)] leading-relaxed whitespace-pre-wrap">
            {data.description}
          </p>
        </section>
      )}

      {/* Características */}
      {data.features.length > 0 && (
        <section className="space-y-3 pt-5 border-t">
          <h3 className="font-semibold">O que este espaço tem</h3>
          <ul className="grid grid-cols-2 gap-2.5 text-[0.875rem]">
            {data.features.map((f) => (
              <li key={f.key} className="flex items-center gap-2">
                {f.icon && <Icon name={f.icon} className="size-4 shrink-0 text-[var(--content-muted)]" />}
                {f.label}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Regras */}
      {(data.allowedItems || data.forbiddenItems || data.rulesText) && (
        <section className="space-y-3 pt-5 border-t">
          <h3 className="font-semibold">Regras do espaço</h3>
          <dl className="space-y-3 text-[0.875rem]">
            {data.allowedItems && (
              <div>
                <dt className="text-[var(--content-subtle)] text-[0.75rem]">Pode guardar</dt>
                <dd className="text-[var(--content-muted)] whitespace-pre-wrap">{data.allowedItems}</dd>
              </div>
            )}
            {data.forbiddenItems && (
              <div>
                <dt className="text-[var(--content-subtle)] text-[0.75rem]">Não pode</dt>
                <dd className="text-[var(--content-muted)] whitespace-pre-wrap">{data.forbiddenItems}</dd>
              </div>
            )}
            {data.rulesText && (
              <div>
                <dt className="text-[var(--content-subtle)] text-[0.75rem]">Outras informações</dt>
                <dd className="text-[var(--content-muted)] whitespace-pre-wrap">{data.rulesText}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      <p className="flex gap-2 items-start pt-4 border-t text-[0.75rem] text-[var(--content-subtle)] leading-relaxed">
        <ShieldCheck className="size-4 shrink-0 mt-px text-[var(--accent)]" aria-hidden />
        O endereço completo não aparece aqui. Ele só é revelado a quem alugar, depois que você
        aceitar a reserva.
      </p>
    </article>
  );
}
