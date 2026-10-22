import { useState } from 'react';
import { toast } from 'sonner';
import { Copy } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { vi } from '@/i18n/vi';

interface TempPasswordResult {
  username: string;
  tempPassword: string;
}

interface ResetPasswordResultDialogProps {
  result: TempPasswordResult | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Shows a temp password (from create-user or reset-password) exactly once
 * (phase-08 Key Insight + Security Considerations): copy-to-clipboard,
 * explicit "will not be shown again" warning, never logged to console or
 * persisted beyond this dialog's local state.
 */
export function ResetPasswordResultDialog({ result, onOpenChange }: ResetPasswordResultDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.tempPassword);
    setCopied(true);
    toast.success(vi.admin.users.copied);
  };

  return (
    <Dialog
      open={!!result}
      onOpenChange={(open) => {
        if (!open) setCopied(false);
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{vi.admin.users.resetPasswordResultTitle}</DialogTitle>
        </DialogHeader>
        {result && (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              {result.username}: <span className="bg-muted rounded px-2 py-1 font-mono text-sm">{result.tempPassword}</span>
            </p>
            <p className="text-destructive text-xs">{vi.admin.users.resetPasswordWarning}</p>
          </div>
        )}
        <DialogFooter>
          <Button type="button" onClick={handleCopy}>
            <Copy data-icon="inline-start" />
            {copied ? vi.admin.users.copied : vi.admin.users.copyButton}
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {vi.adminCommon.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
