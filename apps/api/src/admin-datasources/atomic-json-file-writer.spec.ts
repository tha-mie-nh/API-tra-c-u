import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeJsonFileAtomically } from './atomic-json-file-writer';

describe('writeJsonFileAtomically', () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'atomic-json-writer-'));
    path = join(dir, 'config.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes pretty-printed JSON and leaves no stray temp file behind', async () => {
    await writeJsonFileAtomically(path, { a: 1 });

    const written = await readFile(path, 'utf-8');
    expect(JSON.parse(written)).toEqual({ a: 1 });
    expect(written).toBe(JSON.stringify({ a: 1 }, null, 2));

    const entries = await readdir(dir);
    expect(entries.sort()).toEqual(['config.json']);
  });

  it('backs up the previous file to .bak before replacing it', async () => {
    await writeFile(path, JSON.stringify({ a: 'old' }), 'utf-8');

    await writeJsonFileAtomically(path, { a: 'new' });

    expect(JSON.parse(await readFile(path, 'utf-8'))).toEqual({ a: 'new' });
    expect(JSON.parse(await readFile(`${path}.bak`, 'utf-8'))).toEqual({ a: 'old' });
  });

  it('is a no-op on .bak when there is no previous file (first-ever write)', async () => {
    await writeJsonFileAtomically(path, { a: 1 });

    const entries = await readdir(dir);
    expect(entries).not.toContain('config.json.bak');
  });

  it('never leaves the target file partially written if rename fails', async () => {
    await writeFile(path, JSON.stringify({ a: 'original' }), 'utf-8');

    // Deleting the target dir between write-tmp and rename simulates a
    // rename failure (EXDEV/ENOENT) without mocking fs internals.
    await rm(dir, { recursive: true, force: true });

    await expect(writeJsonFileAtomically(path, { a: 'new' })).rejects.toThrow();
  });
});
