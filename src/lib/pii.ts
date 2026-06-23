const encoder = new TextEncoder();

function decodeEncryptionKey(raw: string): Uint8Array {
  const trimmed = raw.trim();
  try {
    const binary = atob(trimmed);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    if (bytes.length === 16 || bytes.length === 32) return bytes;
  } catch {
    /* fall through */
  }
  const utf8 = encoder.encode(trimmed);
  if (utf8.length < 16) {
    throw new Error('PAYCORE_ENCRYPTION_KEY must be at least 16 bytes');
  }
  return utf8.slice(0, 32);
}

async function importAesKey(rawKey: string): Promise<CryptoKey> {
  const material = decodeEncryptionKey(rawKey);
  return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptPii(plaintext: string, encryptionKey: string): Promise<string> {
  const key = await importAesKey(encryptionKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext));
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipher), iv.length);
  return btoa(String.fromCharCode(...combined));
}