import { useState } from 'react';
import type { QueryColumn, QueryEnvelope, QueryRecordGroup } from '@shared/index';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/format';
import { vi } from '@/i18n/vi';
import { LazyAuthorizedImage } from './lazy-authorized-image';
import { PhotoLightbox } from './photo-lightbox';

/** Convention used by every `type: "image"` datasource config so far (see
 * `config/config.json`): the per-photo row id is exposed as the output field
 * named `recordId`. `ClientDatasource` has no formal "which field is the
 * image id" marker (Unresolved Question — see report), so this name is the
 * one documented contract point, not a per-datasource-code branch. */
const RECORD_ID_FIELD = 'recordId';

interface PhotoTimelineProps {
  envelope: QueryEnvelope;
  code: string;
}

/** `type: "image"` results: one card per person, thumbnails ordered by the
 * configured `timestampField` (already sorted server-side), each captioned
 * with its update timestamp (spec a) — click opens the lightbox (phase-07
 * Implementation Step 9). */
export function PhotoTimeline({ envelope, code }: PhotoTimelineProps) {
  return (
    <div className="flex flex-col gap-4">
      {envelope.groups.map((group) => (
        <PhotoGroupCard
          key={group.identity}
          group={group}
          columns={envelope.columns}
          code={code}
          timestampField={envelope.timestampField}
        />
      ))}
    </div>
  );
}

interface PhotoGroupCardProps {
  group: QueryRecordGroup;
  columns: QueryColumn[];
  code: string;
  timestampField: string;
}

function PhotoGroupCard({ group, columns, code, timestampField }: PhotoGroupCardProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const photos = group.records.filter((record) => typeof record[RECORD_ID_FIELD] === 'string');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{group.label}</CardTitle>
        {group.identity !== group.label && <CardDescription>{group.identity}</CardDescription>}
      </CardHeader>
      <CardContent>
        {photos.length === 0 ? (
          <p className="text-muted-foreground text-sm">{vi.query.noPhotos}</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {photos.map((record, index) => {
              const recordId = record[RECORD_ID_FIELD] as string;
              const timestamp = record[timestampField];
              return (
                <button
                  key={recordId}
                  type="button"
                  className="flex flex-col gap-1 text-left"
                  onClick={() => setLightboxIndex(index)}
                >
                  <LazyAuthorizedImage path={`/query/${code}/image/${recordId}/thumb`} alt={group.label} className="aspect-square w-full" />
                  <span className="text-muted-foreground text-xs">
                    {typeof timestamp === 'string' ? formatDateTime(timestamp) : '—'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
      {lightboxIndex !== null && (
        <PhotoLightbox code={code} columns={columns} records={photos} index={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </Card>
  );
}
