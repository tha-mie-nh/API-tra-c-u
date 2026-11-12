import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { vi } from '@/i18n/vi';

/** Icon button copying `value`; `label` names what is copied (for screen readers). */
export function CopyToClipboardButton({ value, label }: { value: string; label: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(vi.history.detailCopied);
    } catch {
      toast.error(vi.history.detailCopyFailed);
    }
  };
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={`${vi.history.detailCopy} ${label}`}
      onClick={copy}
    >
      <Copy className="size-3.5" aria-hidden />
    </Button>
  );
}
