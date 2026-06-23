import {
  nextRetryDateAfterFailure,
  shouldMoveToDeadLetter,
  FULFILLMENT_MAX_ATTEMPTS,
  STUCK_PROCESSING_MS,
} from '../../lib/fulfillment-retry.ts';
import { newId, stringifyJson, type PayCoreDb } from '../client.ts';
import { nowMs } from '../../lib/time.ts';

export interface ClaimDeliveryRow {
  claimed: boolean;
  delivery_id: string | null;
  event_id: string | null;
  payment_order_id: string | null;
  app_id: string | null;
  attempt_number: number | null;
}

export async function claimFulfillmentDelivery(
  db: PayCoreDb,
  deliveryId: string,
  nowMsVal: number,
): Promise<ClaimDeliveryRow | null> {
  const row = await db
    .prepare(
      `SELECT id, event_id, payment_order_id, app_id, attempt_number, delivery_status, next_retry_at, claimed_at
       FROM fulfillment_deliveries WHERE id = ?`,
    )
    .bind(deliveryId)
    .first<Record<string, unknown>>();

  if (!row) return null;

  const status = String(row.delivery_status);
  if (['delivered', 'dead_letter', 'manual_review'].includes(status)) {
    return {
      claimed: false,
      delivery_id: String(row.id),
      event_id: String(row.event_id),
      payment_order_id: String(row.payment_order_id),
      app_id: String(row.app_id),
      attempt_number: Number(row.attempt_number),
    };
  }

  const staleCutoff = nowMsVal - STUCK_PROCESSING_MS;

  if (status === 'processing') {
    const claimedAt = row.claimed_at as number | null;
    if (claimedAt !== null && claimedAt > staleCutoff) {
      return {
        claimed: false,
        delivery_id: String(row.id),
        event_id: String(row.event_id),
        payment_order_id: String(row.payment_order_id),
        app_id: String(row.app_id),
        attempt_number: Number(row.attempt_number),
      };
    }
  } else if (['queued', 'failed', 'pending'].includes(status)) {
    const nextRetry = row.next_retry_at as number | null;
    if (nextRetry !== null && nextRetry > nowMsVal) {
      return {
        claimed: false,
        delivery_id: String(row.id),
        event_id: String(row.event_id),
        payment_order_id: String(row.payment_order_id),
        app_id: String(row.app_id),
        attempt_number: Number(row.attempt_number),
      };
    }
  } else {
    return {
      claimed: false,
      delivery_id: String(row.id),
      event_id: String(row.event_id),
      payment_order_id: String(row.payment_order_id),
      app_id: String(row.app_id),
      attempt_number: Number(row.attempt_number),
    };
  }

  const res = await db
    .prepare(
      `UPDATE fulfillment_deliveries SET
        delivery_status = 'processing',
        claimed_at = ?,
        last_attempt_at = ?,
        updated_at = ?
       WHERE id = ? AND delivery_status NOT IN ('delivered', 'dead_letter', 'manual_review')`,
    )
    .bind(nowMsVal, nowMsVal, nowMsVal, deliveryId)
    .run();

  const claimed = (res.meta.changes ?? 0) === 1;
  return {
    claimed,
    delivery_id: String(row.id),
    event_id: String(row.event_id),
    payment_order_id: String(row.payment_order_id),
    app_id: String(row.app_id),
    attempt_number: Number(row.attempt_number),
  };
}

export interface DueDeliveryRow {
  delivery_id: string;
  event_id: string;
  payment_order_id: string;
  app_id: string;
  attempt_number: number;
  delivery_status: string;
}

export async function listDeliveriesDueRetry(
  db: PayCoreDb,
  nowMsVal: number,
  limit = 50,
): Promise<DueDeliveryRow[]> {
  const staleCutoff = nowMsVal - STUCK_PROCESSING_MS;
  const { results } = await db
    .prepare(
      `SELECT fd.id AS delivery_id, fd.event_id, fd.payment_order_id, fd.app_id, fd.attempt_number, fd.delivery_status
       FROM fulfillment_deliveries fd
       INNER JOIN payment_orders po ON po.id = fd.payment_order_id
       WHERE po.payment_status = 'paid'
         AND po.fulfillment_status NOT IN ('delivered', 'manual_review')
         AND fd.delivery_status NOT IN ('delivered', 'dead_letter', 'manual_review')
         AND (
           (fd.delivery_status = 'processing' AND fd.claimed_at IS NOT NULL AND fd.claimed_at < ?)
           OR (
             fd.delivery_status IN ('queued', 'failed', 'pending')
             AND (fd.next_retry_at IS NULL OR fd.next_retry_at <= ?)
           )
         )
       ORDER BY fd.next_retry_at IS NULL DESC, fd.next_retry_at ASC, fd.created_at ASC
       LIMIT ?`,
    )
    .bind(staleCutoff, nowMsVal, limit)
    .all<Record<string, unknown>>();

  return (results ?? []).map((r) => ({
    delivery_id: String(r.delivery_id),
    event_id: String(r.event_id),
    payment_order_id: String(r.payment_order_id),
    app_id: String(r.app_id),
    attempt_number: Number(r.attempt_number),
    delivery_status: String(r.delivery_status),
  }));
}

export async function ensureDeliveryRowForPaidEvent(
  db: PayCoreDb,
  input: {
    eventId: string;
    paymentOrderId: string;
    appId: string;
    targetUrl: string;
    requestPayload: Record<string, unknown>;
  },
): Promise<string> {
  const existing = await db
    .prepare(
      `SELECT id, delivery_status FROM fulfillment_deliveries
       WHERE event_id = ? AND payment_order_id = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(input.eventId, input.paymentOrderId)
    .first<{ id: string; delivery_status: string }>();

  if (existing && !['delivered', 'dead_letter'].includes(existing.delivery_status)) {
    return existing.id;
  }

  const id = newId();
  const now = nowMs();
  await db
    .prepare(
      `INSERT INTO fulfillment_deliveries (
        id, event_id, payment_order_id, app_id, target_url, attempt_number, request_payload,
        delivery_status, next_retry_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, 'queued', ?, ?, ?)`,
    )
    .bind(
      id,
      input.eventId,
      input.paymentOrderId,
      input.appId,
      input.targetUrl,
      stringifyJson(input.requestPayload),
      now,
      now,
      now,
    )
    .run();
  return id;
}

export async function markDeliveryOutcome(
  db: PayCoreDb,
  deliveryId: string,
  input: {
    ok: boolean;
    attemptNumber: number;
    responseStatus: number;
    responseBody: string;
    paymentOrderUuid: string;
  },
): Promise<'delivered' | 'retry_scheduled' | 'dead_letter'> {
  const now = nowMs();
  const bodySlice = input.responseBody.slice(0, 8000);

  if (input.ok) {
    await db.batch([
      db
        .prepare(
          `UPDATE fulfillment_deliveries SET delivery_status = 'delivered', delivered_at = ?, response_status = ?,
           response_body = ?, last_attempt_at = ?, next_retry_at = NULL, claimed_at = NULL, updated_at = ?
           WHERE id = ?`,
        )
        .bind(now, input.responseStatus, bodySlice, now, now, deliveryId),
      db
        .prepare(`UPDATE payment_orders SET fulfillment_status = 'delivered', updated_at = ? WHERE id = ?`)
        .bind(now, input.paymentOrderUuid),
    ]);
    return 'delivered';
  }

  const nextAttempt = input.attemptNumber + 1;
  if (shouldMoveToDeadLetter(nextAttempt)) {
    await db.batch([
      db
        .prepare(
          `UPDATE fulfillment_deliveries SET delivery_status = 'dead_letter', response_status = ?, response_body = ?,
           last_attempt_at = ?, next_retry_at = NULL, claimed_at = NULL, updated_at = ? WHERE id = ?`,
        )
        .bind(input.responseStatus, bodySlice, now, now, deliveryId),
      db
        .prepare(`UPDATE payment_orders SET fulfillment_status = 'manual_review', updated_at = ? WHERE id = ?`)
        .bind(now, input.paymentOrderUuid),
    ]);
    return 'dead_letter';
  }

  const nextAt = nextRetryDateAfterFailure(input.attemptNumber, new Date(now));
  const nextMs = nextAt?.getTime() ?? null;
  await db.batch([
    db
      .prepare(
        `UPDATE fulfillment_deliveries SET delivery_status = 'failed', response_status = ?, response_body = ?,
         last_attempt_at = ?, next_retry_at = ?, claimed_at = NULL, updated_at = ? WHERE id = ?`,
      )
      .bind(input.responseStatus, bodySlice, now, nextMs, now, deliveryId),
    db
      .prepare(`UPDATE payment_orders SET fulfillment_status = 'failed', updated_at = ? WHERE id = ?`)
      .bind(now, input.paymentOrderUuid),
  ]);
  return 'retry_scheduled';
}

export async function listDeliveriesForOrder(db: PayCoreDb, orderUuid: string): Promise<Record<string, unknown>[]> {
  const { results } = await db
    .prepare(`SELECT * FROM fulfillment_deliveries WHERE payment_order_id = ? ORDER BY created_at DESC`)
    .bind(orderUuid)
    .all<Record<string, unknown>>();
  return results ?? [];
}

export { FULFILLMENT_MAX_ATTEMPTS };