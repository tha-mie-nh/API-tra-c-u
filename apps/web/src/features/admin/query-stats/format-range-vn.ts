import { formatDate } from '@/lib/format';

/** Half-open ISO [from, to) -> "dd-MM-yyyy → dd-MM-yyyy" (inclusive end, Vietnam time). */
export function formatRangeVn(from: string, to: string): string {
  const last = new Date(Date.parse(to) - 1).toISOString();
  return `${formatDate(from)} → ${formatDate(last)}`;
}
