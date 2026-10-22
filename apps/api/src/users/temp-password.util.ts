import { randomBytes } from 'node:crypto';

/** CSPRNG temp password, base64url alphabet, >=16 chars (Security
 * Considerations). Returned to the admin exactly once by the caller. */
export function generateTempPassword(length = 20): string {
  return randomBytes(length).toString('base64url').slice(0, length);
}
