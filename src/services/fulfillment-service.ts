import type { PayCoreDb } from '../db/index.ts';
import { getOrderForFulfillment } from '../db/repositories/orders-repository.ts';
import { updateOrderStatuses } from '../db/repositories/orders-repository.ts';
import { getOrderUuidByPublicId } from '../db/repositories/orders-repository.ts';
import { resolveWebhookSecret } from '../config/env.ts';
import { buildWebhookEventSignature } from '../lib/crypto.ts';
import { Errors } from '../lib/errors.ts';
import { RETRY_DELAYS_MS } from '../lib/fulfillment-retry.ts';
import type { PayCoreLogger } from '../lib/logger.ts';
import { msToIso, nowIso, nowMs } from '../lib/time.ts';
import type { PayCoreEnv } from '../types/env.ts';
import type { FulfillmentQueueMessage } from '../types/queue.ts';
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
    product_key: string | null;
    fulfillment_data: Record<string, unknown>;
    paid_at: string;
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
      product_key: order.product_key,
      fulfillment_data: order.fulfillment_data,
      paid_at: order.paid_at,
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
    throw Errors.internal('Webhook secret not configured');
  }
  const rawJson = JSON.stringify(payload);
  const timestamp = nowIso();
  const signature = await buildWebhookEventSignature(secret, timestamp, rawJson);
  const res = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PayCore-Event-Timestamp': timestamp,
      'X-PayCore-Event-Signature': signature,
    },
    body: rawJson,
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

export class FulfillmentService {
  constructor(
    private readonly env: PayCoreEnv,
    private readonly db: PayCoreDb,
    private readonly log: PayCoreLogger,
  ) {}

  async enqueueForPaidOrder(params: {
    paymentOrderId: string;
    internalEventId: string;
    appUuid: string;
  }): Promise<void> {
    const orderRow = await getOrderForFulfillment(this.db, params.paymentOrderId);
    if (!orderRow) {
      throw Errors.notFound('Order not found for fulfillment enqueue');
    }

    const paidAt = orderRow.paid_at ? msToIso(orderRow.paid_at) ?? nowIso() : nowIso();
    const payload = buildPaymentSucceededPayload({
      internal_event_id: params.internalEventId,
      order_id: orderRow.order_id,
      external_order_id: orderRow.external_order_id,
      app_id_slug: orderRow.app_id_slug,
      provider: orderRow.provider,
      provider_reference: orderRow.provider_reference,
      amount: orderRow.amount,
      currency: orderRow.currency,
      product_key: orderRow.product_key,
      fulfillment_data: orderRow.fulfillment_data,
      paid_at: paidAt,
    });

    const deliveryId = await ensureDeliveryRowForPaidEvent(this.db, {
      eventId: params.internalEventId,
      paymentOrderId: params.paymentOrderId,
      appId: params.appUuid,
      targetUrl: orderRow.webhook_url,
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
    await updateOrderStatuses(this.db, params.paymentOrderId, { fulfillment_status: 'queued' });

    this.log.info('fulfillment_enqueued', {
      event_id: params.internalEventId,
      payment_order_id: params.paymentOrderId,
      delivery_id: deliveryId,
    });
  }

  async processQueueMessage(message: FulfillmentQueueMessage): Promise<void> {
    const claim = await claimFulfillmentDelivery(this.db, message.deliveryId, nowMs());
    if (!claim?.claimed) {
      this.log.info('fulfillment_claim_skipped', {
        delivery_id: message.deliveryId,
        event_id: message.eventId,
      });
      return;
    }

    const attemptNumber = claim.attempt_number ?? message.attemptNumber;
    const orderRow = await getOrderForFulfillment(this.db, message.paymentOrderId);
    if (!orderRow) {
      throw Errors.notFound('Order not found for fulfillment');
    }

    const internalEventId = orderRow.internal_event_id ?? message.eventId;
    const paidAt = orderRow.paid_at ? msToIso(orderRow.paid_at) ?? nowIso() : nowIso();
    const payload = buildPaymentSucceededPayload({
      internal_event_id: internalEventId,
      order_id: orderRow.order_id,
      external_order_id: orderRow.external_order_id,
      app_id_slug: orderRow.app_id_slug,
      provider: orderRow.provider,
      provider_reference: orderRow.provider_reference,
      amount: orderRow.amount,
      currency: orderRow.currency,
      product_key: orderRow.product_key,
      fulfillment_data: orderRow.fulfillment_data,
      paid_at: paidAt,
    });

    const delivery = await deliverFulfillment(
      this.env,
      orderRow.webhook_url,
      orderRow.webhook_secret_ref,
      payload,
    );

    const outcome = await markDeliveryOutcome(this.db, message.deliveryId, {
      ok: delivery.ok,
      attemptNumber,
      responseStatus: delivery.status,
      responseBody: delivery.body,
      paymentOrderUuid: orderRow.id,
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
    const data = await getOrderUuidByPublicId(this.db, publicOrderId);
    if (!data) {
      throw Errors.notFound('Order not found');
    }

    if (data.payment_status !== 'paid') {
      throw Errors.validation('Order is not paid');
    }

    const internalEventId = data.internal_event_id;
    if (!internalEventId) {
      throw Errors.validation('Order has no internal event id');
    }

    await this.enqueueForPaidOrder({
      paymentOrderId: data.id,
      internalEventId,
      appUuid: data.app_id,
    });

    this.log.info('fulfillment_manual_retry', {
      order_id: publicOrderId,
      admin_actor: adminActor,
    });

    return {
      status: 202,
      body: {
        order_id: publicOrderId,
        fulfillment_status: 'queued',
        event_id: internalEventId,
      },
    };
  }
}