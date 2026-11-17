import { useState } from 'react';
import { toDataUri } from './photo-record-utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * Renders a base64 image (`FieldType: "image"`) inline in `InfoRecordTable`
 * — no MinIO/proxy involved (the GPLX/face-photo APIs send the image bytes
 * directly in the JSON response). Thumbnail in the table, click to zoom in
 * a dialog. Thumbnail size is deliberately larger than a typical table
 * avatar (review feedback: default was too small to make out a face/GPLX
 * photo at a glance).
 */
export function Base64ImageCell({ value, label }: { value: string; label: string }) {
  const [open, setOpen] = useState(false);
  const src = toDataUri(value);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="shrink-0 transition-opacity hover:opacity-80">
        <img src={src} alt={label} className="size-64 rounded-md border object-cover shadow-sm" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[80vw] sm:max-w-[80vw]">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          <img src={src} alt={label} className="mx-auto h-[78vh] max-w-full rounded-md object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}
