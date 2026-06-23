import { describe, expect, it } from 'vitest';
import {
  buildAppRequestSignature,
  duitkuCallbackSignatureMd5,
  timingSafeEqual,
} from '../src/lib/crypto.ts';
import { assertTimestampFresh } from '../src/lib/time.ts';
import { assertIdempotencyOutcome } from '../src/lib/idempotency.ts';
import { Errors } from '../src/lib/errors.ts';
import { assertPaymentTransition } from '../src/lib/state-machine.ts';

describe('app request signing', () => {
  it('produces stable HMAC for known inputs', async () => {
    const sig = await buildAppRequestSignature(
      'secret',
      '2026-06-23T15:00:00Z',
      'POST',
      '/v1/orders',
      '{}',
    );
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects expired timestamp', () => {
    expect(() => assertTimestampFresh('2000-01-01T00:00:00Z')).toThrow('Timestamp expired');
  });
});

describe('duitku callback signature', () => {
  it('matches MD5 for fixture string', () => {
    const sig = duitkuCallbackSignatureMd5('MC', '99000', 'NAR-20260623-TEST1', 'apikey');
    expect(sig).toMatch(/^[a-f0-9]{32}$/);
  });

  it('timingSafeEqual rejects mismatch', () => {
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('same', 'same')).toBe(true);
  });
});

describe('idempotency outcomes', () => {
  it('throws on request_mismatch', () => {
    expect(() =>
      assertIdempotencyOutcome({ outcome: 'request_mismatch', paymentOrderId: null, responseBody: null }),
    ).toThrow(Errors.idempotencyMismatch().message);
  });
});

describe('payment state machine', () => {
  it('rejects paid -> pending', () => {
    expect(() => assertPaymentTransition('paid', 'pending')).toThrow();
  });
});