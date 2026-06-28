import { describe, expect, it } from 'vitest';
import { duitkuCallbackSignatureMd5, duitkuRequestSignatureMd5 } from '../src/lib/crypto.ts';

describe('Duitku MD5 signatures', () => {
  const merchantCode = 'DS32111';
  const apiKey = 'test-api-key-32chars___________';
  const orderId = 'NAR-20260624-8H2KQ';
  const amount = 99000;

  it('legacy transactionStatus signature concatenates merchantCode + orderId + amount + apiKey', () => {
    const sig = duitkuRequestSignatureMd5(merchantCode, amount, orderId, apiKey);
    expect(sig).toMatch(/^[a-f0-9]{32}$/);
    expect(sig).toBe(duitkuRequestSignatureMd5(merchantCode, amount, orderId, apiKey));
  });

  it('callback signature uses amount string as sent by Duitku', () => {
    const amountStr = '99000';
    const sig = duitkuCallbackSignatureMd5(merchantCode, amountStr, orderId, apiKey);
    expect(sig).toMatch(/^[a-f0-9]{32}$/);
    const sigNum = duitkuCallbackSignatureMd5(merchantCode, String(amount), orderId, apiKey);
    expect(sig).toBe(sigNum);
  });

  it('callback signature changes when apiKey changes', () => {
    const a = duitkuCallbackSignatureMd5(merchantCode, '99000', orderId, apiKey);
    const b = duitkuCallbackSignatureMd5(merchantCode, '99000', orderId, apiKey + 'x');
    expect(a).not.toBe(b);
  });
});
