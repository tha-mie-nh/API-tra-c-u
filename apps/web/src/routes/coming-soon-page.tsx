import { Construction } from 'lucide-react';
import { StatusPage } from '@/components/layout/status-page';
import { vi } from '@/i18n/vi';

/** Placeholder for routes owned by Phase 07 (dynamic query/timeline UI) and
 * Phase 08 (admin/history UI) — not yet implemented. Keeps sidebar links
 * from Phase 06 fully clickable end-to-end without pretending to build
 * those phases' features. */
export function ComingSoonPage({ title }: { title: string }) {
  return (
    <StatusPage icon={<Construction className="text-muted-foreground size-10" />} title={title} body={vi.common.comingSoon} />
  );
}
