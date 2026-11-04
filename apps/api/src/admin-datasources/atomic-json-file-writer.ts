import { open, copyFile, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Atomic `config.json` write (phase-02 Architecture): write to a temp file
 * in the SAME directory (so the final `rename` is a same-filesystem, atomic
 * operation — a cross-mount rename would throw `EXDEV`), `fsync` it so the
 * bytes are durable before the rename is even attempted, copy the
 * about-to-be-replaced file to `.bak` (best-effort — a missing previous
 * file, e.g. first-ever write, is not an error), then `rename` the temp
 * file over the real path. The temp file is unlinked on any failure so a
 * crash mid-write never leaves stray `.tmp-*` files behind.
 */
export async function writeJsonFileAtomically(path: string, data: unknown): Promise<void> {
  const tmpPath = join(dirname(path), `.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
  const json = JSON.stringify(data, null, 2);

  const handle = await open(tmpPath, 'w');
  try {
    await handle.writeFile(json, 'utf-8');
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    await copyFile(path, `${path}.bak`);
  } catch {
    // No previous file to back up (first-ever admin write) — not fatal.
  }

  try {
    await rename(tmpPath, path);
  } catch (err) {
    await unlink(tmpPath).catch(() => undefined);
    throw err;
  }
}
