import { sha256Hex } from '../lib/crypto.ts';
import { Errors } from '../lib/errors.ts';
import { assertIdempotencyOutcome } from '../lib/idempotency.ts';
import type { PayCoreLogger } from '../lib/logger.ts';
import { encryptPii } from '../lib/pii.ts';
import { generateOrderId } from '../lib/order-id.ts';
import { msToIso, nowMs } from '../lib/time.ts';
import type { PayCoreDb } from '../db/index.ts';
import { getAppByUuid, getActiveMerchantProfile } from '../db/repositories/apps-repository.ts';
import {
  completeIdempotency,
  reserveIdempotency,
} from '../db/repositories/idempotency-repository.ts';
import {
  getOrderForApp,
  insertPaymentOrder,
  updateOrderCheckout,
} from '../db/repositories/orders-repository.ts';
import { createDuitkuAdapter } from '../providers/duitku.ts';
import { createMayarAdapter } from '../providers/mayar.ts';
import type { PaymentProviderAdapter } from '../providers/types.ts';
import type { CreateOrderRequest } from '../schemas/order.ts';
import type { PayCoreEnv } from '../types/env.ts';

const ORDER_EXPIRY_MINUTES = 24 * 60;

export interface CreateOrderParams {
  appUuid: string;
  idempotencyKey: string;
  requestBodyRaw: string;
  body: CreateOrderRequest;
}

export interface ServiceJsonResult {
  status: number;
  body: Record<string, unknown>;
}

function returnUrlAllowed(returnUrl: string, allowed: unknown): boolean {
  if (!Array.isArray(allowed)) return false;
  let target: URL;
  try {
    target = new URL(returnUrl);
  } catch {
    return false;
  }
  for (const entry of allowed) {
    if (typeof entry !== 'string') continue;
    try {
      const allowedUrl = new URL(entry);
      if (allowedUrl.origin === target.origin && target.pathname.startsWith(allowedUrl.pathname)) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

export class OrderService {
  constructor(
    private readonly env: PayCoreEnv,
    private readonly db: PayCoreDb,
    private readonly log: PayCoreLogger,
  ) {}

  async createOrder(params: CreateOrderParams): Promise<ServiceJsonResult> {
    const requestHash = await sha256Hex(params.requestBodyRaw);
    const reserve = await reserveIdempotency(
      this.db,
      params.appUuid,
      params.idempotencyKey,
      requestHash,
    );
    assertIdempotencyOutcome(reserve);

    if (reserve.outcome === 'replay' && reserve.responseBody) {
      return { status: 200, body: reserve.responseBody };
    }

    const app = await getAppByUuid(this.db, params.appUuid);
    if (!app || app.status !== 'active') {
      throw Errors.forbidden('App is not active');
    }

    if (!returnUrlAllowed(params.body.return_url, app.allowed_return_urls)) {
      throw Errors.validation('return_url is not allowlisted for this app');
    }

    if (params.body.merchant_profile_id && params.body.merchant_profile_id !== app.default_merchant_profile_id) {
      throw Errors.forbidden('Merchant profile is not assigned to this app');
    }

    const merchant = await getActiveMerchantProfile(this.db, {
      profileKey: app.default_merchant_profile_id ?? undefined,
      defaultId: app.default_merchant_profile_id ?? undefined,
    });
    if (!merchant) {
      throw Errors.validation('Merchant profile not found');
    }
    if (merchant.provider !== 'duitku' && merchant.provider !== 'mayar') {
      throw Errors.validation('Unsupported payment provider');
    }
    if (merchant.provider === 'mayar' && !params.body.customer.phone) {
      throw Errors.validation('Customer phone is required for Mayar provider');
    }

    const orderId = generateOrderId(app.order_prefix);
    const expiresAtMs = nowMs() + ORDER_EXPIRY_MINUTES * 60_000;

    const nameEnc = await encryptPii(params.body.customer.name, this.env.PAYCORE_ENCRYPTION_KEY);
    const emailEnc = await encryptPii(params.body.customer.email, this.env.PAYCORE_ENCRYPTION_KEY);
    const phoneEnc = params.body.customer.phone
      ? await encryptPii(params.body.customer.phone, this.env.PAYCORE_ENCRYPTION_KEY)
      : null;

    let orderUuid: string;
    try {
      orderUuid = await insertPaymentOrder(this.db, {
        order_id: orderId,
        app_id: app.id,
        merchant_profile_id: merchant.id,
        external_order_id: params.body.external_order_id,
        product_key: params.body.product_key ?? null,
        description: params.body.description,
        amount: params.body.amount,
        currency: params.body.currency,
        provider: merchant.provider,
        return_url: params.body.return_url,
        customer_name_encrypted: nameEnc,
        customer_email_encrypted: emailEnc,
        customer_phone_encrypted: phoneEnc,
        fulfillment_data: params.body.fulfillment_data ?? {},
        expires_at_ms: expiresAtMs,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('UNIQUE') || msg.includes('unique')) {
        throw Errors.conflict('external_order_id already exists for this app');
      }
      this.log.error('order_insert_failed', { error: msg });
      throw Errors.internal('Failed to create order');
    }

    const adapter: PaymentProviderAdapter = merchant.provider === 'mayar' 
      ? createMayarAdapter(this.env) 
      : createDuitkuAdapter(this.env);
      
    const paycoreReturnUrl = `${this.env.PAYCORE_PUBLIC_BASE_URL.replace(/\/+$/, '')}/return/${orderId}`;
    const callbackUrl = `${this.env.PAYCORE_PUBLIC_BASE_URL.replace(/\/+$/, '')}/webhooks/${merchant.provider}`;

    let checkoutUrl: string | null = null;
    let providerReference: string | null = null;
    let providerTransactionReference: string | null = null;
    let paymentStatus = 'pending';

    try {
      const created = await adapter.createPayment({
        merchantOrderId: orderId,
        amount: params.body.amount,
        productDetails: params.body.description,
        customerName: params.body.customer.name,
        customerEmail: params.body.customer.email,
        customerPhone: params.body.customer.phone ?? '0000000000',
        callbackUrl,
        returnUrl: paycoreReturnUrl,
        expiryPeriodMinutes: ORDER_EXPIRY_MINUTES,
        productKey: params.body.product_key ?? 'unknown',
        expiresAt: msToIso(expiresAtMs) ?? new Date(expiresAtMs).toISOString(),
      });
      checkoutUrl = created.checkoutUrl;
      providerReference = created.providerReference;
      providerTransactionReference = created.providerTransactionReference ?? null;
    } catch (err) {
      paymentStatus = 'create_failed';
      this.log.error(`${merchant.provider}_create_failed`, {
        order_id: orderId,
        message: err instanceof Error ? err.message : 'unknown',
      });
      await updateOrderCheckout(this.db, orderUuid, { payment_status: 'create_failed' });
    }

    if (paymentStatus === 'pending') {
      await updateOrderCheckout(this.db, orderUuid, {
        payment_status: 'pending',
        checkout_url: checkoutUrl,
        provider_reference: providerReference,
        provider_transaction_reference: providerTransactionReference,
      });
    }

    const responseBody: Record<string, unknown> = {
      order_id: orderId,
      external_order_id: params.body.external_order_id,
      payment_status: paymentStatus,
      fulfillment_status: 'pending',
      provider: merchant.provider,
      checkout_url: checkoutUrl,
      expires_at: msToIso(expiresAtMs),
    };

    await completeIdempotency(
      this.db,
      params.appUuid,
      params.idempotencyKey,
      orderUuid,
      responseBody,
    );

    const status = paymentStatus === 'create_failed' ? 502 : 201;
    return { status, body: responseBody };
  }

  async getOrderForApp(orderId: string, appUuid: string): Promise<Record<string, unknown>> {
    const order = await getOrderForApp(this.db, orderId, appUuid);
    if (!order) {
      throw Errors.notFound('Order not found');
    }
    return order;
  }
}