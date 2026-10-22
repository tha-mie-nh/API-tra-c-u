import { Search, Plane, IdCard, Car, HeartHandshake, type LucideIcon } from 'lucide-react';

/**
 * Presentation-only code→icon lookup for the "Tra cứu" nav/home cards.
 * NOT part of the config-driven core: a datasource works correctly with zero
 * entry here (falls back to a generic search icon) — this map only decides
 * which glyph to draw next to a name that already came from `config.json`.
 * Never gate visibility/behaviour on `code` here or anywhere else in
 * features/query — see `no-hardcoded-datasource-code.test.ts`.
 */
const DATASOURCE_ICONS: Record<string, LucideIcon> = {
  XUAT_NHAP_CANH: Plane,
  CCCD_HISTORY: IdCard,
  VEHICLE_OWNERSHIP: Car,
  FAMILY_EVENTS: HeartHandshake,
};

export function DatasourceIcon({ code, className }: { code: string; className?: string }) {
  const Icon = DATASOURCE_ICONS[code] ?? Search;
  return <Icon className={className} />;
}
