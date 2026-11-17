import { randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret, parseMasterKey } from './secret-crypto.util';

describe('secret-crypto.util', () => {
  const key = randomBytes(32);

  it('round-trips and never leaks the plaintext into the encoded value', () => {
    const encoded = encryptSecret('my-secret-key', key, 'DS_A');
    expect(encoded).not.toContain('my-secret-key');
    expect(decryptSecret(encoded, key, 'DS_A')).toBe('my-secret-key');
  });

  it('uses a fresh IV each time', () => {
    expect(encryptSecret('x', key, 'A')).not.toBe(encryptSecret('x', key, 'A'));
  });

  it('rejects another datasource code (AAD), another key, and tampering', () => {
    const encoded = encryptSecret('x', key, 'DS_A');
    expect(() => decryptSecret(encoded, key, 'DS_B')).toThrow();
    expect(() => decryptSecret(encoded, randomBytes(32), 'DS_A')).toThrow();
    const parts = encoded.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptSecret(parts.join('.'), key, 'DS_A')).toThrow();
  });

  it('parseMasterKey: empty -> null, bad format -> error, 64 hex -> 32 bytes', () => {
    expect(parseMasterKey(undefined)).toBeNull();
    expect(parseMasterKey('  ')).toBeNull();
    expect(() => parseMasterKey('short')).toThrow(/64 ký tự hex/);
    expect(parseMasterKey('ab'.repeat(32))?.length).toBe(32);
  });
});
