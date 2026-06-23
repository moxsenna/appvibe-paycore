import {
  nextRetryDateAfterFailure,
  shouldMoveToDeadLetter,
  FULFILLMENT_MAX_ATTEMPTS,
} from '../lib/fulfillment-retry.ts';
import { nowIso } from '../lib/time.ts';
import type { PayCoreSupabase } from '../lib/supabase.ts';

export interface ClaimDeliveryRow {
  claimed: boolean;
  delivery_id: string | null;
  event_id: string | null;
  payment_order_id: string | null;
  app_id: string | null;
  attempt_number: number | null;
}

export async function claimFulfillmentDelivery(
  db: PayCoreSupabase,
  deliveryId: string,
  nowIsoStr: string,
): Promise<ClaimDeliveryRow | null> {
  const { data, error } = await db.rpc('paycore_claim_fulfillment_delivery', {
    p_delivery_id: deliveryId,
    p_now: nowIsoStr,
  });

  if (error) {
    throw new Error(`claim delivery failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    claimed: Boolean(row.claimed),
    delivery_id: row.delivery_id ? String(row.delivery_id) : null,
    event_id: row.event_id ? String(row.event_id) : null,
    payment_order_id: row.payment_order_id ? String(row.payment_order_id) : null,
    app_id: row.app_id ? String(row.app_id) : null,
    attempt_number: row.attempt_number !== null ? Number(row.attempt_number) : null,
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
  db: PayCoreSupabase,
  nowIsoStr: string,
  limit = 50,
): Promise<DueDeliveryRow[]> {
  const { data, error } = await db.rpc('paycore_list_deliveries_due_retry', {
    p_now: nowIsoStr,
    p_limit: limit,
  });

  if (error) {
    throw new Error(`list due deliveries failed: ${error.message}`);
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    delivery_id: String(row.delivery_id),
    event_id: String(row.event_id),
    payment_order_id: String(row.payment_order_id),
    app_id: String(row.app_id),
    attempt_number: Number(row.attempt_number),
    delivery_status: String(row.delivery_status),
  }));
}

export async function ensureDeliveryRowForPaidEvent(
  db: PayCoreSupabase,
  input: {
    eventId: string;
    paymentOrderId: string;
    appId: string;
    targetUrl: string;
    requestPayload: Record<string, unknown>;
  },
): Promise<string> {
  const { data: existing, error: findError } = await db
    .from('fulfillment_deliveries')
    .select('id, delivery_status')
    .eq('event_id', input.eventId)
    .eq('payment_order_id', input.paymentOrderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) {
    throw new Error(findError.message);
  }

  if (existing && !['delivered', 'dead_letter'].includes(String(existing.delivery_status))) {
    return String(existing.id);
  }

  const { data: inserted, error: insertError } = await db
    .from('fulfillment_deliveries')
    .insert({
      event_id: input.eventId,
      payment_order_id: input.paymentOrderId,
      app_id: input.appId,
      target_url: input.targetUrl,
      attempt_number: 1,
      request_payload: input.requestPayload,
      delivery_status: 'queued',
      next_retry_at: nowIso(),
    })
    .select('id')
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return String(inserted.id);
}

export async function markDeliveryOutcome(
  db: PayCoreSupabase,
  deliveryId: string,
  input: {
    ok: boolean;
    attemptNumber: number;
    responseStatus: number;
    responseBody: string;
    paymentOrderUuid: string;
  },
): Promise<'delivered' | 'retry_scheduled' | 'dead_letter'> {
  const now = new Date();

  if (input.ok) {
    await db
      .from('fulfillment_deliveries')
      .update({
        delivery_status: 'delivered',
        delivered_at: nowIso(),
        response_status: input.responseStatus,
        response_body: input.responseBody.slice(0, 8000),
        last_attempt_at: nowIso(),
        next_retry_at: null,
        claimed_at: null,
      })
      .eq('id', deliveryId);

    await db
      .from('payment_orders')
      .update({ fulfillment_status: 'delivered', updated_at: nowIso() })
      .eq('id', input.paymentOrderUuid);

    return 'delivered';
  }

  const nextAttempt = input.attemptNumber + 1;
  if (shouldMoveToDeadLetter(nextAttempt)) {
    await db
      .from('fulfillment_deliveries')
      .update({
        delivery_status: 'dead_letter',
        response_status: input.responseStatus,
        response_body: input.responseBody.slice(0, 8000),
        last_attempt_at: nowIso(),
        next_retry_at: null,
        claimed_at: null,
      })
      .eq('id', deliveryId);

    await db
      .from('payment_orders')
      .update({ fulfillment_status: 'manual_review', updated_at: nowIso() })
      .eq('id', input.paymentOrderUuid);

    return 'dead_letter';
  }

  const nextAt = nextRetryDateAfterFailure(input.attemptNumber, now);
  await db
    .from('fulfillment_deliveries')
    .update({
      delivery_status: 'failed',
      response_status: input.responseStatus,
      response_body: input.responseBody.slice(0, 8000),
      last_attempt_at: nowIso(),
      next_retry_at: nextAt?.toISOString() ?? null,
      claimed_at: null,
    })
    .eq('id', deliveryId);

  await db
    .from('payment_orders')
    .update({ fulfillment_status: 'failed', updated_at: nowIso() })
    .eq('id', input.paymentOrderUuid);

  return 'retry_scheduled';
}

export { FULFILLMENT_MAX_ATTEMPTS };