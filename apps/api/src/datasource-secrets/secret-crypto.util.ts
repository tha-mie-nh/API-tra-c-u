import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';

/** Khóa chủ: đúng 32 byte, viết dưới dạng 64 ký tự hex (`openssl rand -hex 32`). */
export function parseMasterKey(raw: string | undefined): Buffer | null {
  const value = raw?.trim();
  if (!value) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error('SECRETS_ENCRYPTION_KEY phải là 64 ký tự hex (32 byte). Sinh bằng: openssl rand -hex 32');
  }
  return Buffer.from(value, 'hex');
}

/** Mã hóa `plain`; `aad` (mã nguồn dữ liệu) buộc bản mã vào đúng dòng, không thể dán sang nguồn khác. */
export function encryptSecret(plain: string, key: Buffer, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
}

/** Giải mã; ném lỗi nếu sai khóa chủ, sai `aad` hoặc dữ liệu bị sửa (GCM xác thực). */
export function decryptSecret(encoded: string, key: Buffer, aad: string): string {
  const [version, iv, tag, ciphertext] = encoded.split('.');
  if (version !== VERSION || !iv || !tag || !ciphertext) throw new Error('định dạng bản mã không hợp lệ');
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}
