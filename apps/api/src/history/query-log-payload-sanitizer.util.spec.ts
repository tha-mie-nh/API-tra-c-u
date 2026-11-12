import type { DatasourceEntry } from '@app/shared';
import { collectImageKeys, sanitizePayloadParts } from './query-log-payload-sanitizer.util';

const PNG_B64 = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 7)]).toString('base64');
const request = (headers: Record<string, string>) => ({
  transport: 'http' as const, method: 'POST', url: 'http://x/y', headers, body: { a: 1 }, attempt: 1,
});
const base = { upstreamRequest: null, upstreamResponse: null, clientResponse: null };

describe('sanitizePayloadParts', () => {
  const opts = { maxBytes: 1000, imageKeys: new Set(['photo', 'raw_photo']) };

  it('never keeps secret header values (even if the adapter forgot)', () => {
    const out = sanitizePayloadParts(
      { ...base, upstreamRequest: request({ 'content-type': 'application/json', authorization: 'Bearer S3CR3T', 'X-Api-Key': 'S3CR3T', 'x-custom-token': 'S3CR3T' }) },
      opts,
    );
    expect(JSON.stringify(out)).not.toContain('S3CR3T');
    expect(out.upstreamRequest?.headers['content-type']).toBe('application/json');
  });

  it('replaces data-URI images and image-keyed raw base64 with placeholders', () => {
    const out = sanitizePayloadParts(
      { ...base, clientResponse: { rows: [{ photo: `data:image/png;base64,${PNG_B64}`, other: 'x' }] }, upstreamResponse: { statusCode: 200, durationMs: 1, error: null, body: { raw_photo: PNG_B64, id: 'short' } } },
      { ...opts, maxBytes: 100_000 },
    );
    const photo = (out.clientResponse as { rows: { photo: Record<string, unknown> }[] }).rows[0]?.photo;
    expect(photo).toMatchObject({ $image: true, bytes: 208, mime: 'image/png' });
    expect(photo?.sha256).toMatch(/^[0-9a-f]{64}$/);
    const raw = (out.upstreamResponse?.body as { raw_photo: Record<string, unknown>; id: string });
    expect(raw.raw_photo).toMatchObject({ $image: true, mime: 'image/png' });
    expect(raw.id).toBe('short');
    expect(JSON.stringify(out)).not.toContain(PNG_B64);
  });

  it('does not touch a short value under an image key', () => {
    const out = sanitizePayloadParts({ ...base, clientResponse: { photo: 'abc123' } }, opts);
    expect(out.clientResponse).toEqual({ photo: 'abc123' });
  });

  it('truncates only the oversized part', () => {
    const out = sanitizePayloadParts({ ...base, clientResponse: { big: 'x'.repeat(5000) }, upstreamResponse: { statusCode: 200, durationMs: 1, error: null, body: 'ok' } }, opts);
    expect(out.clientResponse).toMatchObject({ $truncated: true, originalBytes: expect.any(Number) });
    expect((out.clientResponse as { preview: string }).preview.length).toBe(2048);
    expect(out.upstreamResponse?.body).toBe('ok');
  });

  it('keeps null parts null and does not mutate input', () => {
    const input = { ...base, clientResponse: { photo: `data:image/png;base64,${PNG_B64}` } };
    const snapshot = JSON.stringify(input);
    const out = sanitizePayloadParts(input, { ...opts, maxBytes: 100_000 });
    expect(out.upstreamRequest).toBeNull();
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('collectImageKeys', () => {
  it('returns name and from of image fields only', () => {
    const entry = { output: { fields: [{ name: 'photo', from: 'img', type: 'image' }, { name: 'n', type: 'string' }] } } as unknown as DatasourceEntry;
    expect([...collectImageKeys(entry)].sort()).toEqual(['img', 'photo']);
  });
});
