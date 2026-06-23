import type { DuitkuCallbackPayload } from '../schemas/webhook.ts';

export type ProviderName = 'duitku';

export interface CreatePaymentInput {
  merchantOrderId: string;
  amount: number;
  productDetails: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  callbackUrl: string;
  returnUrl: string;
  expiryPeriodMinutes: number;
}

export interface CreatePaymentResult {
  checkoutUrl: string;
  providerReference: string;
  rawResponse: Record<string, unknown>;
}

export interface PaymentStatusResult {
  resultCode: string;
  status: string;
  providerReference: string | null;
  rawResponse: Record<string, unknown>;
}

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

export interface PaymentProviderAdapter {
  readonly provider: ProviderName;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  verifyWebhook(input: WebhookVerificationInput): Promise<WebhookVerificationResult>;
  getPaymentStatus(merchantOrderId: string): Promise<PaymentStatusResult>;
}