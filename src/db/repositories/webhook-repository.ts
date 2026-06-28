import { newId, stringifyJson, type PayCoreDb } from '../client.ts';
import { nowMs } from '../../lib/time.ts';

export type WebhookRecordOutcome =
  | 'paid'
  | 'duplicate'
  | 'already_paid'
  | 'invalid_signature'
  | 'order_not_found'
  | 'amount_mismatch'
  | 'invalid_transition';

export interface WebhookRecordResult {
  outcome: WebhookRecordOutcome;
  internalEventId: string | null;
  paymentOrderPublicId: string | null;
}

function newInternalEventId(): string {
  return `evt_${crypto.randomUUID().replace(/-/g, '')}`;
}

export async function recordVerifiedPayment(
  db: PayCoreDb,
  input: {
    source: 'webhook' | 'reconciliation';
    verificationMethod: 'provider_signature' | 's2s_invoice_lookup';
    verificationValid: boolean;
    eventId: string;
    provider: string;
    merchantProfileId: string;
    orderUuid: string;
    providerEventId: string;
    payloadHash: string;
    rawPayload: Record<string, unknown>;
    providerReference: string | null;
    paidAmount: number;
  },
): Promise<WebhookRecordResult> {
  const order = await db
    .prepare(
      `SELECT id, order_id, amount, currency, payment_status, internal_event_id
       FROM payment_orders WHERE id = ?`,
    )
    .bind(input.orderUuid)
    .first<{
      id: string;
      order_id: string;
      amount: number;
      currency: string;
      payment_status: string;
      internal_event_id: string | null;
    }>();

  if (!order) {
    return { outcome: 'order_not_found', internalEventId: null, paymentOrderPublicId: null };
  }

  const now = nowMs();
  const rawJson = stringifyJson(input.rawPayload);
  const signatureValidVal = input.verificationMethod === 'provider_signature' && input.verificationValid ? 1 : 0;
  const verificationValidVal = input.verificationValid ? 1 : 0;

  if (!input.verificationValid) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO payment_events (
          id, event_id, provider, merchant_profile_id, order_id, provider_event_id,
          event_type, payload_hash, raw_payload, signature_valid, verification_valid, verification_method, processing_status, received_at, processed_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'provider.callback', ?, ?, ?, ?, ?, 'rejected', ?, ?)`
      )
      .bind(
        newId(),
        input.eventId,
        input.provider,
        input.merchantProfileId,
        input.orderUuid,
        input.providerEventId,
        input.payloadHash,
        rawJson,
        signatureValidVal,
        verificationValidVal,
        input.verificationMethod,
        now,
        now,
      )
      .run();
    return { outcome: 'invalid_signature', internalEventId: null, paymentOrderPublicId: order.order_id };
  }

  const insertRes = await db
    .prepare(
      `INSERT OR IGNORE INTO payment_events (
        id, event_id, provider, merchant_profile_id, order_id, provider_event_id,
        event_type, payload_hash, raw_payload, signature_valid, verification_valid, verification_method, processing_status, received_at, processed_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'provider.callback.paid', ?, ?, ?, ?, ?, 'processed', ?, ?)`
    )
    .bind(
      newId(),
      input.eventId,
      input.provider,
      input.merchantProfileId,
      input.orderUuid,
      input.providerEventId,
      input.payloadHash,
      rawJson,
      signatureValidVal,
      verificationValidVal,
      input.verificationMethod,
      now,
      now,
    )
    .run();

  if ((insertRes.meta.changes ?? 0) === 0) {
    return {
      outcome: 'duplicate',
      internalEventId: order.internal_event_id,
      paymentOrderPublicId: order.order_id,
    };
  }

  if (order.amount !== input.paidAmount || order.currency !== 'IDR') {
    await db
      .prepare(`UPDATE payment_orders SET payment_status = 'manual_review', updated_at = ? WHERE id = ?`)
      .bind(now, input.orderUuid)
      .run();
    return { outcome: 'amount_mismatch', internalEventId: null, paymentOrderPublicId: order.order_id };
  }

  if (order.payment_status === 'paid') {
    return {
      outcome: 'already_paid',
      internalEventId: order.internal_event_id,
      paymentOrderPublicId: order.order_id,
    };
  }

  if (order.payment_status === 'cancelled' || order.payment_status === 'refunded') {
    await db
      .prepare(`UPDATE payment_orders SET payment_status = 'manual_review', updated_at = ? WHERE id = ?`)
      .bind(now, input.orderUuid)
      .run();
    return { outcome: 'invalid_transition', internalEventId: null, paymentOrderPublicId: order.order_id };
  }

  const internalEventId = newInternalEventId();
  await db
    .prepare(
      `UPDATE payment_orders SET
        payment_status = 'paid',
        fulfillment_status = 'queued',
        provider_reference = COALESCE(?, provider_reference),
        paid_at = ?,
        internal_event_id = ?,
        updated_at = ?
       WHERE id = ?`,
    )
    .bind(input.providerReference, now, internalEventId, now, input.orderUuid)
    .run();

  return { outcome: 'paid', internalEventId, paymentOrderPublicId: order.order_id };
}