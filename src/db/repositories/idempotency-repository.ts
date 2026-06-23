import type { IdempotencyReserveResult } from '../../lib/idempotency.ts';
import { newId, parseJson, stringifyJson, type PayCoreDb } from '../client.ts';
import { nowMs } from '../../lib/time.ts';

export async function reserveIdempotency(
  db: PayCoreDb,
  appId: string,
  key: string,
  requestHash: string,
): Promise<IdempotencyReserveResult> {
  const existing = await db
    .prepare(
      `SELECT request_hash, payment_order_id, response_body
       FROM idempotency_keys WHERE app_id = ? AND idempotency_key = ?`,
    )
    .bind(appId, key)
    .first<{ request_hash: string; payment_order_id: string | null; response_body: string | null }>();

  if (existing) {
    if (existing.request_hash !== requestHash) {
      return { outcome: 'request_mismatch', paymentOrderId: null, responseBody: null };
    }
    const body = parseJson<Record<string, unknown> | null>(existing.response_body, null);
    return {
      outcome: body ? 'replay' : 'in_progress',
      paymentOrderId: existing.payment_order_id,
      responseBody: body,
    };
  }

  try {
    await db
      .prepare(
        `INSERT INTO idempotency_keys (id, app_id, idempotency_key, request_hash, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(newId(), appId, key, requestHash, nowMs())
      .run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('UNIQUE') || msg.includes('unique')) {
      return reserveIdempotency(db, appId, key, requestHash);
    }
    throw e;
  }

  return { outcome: 'reserved_new', paymentOrderId: null, responseBody: null };
}

export async function completeIdempotency(
  db: PayCoreDb,
  appId: string,
  key: string,
  paymentOrderId: string,
  responseBody: Record<string, unknown>,
): Promise<void> {
  await db
    .prepare(
      `UPDATE idempotency_keys
       SET payment_order_id = ?, response_body = ?
       WHERE app_id = ? AND idempotency_key = ?`,
    )
    .bind(paymentOrderId, stringifyJson(responseBody), appId, key)
    .run();
}