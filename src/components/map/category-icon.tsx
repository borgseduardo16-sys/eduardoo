import { Building2, Car, Factory, Package, PartyPopper, Shapes, Store, Trees, Wrench, type LucideIcon } from 'lucide-react';
import { categoryInfo, type MapCategoryKey } from '@/lib/spaces/categories';

/** Um ícone vetorial por categoria do mapa (garagem, armazenamento, loja, escritório, galpão, terreno, eventos, oficina). */
const ICONES: Record<MapCategoryKey, LucideIcon> = {
  garagem: Car,
  armazenamento: Package,
  loja: Store,
  escritorio: Building2,
  galpao: Factory,
  terreno: Trees,
  eventos: PartyPopper,
  oficina: Wrench,
  outros: Shapes,
};

export function CategoryIcon({ category, className }: { category: MapCategoryKey; className?: string }) {
  const Icone = ICONES[category] ?? Shapes;
  return <Icone className={className} aria-hidden />;
}

export function categoryLabel(category: MapCategoryKey): string {
  return categoryInfo(category).label;
}
