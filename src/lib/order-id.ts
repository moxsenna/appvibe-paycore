const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function formatOrderDateUtc(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export function randomOrderSuffix(length = 5): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (let i = 0; i < length; i++) {
    const byte = bytes[i] ?? 0;
    out += ALPHABET[byte % ALPHABET.length];
  }
  return out;
}

export function generateOrderId(prefix: string, date = new Date()): string {
  const normalized = prefix.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return `${normalized}-${formatOrderDateUtc(date)}-${randomOrderSuffix()}`;
}