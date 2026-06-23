import {
  duitkuCallbackSignatureMd5,
  duitkuRequestSignatureMd5,
  timingSafeEqual,
} from '../lib/crypto.ts';
import { Errors } from '../lib/errors.ts';
import type { DuitkuCallbackPayload } from '../schemas/webhook.ts';
import type { PayCoreEnv } from '../types/env.ts';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProviderAdapter,
  PaymentStatusResult,
  WebhookVerificationInput,
  WebhookVerificationResult,
} from './types.ts';

const CREATE_PATH = '/webapi/api/merchant/v2/inquiry';
const STATUS_PATH = '/webapi/api/merchant/transactionStatus';

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function parsePaidAmount(amount: string | number): number {
  if (typeof amount === 'number') return Math.round(amount);
  const digits = String(amount).replace(/[^\d]/g, '');
  const parsed = Number.parseInt(digits, 10);
  if (Number.isNaN(parsed)) {
    throw Errors.validation('Invalid callback amount');
  }
  return parsed;
}

function callbackAmountString(amount: string | number): string {
  if (typeof amount === 'string') return amount;
  return String(amount);
}

export class DuitkuAdapter implements PaymentProviderAdapter {
  readonly provider = 'duitku' as const;

  constructor(private readonly env: PayCoreEnv) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const merchantCode = this.env.DUITKU_MERCHANT_CODE;
    const apiKey = this.env.DUITKU_API_KEY;
    const signature = duitkuRequestSignatureMd5(
      merchantCode,
      input.amount,
      input.merchantOrderId,
      apiKey,
    );

    const body = {
      merchantCode,
      paymentAmount: input.amount,
      paymentMethod: 'SP',
      merchantOrderId: input.merchantOrderId,
      productDetails: input.productDetails,
      customerVaName: input.customerName.slice(0, 20),
      email: input.customerEmail,
      phoneNumber: input.customerPhone,
      callbackUrl: input.callbackUrl,
      returnUrl: input.returnUrl,
      expiryPeriod: input.expiryPeriodMinutes,
      signature,
    };

    const res = await fetch(`${normalizeBaseUrl(this.env.DUITKU_BASE_URL)}${CREATE_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as Record<string, unknown>;
    const statusCode = String(json.statusCode ?? '');
    if (!res.ok || statusCode !== '00') {
      const message = String(json.statusMessage ?? json.Message ?? 'Duitku inquiry failed');
      throw new Error(message);
    }

    const checkoutUrl = String(json.paymentUrl ?? '');
    if (!checkoutUrl) {
      throw Errors.internal('Duitku missing paymentUrl');
    }

    const providerReference = String(
      json.reference ?? json.publisherOrderId ?? input.merchantOrderId,
    );

    return {
      checkoutUrl,
      providerReference,
      rawResponse: json,
    };
  }

  async verifyWebhook(input: WebhookVerificationInput): Promise<WebhookVerificationResult> {
    const { payload, merchantCode, apiKey } = input;
    const amountStr = callbackAmountString(payload.amount);
    const expected = duitkuCallbackSignatureMd5(
      merchantCode,
      amountStr,
      payload.merchantOrderId,
      apiKey,
    );
    const valid = timingSafeEqual(expected.toLowerCase(), payload.signature.toLowerCase());
    const paid = valid && payload.resultCode === '00';
    const paidAmount = parsePaidAmount(payload.amount);
    const providerReference = payload.reference ?? null;
    const providerEventId =
      payload.reference ?? `${payload.merchantOrderId}:${payload.resultCode}:${amountStr}`;

    return {
      valid,
      paid,
      paidAmount,
      providerReference,
      providerEventId,
    };
  }

  async getPaymentStatus(merchantOrderId: string): Promise<PaymentStatusResult> {
    const merchantCode = this.env.DUITKU_MERCHANT_CODE;
    const signature = duitkuRequestSignatureMd5(
      merchantCode,
      0,
      merchantOrderId,
      this.env.DUITKU_API_KEY,
    );

    const res = await fetch(`${normalizeBaseUrl(this.env.DUITKU_BASE_URL)}${STATUS_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchantCode, merchantOrderId, signature }),
    });

    const json = (await res.json()) as Record<string, unknown>;
    const resultCode = String(json.resultCode ?? json.statusCode ?? '');
    const status = String(json.statusMessage ?? json.resultMessage ?? 'unknown');
    const providerReference =
      typeof json.reference === 'string' ? json.reference : null;

    return { resultCode, status, providerReference, rawResponse: json };
  }
}

export function createDuitkuAdapter(env: PayCoreEnv): DuitkuAdapter {
  return new DuitkuAdapter(env);
}

export function parseDuitkuCallbackFields(
  fields: Record<string, string>,
): DuitkuCallbackPayload {
  return {
    merchantCode: fields.merchantCode ?? '',
    amount: fields.amount ?? '0',
    merchantOrderId: fields.merchantOrderId ?? '',
    productDetail: fields.productDetail,
    additionalParam: fields.additionalParam,
    paymentCode: fields.paymentCode,
    resultCode: fields.resultCode ?? '',
    merchantUserId: fields.merchantUserId,
    reference: fields.reference,
    signature: fields.signature ?? '',
  };
}