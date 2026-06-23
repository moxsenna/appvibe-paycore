import { buildWebhookEventSignature } from '../lib/crypto.ts';
import { Errors } from '../lib/errors.ts';
import { RETRY_DELAYS_MS } from '../lib/fulfillment-retry.ts';
import type { PayCoreLogger } from '../lib/logger.ts';
import { nowIso } from '../lib/time.ts';
import type { PayCoreSupabase } from '../lib/supabase.ts';
import { resolveWebhookSecret } from '../config/env.ts';
import type { PayCoreEnv, FulfillmentQueueMessage } from '../types/env.ts';
import {
  claimFulfillmentDelivery,
  ensureDeliveryRowForPaidEvent,
  markDeliveryOutcome,
} from './fulfillment-delivery-store.ts';


export interface InternalPaymentEventPayload {
  event_id: string;
  event_type: 'payment.succeeded';
  occurred_at: string;
  data: {
    order_id: string;
    external_order_id: string;
    app_id: string;
    provider: string;
    provider_reference: string | null;
    amount: number;
    currency: string;
    paid_at: string;
    payment_status: string;
    product_key: string | null;
    fulfillment_data: Record<string, unknown>;
  };
}

export function buildPaymentSucceededPayload(order: {
  internal_event_id: string;
  order_id: string;
  external_order_id: string;
  app_id_slug: string;
  provider: string;
  provider_reference: string | null;
  amount: number;
  currency: string;
  product_key: string | null;
  fulfillment_data: Record<string, unknown>;
  paid_at: string;
}): InternalPaymentEventPayload {
  return {
    event_id: order.internal_event_id,
    event_type: 'payment.succeeded',
    occurred_at: order.paid_at,
    data: {
      order_id: order.order_id,
      external_order_id: order.external_order_id,
      app_id: order.app_id_slug,
      provider: order.provider,
      provider_reference: order.provider_reference,
      amount: order.amount,
      currency: order.currency,
      paid_at: order.paid_at,
      payment_status: 'paid',
      product_key: order.product_key,
      fulfillment_data: order.fulfillment_data,
    },
  };
}

export async function deliverFulfillment(
  env: PayCoreEnv,
  targetUrl: string,
  webhookSecretRef: string,
  payload: InternalPaymentEventPayload,
): Promise<{ ok: boolean; status: number; body: string }> {
  const secret = resolveWebhookSecret(env, webhookSecretRef);
  if (!secret) {
    return { ok: false, status: 0, body: 'webhook secret not configured' };
  }

  const timestamp = nowIso();
  const rawBody = JSON.stringify(payload);
  const signature = await buildWebhookEventSignature(secret, timestamp, rawBody);

  const res = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PayCore-Event': payload.event_type,
      'X-PayCore-Event-Id': payload.event_id,
      'X-PayCore-Timestamp': timestamp,
      'X-PayCore-Signature': signature,
    },
    body: rawBody,
  });

  const body = await res.text();
  return { ok: res.ok, status: res.status, body: body.slice(0, 4000) };
}

export class FulfillmentService {
  constructor(
    private readonly env: PayCoreEnv,
    private readonly db: PayCoreSupabase,
    private readonly log: PayCoreLogger,
  ) {}

  async enqueueForPaidOrder(params: {
    paymentOrderId: string;
    internalEventId: string;
    appUuid: string;
  }): Promise<void> {
    const { data: orderRow, error: orderError } = await this.db
      .from('payment_orders')
      .select(
        'id, order_id, external_order_id, amount, currency, provider, provider_reference, product_key, fulfillment_data, paid_at, apps!inner(app_id, webhook_url, webhook_secret_ref)',
      )
      .eq('id', params.paymentOrderId)
      .maybeSingle();

    if (orderError || !orderRow) {
      throw Errors.notFound('Order not found for fulfillment enqueue');
    }

    const apps = orderRow.apps as
      | { app_id: string; webhook_url: string; webhook_secret_ref: string }
      | { app_id: string; webhook_url: string; webhook_secret_ref: string }[];
    const app = Array.isArray(apps) ? apps[0] : apps;
    if (!app) {
      throw Errors.internal('App missing for fulfillment enqueue');
    }

    const paidAt = orderRow.paid_at ? String(orderRow.paid_at) : nowIso();
    const payload = buildPaymentSucceededPayload({
      internal_event_id: params.internalEventId,
      order_id: String(orderRow.order_id),
      external_order_id: String(orderRow.external_order_id),
      app_id_slug: String(app.app_id),
      provider: String(orderRow.provider),
      provider_reference: orderRow.provider_reference ? String(orderRow.provider_reference) : null,
      amount: Number(orderRow.amount),
      currency: String(orderRow.currency),
      product_key: orderRow.product_key ? String(orderRow.product_key) : null,
      fulfillment_data: (orderRow.fulfillment_data as Record<string, unknown>) ?? {},
      paid_at: paidAt,
    });

    const deliveryId = await ensureDeliveryRowForPaidEvent(this.db, {
      eventId: params.internalEventId,
      paymentOrderId: params.paymentOrderId,
      appId: params.appUuid,
      targetUrl: String(app.webhook_url),
      requestPayload: payload as unknown as Record<string, unknown>,
    });

    const message: FulfillmentQueueMessage = {
      deliveryId,
      eventId: params.internalEventId,
      paymentOrderId: params.paymentOrderId,
      appId: params.appUuid,
      attemptNumber: 1,
    };

    await this.env.FULFILLMENT_QUEUE.send(message);
    await this.db
      .from('payment_orders')
      .update({ fulfillment_status: 'queued', updated_at: nowIso() })
      .eq('id', params.paymentOrderId);

    this.log.info('fulfillment_enqueued', {
      event_id: params.internalEventId,
      payment_order_id: params.paymentOrderId,
      delivery_id: deliveryId,
    });
  }

  async processQueueMessage(message: FulfillmentQueueMessage): Promise<void> {
    const claim = await claimFulfillmentDelivery(this.db, message.deliveryId, nowIso());
    if (!claim?.claimed) {
      this.log.info('fulfillment_claim_skipped', {
        delivery_id: message.deliveryId,
        event_id: message.eventId,
      });
      return;
    }

    const attemptNumber = claim.attempt_number ?? message.attemptNumber;

    const { data: orderRow, error: orderError } = await this.db
      .from('payment_orders')
      .select(
        'id, order_id, external_order_id, app_id, amount, currency, provider, provider_reference, product_key, fulfillment_data, internal_event_id, paid_at, apps!inner(app_id, webhook_url, webhook_secret_ref)',
      )
      .eq('id', message.paymentOrderId)
      .maybeSingle();

    if (orderError || !orderRow) {
      throw Errors.notFound('Order not found for fulfillment');
    }

    const apps = orderRow.apps as
      | { app_id: string; webhook_url: string; webhook_secret_ref: string }
      | { app_id: string; webhook_url: string; webhook_secret_ref: string }[];
    const app = Array.isArray(apps) ? apps[0] : apps;
    if (!app) {
      throw Errors.internal('App missing for fulfillment');
    }

    const internalEventId = String(orderRow.internal_event_id ?? message.eventId);
    const paidAt = orderRow.paid_at ? String(orderRow.paid_at) : nowIso();
    const payload = buildPaymentSucceededPayload({
      internal_event_id: internalEventId,
      order_id: String(orderRow.order_id),
      external_order_id: String(orderRow.external_order_id),
      app_id_slug: String(app.app_id),
      provider: String(orderRow.provider),
      provider_reference: orderRow.provider_reference ? String(orderRow.provider_reference) : null,
      amount: Number(orderRow.amount),
      currency: String(orderRow.currency),
      product_key: orderRow.product_key ? String(orderRow.product_key) : null,
      fulfillment_data: (orderRow.fulfillment_data as Record<string, unknown>) ?? {},
      paid_at: paidAt,
    });

    const delivery = await deliverFulfillment(
      this.env,
      String(app.webhook_url),
      String(app.webhook_secret_ref),
      payload,
    );

    const outcome = await markDeliveryOutcome(this.db, message.deliveryId, {
      ok: delivery.ok,
      attemptNumber,
      responseStatus: delivery.status,
      responseBody: delivery.body,
      paymentOrderUuid: String(orderRow.id),
    });

    if (outcome === 'delivered') {
      return;
    }

    if (outcome === 'dead_letter') {
      await this.env.DEAD_LETTER_QUEUE.send(message);
      return;
    }

    const delayMs = RETRY_DELAYS_MS[attemptNumber - 1] ?? 86_400_000;
    const retryMessage: FulfillmentQueueMessage = {
      deliveryId: message.deliveryId,
      eventId: message.eventId,
      paymentOrderId: message.paymentOrderId,
      appId: message.appId,
      attemptNumber: attemptNumber + 1,
    };
    await this.env.FULFILLMENT_QUEUE.send(retryMessage, {
      delaySeconds: Math.ceil(delayMs / 1000),
    });
  }

  async retryFulfillmentForOrder(
    publicOrderId: string,
    adminActor: string,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const { data, error } = await this.db
      .from('payment_orders')
      .select('id, order_id, app_id, payment_status, internal_event_id, fulfillment_status')
      .eq('order_id', publicOrderId)
      .maybeSingle();

    if (error || !data) {
      throw Errors.notFound('Order not found');
    }

    if (String(data.payment_status) !== 'paid') {
      throw Errors.validation('Order is not paid');
    }

    const internalEventId = data.internal_event_id ? String(data.internal_event_id) : null;
    if (!internalEventId) {
      throw Errors.validation('Order has no internal event id');
    }

    await this.enqueueForPaidOrder({
      paymentOrderId: String(data.id),
      internalEventId,
      appUuid: String(data.app_id),
    });

    this.log.info('fulfillment_manual_retry', {
      order_id: publicOrderId,
      admin_actor: adminActor,
    });

    return {
      status: 202,
      body: {
        order_id: String(data.order_id),
        fulfillment_status: 'queued',
        event_id: internalEventId,
      },
    };
  }
}