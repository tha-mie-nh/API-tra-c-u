import type { AuditLogEntry } from '@shared/index';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDateTime } from '@/lib/format';
import { vi } from '@/i18n/vi';

interface AuditDiffDialogProps {
  entry: AuditLogEntry | null;
  onOpenChange: (open: boolean) => void;
}

function formatJson(value: unknown): string {
  if (value === null || value === undefined) return vi.admin.audit.diffEmpty;
  return JSON.stringify(value, null, 2);
}

/**
 * Before/after diff viewer (Phase 08 step 11) — rendered as plain escaped
 * text inside `<pre>`, never `dangerouslySetInnerHTML` (phase-08 Security
 * Considerations). Secrets (password/token) are already redacted server-side
 * by `AuditService.stripSecrets`.
 */
export function AuditDiffDialog({ entry, onOpenChange }: AuditDiffDialogProps) {
  return (
    <Dialog open={!!entry} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{vi.admin.audit.diffTitle}</DialogTitle>
        </DialogHeader>
        {entry && (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-muted-foreground text-xs">
              {entry.action} — {formatDateTime(entry.createdAt)}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <p className="text-muted-foreground text-xs font-medium">{vi.admin.audit.diffBefore}</p>
                <pre className="bg-muted max-h-64 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap">
                  {formatJson(entry.before)}
                </pre>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-muted-foreground text-xs font-medium">{vi.admin.audit.diffAfter}</p>
                <pre className="bg-muted max-h-64 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap">
                  {formatJson(entry.after)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
