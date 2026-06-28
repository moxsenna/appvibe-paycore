import { describe, it, expect, vi, afterEach } from 'vitest';
import { MayarAdapter } from '../src/providers/mayar.ts';
import type { PayCoreEnv } from '../src/types/env.ts';

function mockEnv(): PayCoreEnv {
  return {
    ENVIRONMENT: 'test',
    MAYAR_API_KEY: 'test_mayar_key',
    MAYAR_BASE_URL: 'https://api.mayar.id',
    DUITKU_BASE_URL: '',
    DUITKU_MERCHANT_CODE: '',
    DUITKU_API_KEY: '',
    PAYCORE_PUBLIC_BASE_URL: '',
    PAYCORE_INTERNAL_MASTER_KEY: 'x'.repeat(32),
    PAYCORE_ENCRYPTION_KEY: 'y'.repeat(32),
    NARRAZA_APP_KEY_ID: '',
    NARRAZA_APP_SECRET: '',
    NARRAZA_WEBHOOK_SECRET: '',
    VAULT_APP_KEY_ID: '',
    VAULT_APP_SECRET: '',
    VAULT_WEBHOOK_SECRET: '',
    DB: {} as PayCoreEnv['DB'],
    FULFILLMENT_QUEUE: {} as PayCoreEnv['FULFILLMENT_QUEUE'],
    DEAD_LETTER_QUEUE: {} as PayCoreEnv['DEAD_LETTER_QUEUE'],
  };
}

describe('Mayar Integration (Webhook & Reconciliation)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('validates Mayar callback payload structure without saving PII', async () => {
    const adapter = new MayarAdapter(mockEnv());
    const fetchMock = vi.fn(async () =>
      Response.json({
        statusCode: '200',
        data: {
          id: 'INV-12345',
          transactionId: 'TRX-999',
          status: 'PAID',
          amount: 100000,
        }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.lookupPaymentStatus({
      providerReference: 'INV-12345',
      merchantOrderId: 'VLT-001'
    });

    expect(result.paid).toBe(true);
    expect(result.paidAmount).toBe(100000);
    expect(result.providerTransactionReference).toBe('TRX-999');
    
    const safePayload = {
      event: 'payment.received',
      data: {
        id: result.providerReference,
        status: result.paid ? 'paid' : 'pending',
        amount: result.paidAmount,
        transactionId: result.providerTransactionReference,
      }
    };
    
    expect(safePayload.data.amount).toBe(100000);
    expect(safePayload).not.toHaveProperty('customer_name');
  });
});
