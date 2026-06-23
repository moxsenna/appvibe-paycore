import { describe, expect, it } from 'vitest';

function returnUrlAllowed(returnUrl: string, allowed: unknown): boolean {
  if (!Array.isArray(allowed)) return false;
  let target: URL;
  try {
    target = new URL(returnUrl);
  } catch {
    return false;
  }
  for (const entry of allowed) {
    if (typeof entry !== 'string') continue;
    try {
      const allowedUrl = new URL(entry);
      if (allowedUrl.origin === target.origin && target.href.startsWith(entry)) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

describe('return URL allowlist', () => {
  it('allows registered prefix', () => {
    const ok = returnUrlAllowed('https://app.narraza.web.id/payment/return?x=1', [
      'https://app.narraza.web.id/payment/return',
    ]);
    expect(ok).toBe(true);
  });

  it('blocks foreign domain', () => {
    const ok = returnUrlAllowed('https://evil.example/steal', [
      'https://app.narraza.web.id/payment/return',
    ]);
    expect(ok).toBe(false);
  });
});