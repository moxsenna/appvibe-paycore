import { describe, it, expect, vi, afterEach } from 'vitest';

import { WebhookService } from '../src/services/webhook-service.ts';
import { ReconciliationService } from '../src/services/reconciliation-service.ts';
import type { PayCoreEnv } from '../src/types/env.ts';
import { createLogger } from '../src/lib/logger.ts';

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
    DB: {} as unknown as PayCoreEnv['DB'],
    FULFILLMENT_QUEUE: { send: vi.fn() } as unknown as PayCoreEnv['FULFILLMENT_QUEUE'],
    DEAD_LETTER_QUEUE: {} as PayCoreEnv['DEAD_LETTER_QUEUE'],
  };
}

function createMockDb(scenario: 'success' | 'duplicate' | 'amount_mismatch') {
  const updates: string[] = [];
  const insertedEvents: unknown[][] = [];
  const insertChanges = scenario === 'duplicate' ? 0 : 1;
  const orderAmount = scenario === 'amount_mismatch' ? 50000 : 100000;
  
  const db = {
    prepare(sql: string) {
      return {
        bind(..._values: unknown[]) {
          return {
            async first() {
              if (/SELECT id, order_id, amount, currency/i.test(sql)) {
                return {
                  id: 'order_uuid',
                  order_id: 'VLT-001',
                  amount: orderAmount,
                  currency: 'IDR',
                  payment_status: 'pending',
                  internal_event_id: null
                };
              }
              if (/SELECT id, order_id, provider_reference FROM payment_orders WHERE provider = 'mayar'/i.test(sql)) {
                return { id: 'order_uuid', order_id: 'VLT-001', provider_reference: 'INV-12345' };
              }
              if (/SELECT po\.id, po\.order_id, po\.external_order_id/i.test(sql)) {
                return {
                  id: 'order_uuid',
                  order_id: 'VLT-001',
                  external_order_id: 'EXT-001',
                  app_id: 'app',
                  amount: orderAmount,
                  currency: 'IDR',
                  provider: 'mayar',
                  provider_reference: 'INV-12345',
                  product_key: null,
                  fulfillment_data: '{}',
                  internal_event_id: 'evt_1',
                  paid_at: Date.now(),
                  app_id_slug: 'test_app',
                  webhook_url: 'http://test',
                  webhook_secret_ref: 'sec'
                };
              }
              if (/SELECT id, order_id, app_id, merchant_profile_id, payment_status/i.test(sql)) {
                return { id: 'order_uuid', order_id: 'VLT-001', app_id: 'app', merchant_profile_id: 'mp', payment_status: 'pending', amount: orderAmount, currency: 'IDR' };
              }
              if (/SELECT id, order_id, provider_reference, merchant_profile_id, app_id/i.test(sql)) {
                return { id: 'order_uuid', order_id: 'VLT-001', provider_reference: 'INV-12345', merchant_profile_id: 'mp', app_id: 'app' };
              }
              if (/SELECT.*FROM merchant_profiles/i.test(sql)) {
                return { id: 'mp', profile_key: 'mp', provider: 'mayar', merchant_code: 'MC' };
              }
              if (/SELECT.*FROM apps/i.test(sql)) {
                return { id: 'app', app_id: 'test_app', webhook_url: 'http://test', webhook_secret_ref: 'sec' };
              }
              if (/SELECT id, delivery_status FROM fulfillment_deliveries/i.test(sql)) {
                return null; // Force insert delivery
              }
              return null;
            },
            async all() {
              if (/SELECT id, order_id, provider_reference, merchant_profile_id, app_id/i.test(sql)) {
                return { results: [{ id: 'order_uuid', order_id: 'VLT-001', provider_reference: 'INV-12345', merchant_profile_id: 'mp', app_id: 'app' }] };
              }
              return { results: [] };
            },
            async run() {
              if (/UPDATE/.test(sql)) updates.push(sql);
              if (/INSERT/.test(sql) && /payment_events/i.test(sql)) {
                insertedEvents.push(_values);
              }
              return { meta: { changes: /INSERT/.test(sql) ? insertChanges : 1 } };
            }
          };
        }
      };
    },
    batch: async () => []
  };
  return { db, updates, insertedEvents };
}

describe('Mayar Integration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('WebhookService processes valid S2S lookup and queues fulfillment', async () => {
    const env = mockEnv();
    const { db, updates, insertedEvents } = createMockDb('success');
    env.DB = db as unknown as PayCoreEnv['DB'];

    const fetchMock = vi.fn(async () =>
      Response.json({
        statusCode: '200',
        data: { id: 'INV-12345', transactionId: 'TRX-999', status: 'PAID', amount: 100000 }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const svc = new WebhookService(env, env.DB, createLogger({ service: 'test' }));
    
    // Simulate webhook hit
    const rawBody = JSON.stringify({
      event: 'payment.received',
      data: { 
        id: 'INV-12345', 
        status: true, 
        amount: 100000, 
        transactionId: 'TRX-999',
        createdAt: 1730000000000,
        updatedAt: 1730000001000,
        customerName: 'Secret Name',
        customerEmail: 'secret@email.com',
        customerMobile: '0812345678',
        pixelFbp: 'fbp_value'
      }
    });
    const res = await svc.handleMayarWebhook(rawBody);

    expect(res.outcome).toBe('paid');
    expect(res.orderId).toBe('VLT-001');
    expect(updates.some(u => /UPDATE payment_orders SET[\s\S]*payment_status = 'paid'/i.test(u))).toBe(true);
    expect(env.FULFILLMENT_QUEUE.send).toHaveBeenCalled();
    
    expect(insertedEvents.length).toBeGreaterThan(0);
    const rawPayloadJson = insertedEvents[0]?.[7] as string;
    const rawPayload = JSON.parse(rawPayloadJson);
    expect(rawPayload.data.amount).toBe(100000);
    expect(rawPayload.data).not.toHaveProperty('customerName');
    expect(rawPayload.data).not.toHaveProperty('customerEmail');
    expect(rawPayload.data).not.toHaveProperty('customerMobile');
    expect(rawPayload.data).not.toHaveProperty('pixelFbp');
  });

  it('WebhookService handles duplicate gracefully without requeueing', async () => {
    const env = mockEnv();
    const { db, updates } = createMockDb('duplicate');
    env.DB = db as unknown as PayCoreEnv['DB'];

    const fetchMock = vi.fn(async () =>
      Response.json({
        statusCode: '200',
        data: { id: 'INV-12345', transactionId: 'TRX-999', status: 'PAID', amount: 100000 }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const svc = new WebhookService(env, env.DB, createLogger({ service: 'test' }));
    const res = await svc.handleMayarWebhook(JSON.stringify({
      event: 'payment.received',
      data: { id: 'INV-12345', status: 'PAID', amount: 100000, transactionId: 'TRX-999' }
    }));

    expect(res.outcome).toBe('duplicate');
    expect(updates.some(u => /UPDATE payment_orders SET[\s\S]*payment_status = 'paid'/i.test(u))).toBe(false);
    expect(env.FULFILLMENT_QUEUE.send).not.toHaveBeenCalled();
  });

  it('WebhookService flags manual_review on amount mismatch', async () => {
    const env = mockEnv();
    const { db, updates } = createMockDb('amount_mismatch');
    env.DB = db as unknown as PayCoreEnv['DB'];

    const fetchMock = vi.fn(async () =>
      Response.json({
        statusCode: '200',
        data: { id: 'INV-12345', transactionId: 'TRX-999', status: 'PAID', amount: 100000 } // real amount 100k, db says 50k
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const svc = new WebhookService(env, env.DB, createLogger({ service: 'test' }));
    const res = await svc.handleMayarWebhook(JSON.stringify({
      event: 'payment.received',
      data: { id: 'INV-12345', status: 'PAID', amount: 100000, transactionId: 'TRX-999' }
    }));

    expect(res.outcome).toBe('amount_mismatch');
    expect(updates.some(u => /UPDATE payment_orders SET[\s\S]*payment_status = 'manual_review'/i.test(u))).toBe(true);
  });

  it('ReconciliationService processes Mayar pending orders', async () => {
    const env = mockEnv();
    const { db, updates } = createMockDb('success');
    env.DB = db as unknown as PayCoreEnv['DB'];

    const fetchMock = vi.fn(async () =>
      Response.json({
        statusCode: '200',
        data: { id: 'INV-12345', transactionId: 'TRX-999', status: 'PAID', amount: 100000 }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const svc = new ReconciliationService(env.DB, createLogger({ service: 'test' }));
    const count = await svc.reconcileMayarOrders(env);

    expect(count).toBe(1);
    expect(updates.some(u => /UPDATE payment_orders SET[\s\S]*payment_status = 'paid'/i.test(u))).toBe(true);
    expect(env.FULFILLMENT_QUEUE.send).toHaveBeenCalled();
  });
});
