import { useState } from 'react';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import { FEATURE_PERMISSION_CODES, HISTORY_EXPORT_MAX_ROWS, type QueryLogFilterParams } from '@shared/index';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { saveBlob } from '@/lib/save-blob';
import { formatNumber } from '@/lib/format';
import { vi } from '@/i18n/vi';
import { downloadHistoryCsv } from './history-api';

/** "Xuất CSV" for the CURRENT filter; renders only with `history:export`. */
export function HistoryExportCsvButton({ filter }: { filter: QueryLogFilterParams }) {
  const canExport = useAuthStore((s) => s.hasPermission(FEATURE_PERMISSION_CODES.HISTORY_EXPORT));
  const [busy, setBusy] = useState(false);
  if (!canExport) return null;

  const run = async () => {
    setBusy(true);
    try {
      const result = await downloadHistoryCsv(filter);
      saveBlob(result.blob, result.filename);
      if (result.truncated) toast.warning(vi.history.exportCsvTruncated(formatNumber(HISTORY_EXPORT_MAX_ROWS)));
      else toast.success(vi.history.exportCsvDone(result.exported));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : vi.history.exportCsvFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button type="button" variant="outline" disabled={busy} onClick={run}>
      <Download className="size-4" aria-hidden />
      {busy ? vi.history.exportCsvBusy : vi.history.exportCsv}
    </Button>
  );
}
