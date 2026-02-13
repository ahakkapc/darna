const SIGNATURES: Record<string, { offset: number; bytes: number[]; label?: string }[]> = {
  'image/jpeg': [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  'image/png': [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }],
  'image/webp': [
    { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46], label: 'RIFF' },
    { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50], label: 'WEBP' },
  ],
  'application/pdf': [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }],
};

export function verifyMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const sigs = SIGNATURES[mimeType];
  if (!sigs) return true;

  for (const sig of sigs) {
    for (let i = 0; i < sig.bytes.length; i++) {
      if (buffer.length <= sig.offset + i) return false;
      if (buffer[sig.offset + i] !== sig.bytes[i]) return false;
    }
  }
  return true;
}

export const MIME_ALLOWLIST: Record<string, number> = {
  'image/jpeg': 10 * 1024 * 1024,
  'image/png': 10 * 1024 * 1024,
  'image/webp': 10 * 1024 * 1024,
  'application/pdf': 20 * 1024 * 1024,
};

export function isAllowedMime(mime: string): boolean {
  return mime in MIME_ALLOWLIST;
}

export function maxSizeForMime(mime: string): number {
  return MIME_ALLOWLIST[mime] ?? 0;
}

export function sanitizeFilename(name: string): string {
  const base = name.replace(/^.*[\\/]/, '').replace(/[^\w.\-]/g, '_');
  return base.substring(0, 120);
}
