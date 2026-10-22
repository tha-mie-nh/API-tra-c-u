import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Upstream (spec upstream) always sends a full `data:image/...;base64,...`
 * URI in fields like `hinhAnh`; if a raw base64 string ever arrives without
 * the prefix, default to PNG rather than rendering a broken `<img>`. */
function toDataUri(value: string): string {
  return value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
}

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
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          <img src={src} alt={label} className="w-full rounded-md" />
        </DialogContent>
      </Dialog>
    </>
  );
}
