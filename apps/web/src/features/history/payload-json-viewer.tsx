import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { saveBlob } from '@/lib/save-blob';
import { vi } from '@/i18n/vi';
import { CopyToClipboardButton } from './copy-to-clipboard-button';

interface TruncatedLike { $truncated: true; originalBytes: number; preview: string }
interface ImageLike { $image: true; bytes: number; sha256: string; mime: string | null }

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const isTruncated = (v: unknown): v is TruncatedLike => isObject(v) && v.$truncated === true && typeof v.originalBytes === 'number';
const isImage = (v: unknown): v is ImageLike => isObject(v) && v.$image === true && typeof v.bytes === 'number';

/** Pretty text of any value (strings shown raw). Always rendered as TEXT inside <pre> — never HTML. */
function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2) ?? String(value);
}

interface PayloadJsonViewerProps {
  /** Section heading; also used for the download file name + aria labels. */
  title: string;
  /** Download file name without extension. */
  fileName: string;
  value: unknown;
}

/** Read-only viewer: copy, download .json, line/size indicator, special rendering for truncated/image markers. */
export function PayloadJsonViewer({ title, fileName, value }: PayloadJsonViewerProps) {
  const truncated = isTruncated(value) ? value : null;
  const image = isImage(value) ? value : null;
  const text = toText(truncated ? truncated.preview : value);
  const bytes = new Blob([text]).size;
  const lines = text.split('\n').length;

  const download = () => {
    const json = JSON.stringify(value, null, 2) ?? 'null';
    saveBlob(new Blob([json], { type: 'application/json' }), `${fileName}.json`);
  };

  return (
    <section className="flex flex-col gap-1" aria-label={title}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-muted-foreground text-xs font-medium">{title}</h4>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground text-xs">{vi.history.jsonStats(lines, bytes)}</span>
          <CopyToClipboardButton value={text} label={`${title} (${vi.history.jsonCopy})`} />
          <Button type="button" variant="ghost" size="sm" aria-label={vi.history.jsonDownloadLabel(title)} onClick={download}>
            <Download className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>
      {truncated && (
        <p role="note" className="text-xs font-medium text-amber-600">
          {vi.history.jsonTruncated(truncated.originalBytes)}
        </p>
      )}
      {image ? (
        <p className="bg-muted rounded-md p-2 text-xs break-all">{vi.history.jsonImage(image.bytes, image.sha256, image.mime)}</p>
      ) : (
        <pre className="bg-muted max-h-72 overflow-auto rounded-md p-2 text-xs break-all whitespace-pre-wrap">{text}</pre>
      )}
    </section>
  );
}
