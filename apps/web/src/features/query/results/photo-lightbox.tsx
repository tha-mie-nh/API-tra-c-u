import Lightbox from 'yet-another-react-lightbox';
import type { SlideImage } from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';
import type { QueryColumn, QueryRecord } from '@shared/index';
import { formatDate, formatDateTime } from '@/lib/format';
import { useAuthorizedImage } from '../use-authorized-image';
import { vi } from '@/i18n/vi';

const RECORD_ID_FIELD = 'recordId';

/** One slide's payload — `src` is unused (kept `''` to satisfy the library's
 * `SlideImage` shape); `PhotoSlideView` fetches the real bytes through the
 * authenticated proxy instead, never a raw MinIO URL. */
type PhotoSlide = SlideImage & { record: QueryRecord };

interface PhotoLightboxProps {
  code: string;
  columns: QueryColumn[];
  records: QueryRecord[];
  index: number;
  onClose: () => void;
}

/** Full image + all non-internal metadata fields, keyboard nav (arrows/Esc)
 * via `yet-another-react-lightbox`'s own controller (phase-07 Implementation
 * Step 10) — only the slide's pixel content is custom-rendered. */
export function PhotoLightbox({ code, columns, records, index, onClose }: PhotoLightboxProps) {
  const slides: PhotoSlide[] = records.map((record) => ({ src: '', record }));

  return (
    <Lightbox
      open
      close={onClose}
      index={index}
      slides={slides}
      render={{ slide: ({ slide }) => <PhotoSlideView code={code} columns={columns} slide={slide as PhotoSlide} /> }}
    />
  );
}

function PhotoSlideView({ code, columns, slide }: { code: string; columns: QueryColumn[]; slide: PhotoSlide }) {
  const recordId = slide.record[RECORD_ID_FIELD];
  const path = typeof recordId === 'string' ? `/query/${code}/image/${recordId}` : null;
  const { url, isLoading, error } = useAuthorizedImage(path);

  return (
    <div className="flex max-h-full w-full max-w-2xl flex-col items-center gap-3 p-4">
      {url && <img src={url} alt="" className="max-h-[65vh] max-w-full rounded-md object-contain" />}
      {isLoading && <p className="text-sm text-white">{vi.common.loading}</p>}
      {error && <p className="text-destructive-foreground rounded bg-red-900/60 px-3 py-1 text-sm">{vi.query.imageLoadError}</p>}
      <dl className="grid w-full grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-black/50 p-3 text-sm text-white">
        {columns
          .filter((col) => slide.record[col.name] !== undefined && slide.record[col.name] !== null)
          .map((col) => (
            <div key={col.name} className="contents">
              <dt className="text-white/70">{col.label}</dt>
              <dd>{formatFieldValue(slide.record[col.name], col.type)}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}

function formatFieldValue(value: unknown, type: QueryColumn['type']): string {
  if (type === 'datetime') return formatDateTime(String(value));
  if (type === 'date') return formatDate(String(value));
  return String(value);
}
