import { sha256Hex } from '../lib/crypto.ts';
import { Errors } from '../lib/errors.ts';
import type { PayCoreLogger } from '../lib/logger.ts';
import type { PayCoreSupabase } from '../lib/supabase.ts';
import { createDuitkuAdapter } from '../providers/duitku.ts';
import { duitkuCallbackPayloadSchema, type DuitkuCallbackPayload } from '../schemas/webhook.ts';
import type { PayCoreEnv } from '../types/env.ts';
import { AuditService } from './audit-service.ts';
import { FulfillmentService } from './fulfillment-service.ts';

export type WebhookPaidOutcome =
  | 'paid'
  | 'duplicate'
  | 'already_paid'
  | 'invalid_signature'
  | 'order_not_found'
  | 'amount_mismatch'
  | 'invalid_transition'
  | 'ignored';

export interface DuitkuWebhookResult {
  httpStatus: number;
  outcome: WebhookPaidOutcome;
  orderId: string | null;
  internalEventId: string | null;
}

interface OrderLookupRow {
  id: string;
  order_id: string;
  app_id: string;
  merchant_profile_id: string;
  payment_status: string;
}

export class WebhookService {
  private readonly audit: AuditService;
  private readonly fulfillment: FulfillmentService;

  constructor(
    private readonly env: PayCoreEnv,
    private readonly db: PayCoreSupabase,
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
    const order = await this.findOrderByMerchantOrderId(payload.merchantOrderId);
    if (!order) {
      return { httpStatus: 404, outcome: 'order_not_found', orderId: null, internalEventId: null };
    }

    const merchant = await this.loadMerchantProfile(order.merchant_profile_id);
    const adapter = createDuitkuAdapter(this.env);
    const verification = await adapter.verifyWebhook({
      payload,
      merchantCode: merchant.merchant_code,
      apiKey: this.env.DUITKU_API_KEY,
    });

    const payloadHash = await sha256Hex(rawBody);
    const eventId = `pevt_${crypto.randomUUID().replace(/-/g, '')}`;
    const rawPayloadJson = fieldsToJson(payload);

    const { data: rpcRows, error: rpcError } = await this.db.rpc('paycore_record_webhook_paid', {
      p_event_id: eventId,
      p_provider: 'duitku',
      p_merchant_profile_id: order.merchant_profile_id,
      p_order_uuid: order.id,
      p_provider_event_id: verification.providerEventId,
      p_payload_hash: payloadHash,
      p_raw_payload: rawPayloadJson,
      p_signature_valid: verification.valid,
      p_provider_reference: verification.providerReference,
      p_paid_amount: verification.paid ? verification.paidAmount : 0,
    });

    if (rpcError) {
      this.log.error('paycore_record_webhook_paid_failed', { error: rpcError.message });
      throw Errors.internal('Webhook processing failed');
    }

    const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    const outcome = String(row?.outcome ?? 'ignored') as WebhookPaidOutcome;
    const internalEventId =
      row?.internal_event_id === null || row?.internal_event_id === undefined
        ? null
        : String(row.internal_event_id);
    const paymentOrderPublicId =
      row?.payment_order_public_id === null || row?.payment_order_public_id === undefined
        ? order.order_id
        : String(row.payment_order_public_id);

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

  private async findOrderByMerchantOrderId(merchantOrderId: string): Promise<OrderLookupRow | null> {
    const { data, error } = await this.db
      .from('payment_orders')
      .select('id, order_id, app_id, merchant_profile_id, payment_status')
      .eq('order_id', merchantOrderId)
      .maybeSingle();

    if (error) {
      throw Errors.internal(error.message);
    }
    if (!data) return null;

    return {
      id: String(data.id),
      order_id: String(data.order_id),
      app_id: String(data.app_id),
      merchant_profile_id: String(data.merchant_profile_id),
      payment_status: String(data.payment_status),
    };
  }

  private async loadMerchantProfile(id: string): Promise<{ merchant_code: string }> {
    const { data, error } = await this.db
      .from('merchant_profiles')
      .select('merchant_code')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      throw Errors.notFound('Merchant profile not found');
    }

    return { merchant_code: String(data.merchant_code) };
  }
}

function mapOutcomeToHttp(outcome: WebhookPaidOutcome, signatureValid: boolean): number {
  if (!signatureValid || outcome === 'invalid_signature') return 401;
  if (outcome === 'order_not_found') return 404;
  if (outcome === 'amount_mismatch' || outcome === 'invalid_transition') return 422;
  return 200;
}

function parseCallbackBody(rawBody: string): Record<string, string> {
  const trimmed = rawBody.trim();
  if (trimmed.startsWith('{')) {
    const json = JSON.parse(trimmed) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(json)) {
      if (value !== null && value !== undefined) {
        out[key] = String(value);
      }
    }
    return out;
  }

  const params = new URLSearchParams(rawBody);
  const out: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    out[key] = value;
  }
  return out;
}

function fieldsToJson(payload: DuitkuCallbackPayload): Record<string, unknown> {
  return { ...payload };
}