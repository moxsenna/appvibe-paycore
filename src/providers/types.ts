export type ProviderName = 'duitku' | 'mayar';

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
  productKey: string;
  expiresAt: string;
}

export interface CreatePaymentResult {
  checkoutUrl: string;
  providerReference: string;
  providerTransactionReference?: string | null;
  rawResponse: Record<string, unknown>;
}

export interface PaymentStatusResult {
  status: string;
  paid: boolean;
  paidAmount: number | null;
  providerReference: string | null;
  providerTransactionReference: string | null;
  rawResponse: Record<string, unknown>;
}

export interface PaymentStatusLookupInput {
  merchantOrderId: string;
  providerReference: string | null;
  providerTransactionReference?: string | null;
}

export interface PaymentProviderAdapter {
  readonly provider: ProviderName;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  lookupPaymentStatus(input: PaymentStatusLookupInput): Promise<PaymentStatusResult>;
}