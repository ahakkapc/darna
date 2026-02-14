import { createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const keys = new Map<number, Buffer>();

function loadKeys(): void {
  for (let v = 1; v <= 10; v++) {
    const envKey = process.env[`SECRETS_MASTER_KEY_V${v}`];
    if (envKey) {
      const buf = Buffer.from(envKey, 'base64');
      if (buf.length === 32) {
        keys.set(v, buf);
      }
    }
  }
  if (keys.size === 0) {
    const fallback = randomBytes(32);
    keys.set(1, fallback);
  }
}

loadKeys();

export function decryptValue(valueEnc: string, keyVersion: number): string | null {
  const key = keys.get(keyVersion);
  if (!key) return null;

  try {
    const payload = Buffer.from(valueEnc, 'base64');
    const iv = payload.subarray(0, IV_LENGTH);
    const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted) + decipher.final('utf8');
  } catch {
    return null;
  }
}
