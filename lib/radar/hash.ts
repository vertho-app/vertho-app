import crypto from 'crypto';

/**
 * SHA-256 estável para qualquer JSON. Usado como `dados_hash` no cache de
 * análises IA — garante que se os dados mudarem, a IA regenera; se não,
 * serve do cache.
 */
export function stableJsonHash(value: unknown): string {
  const json = stableStringify(value);
  return crypto.createHash('sha256').update(json).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}
