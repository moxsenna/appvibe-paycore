import {
  duitkuCallbackSignatureMd5,
  duitkuRequestSignatureMd5,
  hmacSha256Hex,
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
  PaymentStatusLookupInput,
} from './types.ts';

export interface WebhookVerificationInput {
  payload: DuitkuCallbackPayload;
  merchantCode: string;
  apiKey: string;
}

export interface WebhookVerificationResult {
  valid: boolean;
  paid: boolean;
  paidAmount: number;
  providerReference: string | null;
  providerEventId: string;
}

const CREATE_PATH = '/api/merchant/createInvoice';
const STATUS_PATH = '/webapi/api/merchant/transactionStatus';

function getDuitkuPopBaseUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.includes('sandbox.duitku.com')) {
    return 'https://api-sandbox.duitku.com';
  }
  if (normalized.includes('passport.duitku.com') || normalized.includes('api-prod.duitku.com')) {
    return 'https://api-prod.duitku.com';
  }
  return normalized;
}

function getDuitkuApiBaseUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.includes('api-sandbox.duitku.com')) {
    return 'https://sandbox.duitku.com';
  }
  if (normalized.includes('api-prod.duitku.com')) {
    return 'https://passport.duitku.com';
  }
  return normalized;
}

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
    const timestamp = Date.now();
    const signature = await hmacSha256Hex(apiKey, `${merchantCode}${timestamp}`);

    const body = {
      paymentAmount: input.amount,
      merchantOrderId: input.merchantOrderId,
      productDetails: input.productDetails,
      customerVaName: input.customerName.slice(0, 20),
      email: input.customerEmail,
      phoneNumber: input.customerPhone,
      callbackUrl: input.callbackUrl,
      returnUrl: input.returnUrl,
      expiryPeriod: input.expiryPeriodMinutes,
      itemDetails: [
        {
          name: input.productDetails.slice(0, 50),
          price: input.amount,
          quantity: 1,
        },
      ],
    };

    const popBaseUrl = getDuitkuPopBaseUrl(this.env.DUITKU_BASE_URL);

    const res = await fetch(`${popBaseUrl}${CREATE_PATH}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json; charset=UTF-8',
        'x-duitku-signature': signature,
        'x-duitku-timestamp': String(timestamp),
        'x-duitku-merchantcode': merchantCode,
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as Record<string, unknown>;
    const statusCode = String(json.statusCode ?? '');
    if (!res.ok || statusCode !== '00') {
      const message = String(json.statusMessage ?? json.Message ?? 'Duitku invoice creation failed');
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

  async verifyCallback(input: WebhookVerificationInput): Promise<WebhookVerificationResult> {
    const { payload, merchantCode, apiKey } = input;
    const amountStr = callbackAmountString(payload.amount);
    const expectedPop = await hmacSha256Hex(
      apiKey,
      `${merchantCode}${amountStr}${payload.merchantOrderId}`,
    );
    const expectedLegacy = duitkuCallbackSignatureMd5(
      merchantCode,
      amountStr,
      payload.merchantOrderId,
      apiKey,
    );
    const signature = payload.signature.toLowerCase();
    const valid =
      timingSafeEqual(expectedPop.toLowerCase(), signature) ||
      timingSafeEqual(expectedLegacy.toLowerCase(), signature);
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

  async lookupPaymentStatus(input: PaymentStatusLookupInput): Promise<PaymentStatusResult> {
    const merchantOrderId = input.merchantOrderId;
    if (!merchantOrderId) {
      throw Errors.validation('merchantOrderId is required for Duitku lookup');
    }
    const merchantCode = this.env.DUITKU_MERCHANT_CODE;
    const signature = duitkuRequestSignatureMd5(
      merchantCode,
      0,
      merchantOrderId,
      this.env.DUITKU_API_KEY,
    );

    const res = await fetch(`${getDuitkuApiBaseUrl(this.env.DUITKU_BASE_URL)}${STATUS_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchantCode, merchantOrderId, signature }),
    });

    const json = (await res.json()) as Record<string, unknown>;
    const resultCode = String(json.resultCode ?? json.statusCode ?? '');
    const status = String(json.statusMessage ?? json.resultMessage ?? 'unknown');
    const providerReference =
      typeof json.reference === 'string' ? json.reference : null;

    const paid = resultCode === '00';

    return { 
      status, 
      paid,
      paidAmount: null,
      providerReference, 
      providerTransactionReference: null,
      rawResponse: json 
    };
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
