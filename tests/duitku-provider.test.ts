import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuitkuAdapter } from '../src/providers/duitku.ts';
import { hmacSha256Hex } from '../src/lib/crypto.ts';
import type { PayCoreEnv } from '../src/types/env.ts';

function env(overrides: Partial<PayCoreEnv> = {}): PayCoreEnv {
  return {
    ENVIRONMENT: 'test',
    DUITKU_BASE_URL: 'https://api-prod.duitku.com',
    DUITKU_MERCHANT_CODE: 'D1234',
    DUITKU_API_KEY: 'merchant-key',
    PAYCORE_PUBLIC_BASE_URL: 'https://pay.appvibe.biz.id',
    PAYCORE_INTERNAL_MASTER_KEY: 'x'.repeat(32),
    PAYCORE_ENCRYPTION_KEY: 'y'.repeat(32),
    NARRAZA_APP_KEY_ID: 'pk_test_narraza',
    NARRAZA_APP_SECRET: 'narraza_secret',
    NARRAZA_WEBHOOK_SECRET: 'narraza_webhook',
    VAULT_APP_KEY_ID: 'pk_test_vault',
    VAULT_APP_SECRET: 'vault_secret',
    VAULT_WEBHOOK_SECRET: 'vault_webhook',
    DB: {} as PayCoreEnv['DB'],
    FULFILLMENT_QUEUE: {} as PayCoreEnv['FULFILLMENT_QUEUE'],
    DEAD_LETTER_QUEUE: {} as PayCoreEnv['DEAD_LETTER_QUEUE'],
    ...overrides,
  };
}

describe('Duitku POP adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('creates production invoices against api-prod with HMAC SHA256 headers', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-28T00:00:00.123Z'));

    const fetchMock = vi.fn(async () =>
      Response.json({
        statusCode: '00',
        statusMessage: 'SUCCESS',
        reference: 'D1234REF',
        paymentUrl: 'https://app-prod.duitku.com/redirect_checkout?reference=D1234REF',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new DuitkuAdapter(env());
    const result = await adapter.createPayment({
      merchantOrderId: 'VLT-20260628-AAAA',
      amount: 97000,
      productDetails: 'White-Label Vault - Advertiser App Pack',
      customerName: 'Bima Putra',
      customerEmail: 'bima@example.com',
      customerPhone: '+6281234567890',
      callbackUrl: 'https://pay.appvibe.biz.id/webhooks/duitku',
      returnUrl: 'https://pay.appvibe.biz.id/return/VLT-20260628-AAAA',
      expiryPeriodMinutes: 10,
    });

    expect(result.checkoutUrl).toContain('redirect_checkout');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const [url, init] = firstCall;
    expect(url).toBe('https://api-prod.duitku.com/api/merchant/createInvoice');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-duitku-merchantcode']).toBe('D1234');
    expect((init.headers as Record<string, string>)['x-duitku-timestamp']).toBe(String(Date.now()));
    expect((init.headers as Record<string, string>)['x-duitku-signature']).toBe(
      await hmacSha256Hex('merchant-key', `D1234${Date.now()}`),
    );
  });

  it('maps sandbox merchant portal base URL to POP sandbox createInvoice', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        statusCode: '00',
        reference: 'D1234SANDBOX',
        paymentUrl: 'https://app-sandbox.duitku.com/redirect_checkout?reference=D1234SANDBOX',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new DuitkuAdapter(env({ DUITKU_BASE_URL: 'https://sandbox.duitku.com' }));
    await adapter.createPayment({
      merchantOrderId: 'VLT-20260628-BBBB',
      amount: 97000,
      productDetails: 'Vault',
      customerName: 'Bima',
      customerEmail: 'bima@example.com',
      customerPhone: '081234567890',
      callbackUrl: 'https://pay-staging.appvibe.biz.id/webhooks/duitku',
      returnUrl: 'https://pay-staging.appvibe.biz.id/return/VLT-20260628-BBBB',
      expiryPeriodMinutes: 10,
    });

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api-sandbox.duitku.com/api/merchant/createInvoice');
  });

  it('verifies POP callback HMAC SHA256 signatures', async () => {
    const adapter = new DuitkuAdapter(env());
    const signature = await hmacSha256Hex('merchant-key', 'D123497000VLT-20260628-CCCC');

    const result = await adapter.verifyWebhook({
      merchantCode: 'D1234',
      apiKey: 'merchant-key',
      payload: {
        merchantCode: 'D1234',
        amount: '97000',
        merchantOrderId: 'VLT-20260628-CCCC',
        resultCode: '00',
        reference: 'D1234REF',
        signature,
      },
    });

    expect(result.valid).toBe(true);
    expect(result.paid).toBe(true);
    expect(result.paidAmount).toBe(97000);
  });

  it('maps POP production base URL back to passport host for transaction status', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        statusCode: '00',
        statusMessage: 'SUCCESS',
        reference: 'D1234REF',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new DuitkuAdapter(env({ DUITKU_BASE_URL: 'https://api-prod.duitku.com' }));
    await adapter.getPaymentStatus('VLT-20260628-DDDD');

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://passport.duitku.com/webapi/api/merchant/transactionStatus',
    );
  });
});
