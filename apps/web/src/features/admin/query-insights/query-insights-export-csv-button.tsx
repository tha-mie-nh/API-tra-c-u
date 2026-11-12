import { useState } from 'react';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import { FEATURE_PERMISSION_CODES, type QueryInsightsCsvTable } from '@shared/index';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { saveBlob } from '@/lib/save-blob';
import { vi } from '@/i18n/vi';
import { downloadInsightsCsv } from './query-insights-api';
import type { InsightsFilter } from './use-insights-range-search-params';

const t = vi.admin.queryInsights;

interface Props {
  table: QueryInsightsCsvTable;
  /** Human table name for the accessible label. */
  label: string;
  filter: InsightsFilter;
  extra?: Record<string, string | undefined>;
}

/** "Xuất CSV" for one table; renders only with `history:export` (backend also requires view_all). */
export function QueryInsightsExportCsvButton({ table, label, filter, extra }: Props) {
  const canExport = useAuthStore((s) => s.hasPermission(FEATURE_PERMISSION_CODES.HISTORY_EXPORT));
  const [busy, setBusy] = useState(false);
  if (!canExport) return null;

  const run = async () => {
    setBusy(true);
    try {
      const { blob, filename } = await downloadInsightsCsv(table, filter, extra);
      saveBlob(blob, filename);
      toast.success(t.exportDone(null));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t.exportFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button type="button" size="sm" variant="outline" disabled={busy} aria-label={t.exportAria(label)} onClick={run}>
      <Download className="size-4" aria-hidden />
      {busy ? t.exportBusy : t.exportCsv}
    </Button>
  );
}
