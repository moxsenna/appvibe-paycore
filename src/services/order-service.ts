import { sha256Hex } from '../lib/crypto.ts';
import { Errors } from '../lib/errors.ts';
import {
  assertIdempotencyOutcome,
  mapIdempotencyRpcRow,
} from '../lib/idempotency.ts';
import type { PayCoreLogger } from '../lib/logger.ts';
import { encryptPii } from '../lib/pii.ts';
import { generateOrderId } from '../lib/order-id.ts';
import type { PayCoreSupabase } from '../lib/supabase.ts';
import { createDuitkuAdapter } from '../providers/duitku.ts';
import type { CreateOrderRequest } from '../schemas/order.ts';
import type { PayCoreEnv } from '../types/env.ts';

const ORDER_EXPIRY_MINUTES = 24 * 60;

interface AppRow {
  id: string;
  app_id: string;
  order_prefix: string;
  default_merchant_profile_id: string | null;
  allowed_return_urls: unknown;
  status: string;
}

interface MerchantProfileRow {
  id: string;
  profile_key: string;
  provider: string;
  merchant_code: string;
}

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
      const prefix = new URL(entry);
      if (prefix.origin === target.origin && target.pathname.startsWith(prefix.pathname)) {
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
    private readonly db: PayCoreSupabase,
    private readonly log: PayCoreLogger,
  ) {}

  async createOrder(params: CreateOrderParams): Promise<ServiceJsonResult> {
    const requestHash = await sha256Hex(params.requestBodyRaw);

    const { data: reserveRows, error: reserveError } = await this.db.rpc(
      'paycore_reserve_idempotency',
      {
        p_app_id: params.appUuid,
        p_key: params.idempotencyKey,
        p_request_hash: requestHash,
      },
    );

    if (reserveError) {
      this.log.error('idempotency_reserve_failed', { error: reserveError.message });
      throw Errors.internal('Idempotency reserve failed');
    }

    const reserveRow = Array.isArray(reserveRows) ? reserveRows[0] : reserveRows;
    const reserve = mapIdempotencyRpcRow({
      outcome: String(reserveRow?.outcome ?? 'reserved_new'),
      payment_order_id:
        reserveRow?.payment_order_id === null || reserveRow?.payment_order_id === undefined
          ? null
          : String(reserveRow.payment_order_id),
      response_body:
        reserveRow?.response_body && typeof reserveRow.response_body === 'object'
          ? (reserveRow.response_body as Record<string, unknown>)
          : null,
    });

    assertIdempotencyOutcome(reserve);

    if (reserve.outcome === 'replay' && reserve.responseBody) {
      return { status: 200, body: reserve.responseBody };
    }

    const app = await this.loadApp(params.appUuid);
    if (app.status !== 'active') {
      throw Errors.forbidden('App is not active');
    }

    if (!returnUrlAllowed(params.body.return_url, app.allowed_return_urls)) {
      throw Errors.validation('return_url is not allowlisted for this app');
    }

    const merchant = await this.resolveMerchantProfile(
      app.default_merchant_profile_id,
      params.body.merchant_profile_id,
    );

    if (merchant.provider !== 'duitku') {
      throw Errors.validation('Unsupported payment provider');
    }

    const orderId = generateOrderId(app.order_prefix);
    const expiresAt = new Date(Date.now() + ORDER_EXPIRY_MINUTES * 60_000).toISOString();

    const nameEnc = await encryptPii(params.body.customer.name, this.env.PAYCORE_ENCRYPTION_KEY);
    const emailEnc = await encryptPii(params.body.customer.email, this.env.PAYCORE_ENCRYPTION_KEY);
    const phoneEnc = params.body.customer.phone
      ? await encryptPii(params.body.customer.phone, this.env.PAYCORE_ENCRYPTION_KEY)
      : null;

    const { data: inserted, error: insertError } = await this.db
      .from('payment_orders')
      .insert({
        order_id: orderId,
        app_id: app.id,
        merchant_profile_id: merchant.id,
        external_order_id: params.body.external_order_id,
        product_key: params.body.product_key ?? null,
        description: params.body.description,
        amount: params.body.amount,
        currency: params.body.currency,
        payment_status: 'created',
        fulfillment_status: 'pending',
        provider: merchant.provider,
        return_url: params.body.return_url,
        customer_name_encrypted: nameEnc,
        customer_email_encrypted: emailEnc,
        customer_phone_encrypted: phoneEnc,
        fulfillment_data: params.body.fulfillment_data ?? {},
        expires_at: expiresAt,
      })
      .select('id')
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        throw Errors.conflict('external_order_id already exists for this app');
      }
      this.log.error('order_insert_failed', { error: insertError.message });
      throw Errors.internal('Failed to create order');
    }

    const orderUuid = String(inserted.id);
    const adapter = createDuitkuAdapter(this.env);
    const paycoreReturnUrl = `${this.env.PAYCORE_PUBLIC_BASE_URL.replace(/\/+$/, '')}/return/${orderId}`;
    const callbackUrl = `${this.env.PAYCORE_PUBLIC_BASE_URL.replace(/\/+$/, '')}/webhooks/duitku`;

    let checkoutUrl: string | null = null;
    let providerReference: string | null = null;
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
      });
      checkoutUrl = created.checkoutUrl;
      providerReference = created.providerReference;
    } catch (err) {
      paymentStatus = 'create_failed';
      this.log.error('duitku_create_failed', {
        order_id: orderId,
        message: err instanceof Error ? err.message : 'unknown',
      });
      await this.db
        .from('payment_orders')
        .update({ payment_status: 'create_failed', updated_at: new Date().toISOString() })
        .eq('id', orderUuid);
    }

    if (paymentStatus === 'pending') {
      await this.db
        .from('payment_orders')
        .update({
          payment_status: 'pending',
          checkout_url: checkoutUrl,
          provider_reference: providerReference,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderUuid);
    }

    const responseBody: Record<string, unknown> = {
      order_id: orderId,
      external_order_id: params.body.external_order_id,
      payment_status: paymentStatus,
      fulfillment_status: 'pending',
      provider: merchant.provider,
      checkout_url: checkoutUrl,
      expires_at: expiresAt,
    };

    const { error: completeError } = await this.db.rpc('paycore_complete_idempotency', {
      p_app_id: params.appUuid,
      p_key: params.idempotencyKey,
      p_payment_order_id: orderUuid,
      p_response_body: responseBody,
    });

    if (completeError) {
      this.log.error('idempotency_complete_failed', { error: completeError.message });
    }

    const status = paymentStatus === 'create_failed' ? 502 : 201;
    return { status, body: responseBody };
  }

  async getOrderForApp(orderId: string, appUuid: string): Promise<Record<string, unknown>> {
    const { data, error } = await this.db
      .from('payment_orders')
      .select(
        'order_id, external_order_id, payment_status, fulfillment_status, provider, amount, currency, checkout_url, expires_at, paid_at',
      )
      .eq('order_id', orderId)
      .eq('app_id', appUuid)
      .maybeSingle();

    if (error) {
      throw Errors.internal('Failed to load order');
    }
    if (!data) {
      throw Errors.notFound('Order not found');
    }

    return {
      order_id: data.order_id,
      external_order_id: data.external_order_id,
      payment_status: data.payment_status,
      fulfillment_status: data.fulfillment_status,
      provider: data.provider,
      amount: Number(data.amount),
      currency: data.currency,
      checkout_url: data.checkout_url,
      expires_at: data.expires_at,
      paid_at: data.paid_at,
    };
  }

  private async loadApp(appUuid: string): Promise<AppRow> {
    const { data, error } = await this.db
      .from('apps')
      .select('id, app_id, order_prefix, default_merchant_profile_id, allowed_return_urls, status')
      .eq('id', appUuid)
      .maybeSingle();

    if (error || !data) {
      throw Errors.notFound('App not found');
    }

    return {
      id: String(data.id),
      app_id: String(data.app_id),
      order_prefix: String(data.order_prefix),
      default_merchant_profile_id:
        data.default_merchant_profile_id === null
          ? null
          : String(data.default_merchant_profile_id),
      allowed_return_urls: data.allowed_return_urls,
      status: String(data.status),
    };
  }

  private async resolveMerchantProfile(
    defaultId: string | null,
    profileKey?: string,
  ): Promise<MerchantProfileRow> {
    let query = this.db
      .from('merchant_profiles')
      .select('id, profile_key, provider, merchant_code')
      .eq('status', 'active');

    if (profileKey) {
      query = query.eq('profile_key', profileKey);
    } else if (defaultId) {
      query = query.eq('id', defaultId);
    } else {
      throw Errors.validation('merchant_profile_id is required');
    }

    const { data, error } = await query.maybeSingle();
    if (error || !data) {
      throw Errors.validation('Merchant profile not found');
    }

    return {
      id: String(data.id),
      profile_key: String(data.profile_key),
      provider: String(data.provider),
      merchant_code: String(data.merchant_code),
    };
  }
}