export function maskPii(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return obj;
  if (Array.isArray(obj)) return obj.map(maskPii);
  if (typeof obj !== 'object') return obj;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lk = key.toLowerCase();
    if (lk === 'email' || lk === 'e_mail' || lk.endsWith('email')) {
      if (typeof value === 'string' && value.includes('@')) {
        const [local, domain] = value.split('@');
        result[key] = `${local[0]}***@${domain}`;
      } else {
        result[key] = '***';
      }
    } else if (lk === 'phone' || lk === 'tel' || lk.endsWith('phone') || lk.endsWith('tel')) {
      if (typeof value === 'string' && value.length > 6) {
        result[key] = `${value.substring(0, 4)}****${value.substring(value.length - 3)}`;
      } else {
        result[key] = '***';
      }
    } else if (typeof value === 'object') {
      result[key] = maskPii(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
