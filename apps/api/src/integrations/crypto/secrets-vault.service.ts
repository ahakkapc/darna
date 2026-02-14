import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

@Injectable()
export class SecretsVaultService {
  private readonly logger = new Logger('SecretsVaultService');
  private readonly keys: Map<number, Buffer> = new Map();

  constructor() {
    this.loadKeys();
  }

  private loadKeys(): void {
    for (let v = 1; v <= 10; v++) {
      const envKey = process.env[`SECRETS_MASTER_KEY_V${v}`];
      if (envKey) {
        const buf = Buffer.from(envKey, 'base64');
        if (buf.length !== 32) {
          this.logger.warn(`SECRETS_MASTER_KEY_V${v} must be 32 bytes (got ${buf.length})`);
          continue;
        }
        this.keys.set(v, buf);
      }
    }
    if (this.keys.size === 0) {
      const fallback = randomBytes(32);
      this.keys.set(1, fallback);
      this.logger.warn('No SECRETS_MASTER_KEY_V* found in env — using random ephemeral key (NOT for production)');
    }
  }

  currentKeyVersion(): number {
    return Math.max(...this.keys.keys());
  }

  encrypt(plaintext: string, keyVersion?: number): { valueEnc: string; keyVersion: number } {
    const ver = keyVersion ?? this.currentKeyVersion();
    const key = this.keys.get(ver);
    if (!key) throw new Error(`Master key version ${ver} not found`);

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const payload = Buffer.concat([iv, authTag, encrypted]);
    return { valueEnc: payload.toString('base64'), keyVersion: ver };
  }

  decrypt(valueEnc: string, keyVersion: number): string {
    const key = this.keys.get(keyVersion);
    if (!key) throw new Error(`Master key version ${keyVersion} not found`);

    const payload = Buffer.from(valueEnc, 'base64');
    const iv = payload.subarray(0, IV_LENGTH);
    const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted) + decipher.final('utf8');
  }
}
