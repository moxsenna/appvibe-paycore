import { sha256Hex } from '../lib/crypto.ts';
import { Errors } from '../lib/errors.ts';
import type { PayCoreLogger } from '../lib/logger.ts';
import type { PayCoreDb } from '../db/index.ts';
import { getMerchantCode } from '../db/repositories/apps-repository.ts';
import { findOrderByPublicId } from '../db/repositories/orders-repository.ts';
import {
  recordWebhookPaid,
  type WebhookRecordOutcome,
} from '../db/repositories/webhook-repository.ts';
import { createDuitkuAdapter } from '../providers/duitku.ts';
import { duitkuCallbackPayloadSchema, type DuitkuCallbackPayload } from '../schemas/webhook.ts';
import type { PayCoreEnv } from '../types/env.ts';
import { AuditService } from './audit-service.ts';
import { FulfillmentService } from './fulfillment-service.ts';

export type WebhookPaidOutcome = WebhookRecordOutcome | 'ignored';

export interface DuitkuWebhookResult {
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

  async handleDuitkuCallback(rawBody: string): Promise<DuitkuWebhookResult> {
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

    const merchantCode = await getMerchantCode(this.db, order.merchant_profile_id);
    if (!merchantCode) {
      throw Errors.internal('Merchant profile missing');
    }

    const adapter = createDuitkuAdapter(this.env);
    const verification = await adapter.verifyWebhook({
      payload,
      merchantCode,
      apiKey: this.env.DUITKU_API_KEY,
    });

    const payloadHash = await sha256Hex(rawBody);
    const eventId = `pevt_${crypto.randomUUID().replace(/-/g, '')}`;

    const recorded = await recordWebhookPaid(this.db, {
      eventId,
      provider: 'duitku',
      merchantProfileId: order.merchant_profile_id,
      orderUuid: order.id,
      providerEventId: verification.providerEventId,
      payloadHash,
      rawPayload: { ...payload },
      signatureValid: verification.valid,
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