import { describe, expect, it } from 'vitest';
import { ensureDeliveryRowForPaidEvent } from '../src/db/repositories/deliveries-repository.ts';

function createDbWithFailedDelivery() {
  const row = {
    id: 'delivery_1',
    event_id: 'evt_1',
    payment_order_id: 'order_uuid_1',
    delivery_status: 'failed',
    next_retry_at: Date.now() + 60_000 as number | null,
    claimed_at: null as number | null,
    target_url: 'https://old.example/webhook',
    request_payload: '{}',
    updated_at: 1,
  };
  const updates: string[] = [];

  return {
    row,
    updates,
    db: {
      prepare(sql: string) {
        const stmt = {
          bind(...values: unknown[]) {
            return {
              async first() {
                if (/SELECT id, delivery_status FROM fulfillment_deliveries/i.test(sql)) {
                  return { id: row.id, delivery_status: row.delivery_status };
                }
                return null;
              },
              async run() {
                updates.push(sql);
                if (/UPDATE fulfillment_deliveries SET/i.test(sql)) {
                  row.target_url = String(values[0]);
                  row.request_payload = String(values[1]);
                  row.delivery_status = 'queued';
                  row.next_retry_at = null;
                  row.claimed_at = null;
                }
                return { meta: { changes: 1 } };
              },
            };
          },
        };
        return stmt;
      },
      batch: async () => [],
    },
  };
}

describe('delivery retry store', () => {
  it('resets a failed existing delivery so manual retry can claim it immediately', async () => {
    const { db, row, updates } = createDbWithFailedDelivery();

    const id = await ensureDeliveryRowForPaidEvent(db as never, {
      eventId: 'evt_1',
      paymentOrderId: 'order_uuid_1',
      appId: 'app_uuid_1',
      targetUrl: 'https://appvibe.biz.id/api/webhooks/paycore',
      requestPayload: { ok: true },
    });

    expect(id).toBe('delivery_1');
    expect(updates.some((sql) => /UPDATE fulfillment_deliveries SET/i.test(sql))).toBe(true);
    expect(row.delivery_status).toBe('queued');
    expect(row.next_retry_at).toBeNull();
    expect(row.target_url).toBe('https://appvibe.biz.id/api/webhooks/paycore');
    expect(row.request_payload).toBe(JSON.stringify({ ok: true }));
  });
});
