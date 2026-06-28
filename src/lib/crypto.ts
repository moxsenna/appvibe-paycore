import { md5Hex } from './md5.ts';

const encoder = new TextEncoder();

export async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return bufferToHex(digest);
}

function bufferToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return bufferToHex(sig);
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

/** Legacy Duitku V2 callbacks/status use MD5. POP production uses HMAC SHA256. */
export function duitkuCallbackSignatureMd5(
  merchantCode: string,
  amount: string,
  merchantOrderId: string,
  apiKey: string,
): string {
  return md5Hex(`${merchantCode}${amount}${merchantOrderId}${apiKey}`);
}

export function duitkuRequestSignatureMd5(
  merchantCode: string,
  paymentAmount: number,
  merchantOrderId: string,
  apiKey: string,
): string {
  return md5Hex(`${merchantCode}${merchantOrderId}${paymentAmount}${apiKey}`);
}


export async function buildAppRequestSignature(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  rawBody: string,
): Promise<string> {
  const bodyHash = await sha256Hex(rawBody);
  const message = `${timestamp}.${method.toUpperCase()}.${path}.${bodyHash}`;
  return hmacSha256Hex(secret, message);
}

export async function buildWebhookEventSignature(
  webhookSecret: string,
  timestamp: string,
  rawJsonBody: string,
): Promise<string> {
  const message = `${timestamp}.${rawJsonBody}`;
  const hex = await hmacSha256Hex(webhookSecret, message);
  return `sha256=${hex}`;
}

export function parsePayCoreSignature(header: string | undefined): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (trimmed.startsWith('sha256=')) return trimmed.slice(7);
  return trimmed;
}
