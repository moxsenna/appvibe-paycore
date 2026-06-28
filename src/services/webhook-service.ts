import { sha256Hex } from '../lib/crypto.ts';
import { Errors } from '../lib/errors.ts';
import type { PayCoreLogger } from '../lib/logger.ts';
import type { PayCoreDb } from '../db/index.ts';
import { getMerchantCode } from '../db/repositories/apps-repository.ts';
import { findOrderByPublicId, findOrderForMayarWebhook } from '../db/repositories/orders-repository.ts';
import {
  recordVerifiedPayment,
  type WebhookRecordOutcome,
} from '../db/repositories/webhook-repository.ts';
import { createDuitkuAdapter } from '../providers/duitku.ts';
import { createMayarAdapter } from '../providers/mayar.ts';
import { duitkuCallbackPayloadSchema, mayarWebhookPayloadSchema, type DuitkuCallbackPayload } from '../schemas/webhook.ts';
import type { PayCoreEnv } from '../types/env.ts';
import { AuditService } from './audit-service.ts';
import { FulfillmentService } from './fulfillment-service.ts';

export type WebhookPaidOutcome = WebhookRecordOutcome | 'ignored';

export interface WebhookResult {
  httpStatus: number;
  outcome: WebhookPaidOutcome;
  orderId: string | null;
  internalEventId: string | null;
}

export class WebhookService {
  private readonly audit: AuditService;
  private readonly fulfillment: FulfillmentService;

  constructor(
    private readonly env: PayCoreEnv,
    private readonly db: PayCoreDb,
    private readonly log: PayCoreLogger,
  ) {
    this.audit = new AuditService(db, log);
    this.fulfillment = new FulfillmentService(env, db, log);
  }

  async handleDuitkuCallback(rawBody: string): Promise<WebhookResult> {
    const fields = parseCallbackBody(rawBody);
    const parsed = duitkuCallbackPayloadSchema.safeParse(fields);
    if (!parsed.success) {
      throw Errors.validation('Invalid Duitku callback payload');
    }

    const payload: DuitkuCallbackPayload = parsed.data;
    const order = await findOrderByPublicId(this.db, payload.merchantOrderId);
    if (!order) {
      return { httpStatus: 404, outcome: 'order_not_found', orderId: null, internalEventId: null };
    }

    const merchantCode = this.env.DUITKU_MERCHANT_CODE;
    const dbMerchantCode = await getMerchantCode(this.db, order.merchant_profile_id);
    if (dbMerchantCode && dbMerchantCode !== merchantCode && dbMerchantCode !== 'DUMMY_MERCHANT') {
      this.log.warn('merchant_code_drift', {
        db: dbMerchantCode,
        env: merchantCode,
        order_id: order.order_id,
      });
    }
    if (payload.merchantCode && payload.merchantCode !== merchantCode) {
      return {
        httpStatus: 401,
        outcome: 'invalid_signature',
        orderId: order.order_id,
        internalEventId: null,
      };
    }

    const adapter = createDuitkuAdapter(this.env);
    const verification = await adapter.verifyCallback({
      payload,
      merchantCode,
      apiKey: this.env.DUITKU_API_KEY,
    });

    const payloadHash = await sha256Hex(rawBody);
    const eventId = `pevt_${crypto.randomUUID().replace(/-/g, '')}`;

    const recorded = await recordVerifiedPayment(this.db, {
      source: 'webhook',
      verificationMethod: 'provider_signature',
      verificationValid: verification.valid,
      eventId,
      provider: 'duitku',
      merchantProfileId: order.merchant_profile_id,
      orderUuid: order.id,
      providerEventId: verification.providerEventId,
      payloadHash,
      rawPayload: { ...payload },
      providerReference: verification.providerReference,
      paidAmount: verification.paid ? verification.paidAmount : 0,
    });

    const outcome = recorded.outcome as WebhookPaidOutcome;
    const internalEventId = recorded.internalEventId;
    const paymentOrderPublicId = recorded.paymentOrderPublicId ?? order.order_id;

    await this.audit.record({
      actorType: 'provider',
      actorId: 'duitku',
      action: `webhook.${outcome}`,
      entityType: 'payment_order',
      entityId: paymentOrderPublicId,
      metadata: { provider_event_id: verification.providerEventId, signature_valid: verification.valid },
    });

    if (outcome === 'paid' && internalEventId) {
      await this.fulfillment.enqueueForPaidOrder({
        paymentOrderId: order.id,
        internalEventId,
        appUuid: order.app_id,
      });
    }

    const httpStatus = mapOutcomeToHttp(outcome, verification.valid);
    return {
      httpStatus,
      outcome,
      orderId: paymentOrderPublicId,
      internalEventId,
    };
  }

  async handleMayarWebhook(rawBody: string): Promise<WebhookResult> {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawBody);
    } catch {
      return { httpStatus: 400, outcome: 'ignored', orderId: null, internalEventId: null };
    }

    const parsed = mayarWebhookPayloadSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return { httpStatus: 422, outcome: 'ignored', orderId: null, internalEventId: null };
    }

    const payload = parsed.data;
    if (payload.event !== 'payment.received') {
      return { httpStatus: 200, outcome: 'ignored', orderId: null, internalEventId: null };
    }

    const lookupReference = payload.data.id ?? payload.data.transactionId;
    const order = await findOrderForMayarWebhook(this.db, lookupReference);
    
    if (!order) {
      return { httpStatus: 200, outcome: 'order_not_found', orderId: null, internalEventId: null };
    }

    const orderRow = await findOrderByPublicId(this.db, order.order_id);
    if (!orderRow) {
      return { httpStatus: 200, outcome: 'order_not_found', orderId: order.order_id, internalEventId: null };
    }

    const adapter = createMayarAdapter(this.env);
    
    let verification;
    try {
      verification = await adapter.lookupPaymentStatus({
        merchantOrderId: order.order_id,
        providerReference: order.provider_reference
      });
    } catch (err) {
      this.log.error('mayar_webhook_s2s_failed', {
        order_id: order.order_id,
        message: err instanceof Error ? err.message : 'unknown',
      });
      return { httpStatus: 503, outcome: 'ignored', orderId: order.order_id, internalEventId: null };
    }

    if (!verification.paid) {
      return { httpStatus: 200, outcome: 'ignored', orderId: order.order_id, internalEventId: null };
    }

    const payloadHash = await sha256Hex(rawBody);
    const eventId = `pevt_${crypto.randomUUID().replace(/-/g, '')}`;

    const safePayload = {
      event: payload.event,
      data: {
        id: payload.data.id,
        status: payload.data.status,
        amount: payload.data.amount,
        createdAt: payload.data.createdAt,
        updatedAt: payload.data.updatedAt,
      },
    };

    const recorded = await recordVerifiedPayment(this.db, {
      source: 'webhook',
      verificationMethod: 's2s_invoice_lookup',
      verificationValid: true,
      eventId,
      provider: 'mayar',
      merchantProfileId: orderRow.merchant_profile_id,
      orderUuid: orderRow.id,
      providerEventId: payload.data.id ?? payload.data.transactionId ?? 'unknown',
      payloadHash,
      rawPayload: safePayload,
      providerReference: verification.providerReference,
      paidAmount: verification.paidAmount ?? 0,
    });

    const outcome = recorded.outcome as WebhookPaidOutcome;
    const internalEventId = recorded.internalEventId;
    const paymentOrderPublicId = recorded.paymentOrderPublicId ?? orderRow.order_id;

    await this.audit.record({
      actorType: 'provider',
      actorId: 'mayar',
      action: `webhook.${outcome}`,
      entityType: 'payment_order',
      entityId: paymentOrderPublicId,
      metadata: { provider_event_id: payload.data.id, verification_method: 's2s_invoice_lookup' },
    });

    if (outcome === 'paid' && internalEventId) {
      await this.fulfillment.enqueueForPaidOrder({
        paymentOrderId: orderRow.id,
        internalEventId,
        appUuid: orderRow.app_id,
      });
    }

    const httpStatus = mapOutcomeToHttp(outcome, true);
    return {
      httpStatus,
      outcome,
      orderId: paymentOrderPublicId,
      internalEventId,
    };
  }
}

function mapOutcomeToHttp(outcome: WebhookPaidOutcome, signatureValid: boolean): number {
  if (!signatureValid && outcome === 'invalid_signature') return 401;
  if (outcome === 'order_not_found') return 404;
  if (outcome === 'amount_mismatch' || outcome === 'invalid_transition') return 409;
  return 200;
}

function parseCallbackBody(rawBody: string): Record<string, string> {
  const params = new URLSearchParams(rawBody);
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) {
    out[k] = v;
  }
  if (Object.keys(out).length > 0) return out;
  try {
    const json = JSON.parse(rawBody) as Record<string, unknown>;
    for (const [k, v] of Object.entries(json)) {
      if (v !== null && v !== undefined) out[k] = String(v);
    }
  } catch {
    /* empty */
  }
  return out;
}