import { Errors } from '../lib/errors.ts';
import type { PayCoreEnv } from '../types/env.ts';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProviderAdapter,
  PaymentStatusLookupInput,
  PaymentStatusResult,
} from './types.ts';

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export class MayarAdapter implements PaymentProviderAdapter {
  readonly provider = 'mayar' as const;

  constructor(private readonly env: PayCoreEnv) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const apiKey = this.env.MAYAR_API_KEY;
    const baseUrl = normalizeBaseUrl(this.env.MAYAR_BASE_URL);

    const body = {
      name: input.customerName,
      email: input.customerEmail,
      mobile: input.customerPhone,
      redirectUrl: input.returnUrl,
      description: input.productDetails,
      expiredAt: input.expiresAt,
      items: [
        {
          quantity: 1,
          rate: input.amount,
          description: input.productDetails.slice(0, 50),
        },
      ],
      extraData: {
        noCustomer: input.merchantOrderId,
        idProd: input.productKey,
      },
    };

    const res = await fetch(`${baseUrl}/hl/v1/invoice/create`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as Record<string, unknown>;
    
    // Some Mayar API errors return a different structure.
    if (!res.ok) {
      const message = String(json.message ?? json.error ?? 'Mayar invoice creation failed');
      throw new Error(message);
    }
    
    const data = json.data as Record<string, unknown> | undefined;
    if (!data) {
      throw Errors.internal('Mayar missing data object');
    }

    const checkoutUrl = String(data.link ?? '');
    if (!checkoutUrl) {
      throw Errors.internal('Mayar missing link');
    }

    const providerReference = String(data.id ?? '');
    const providerTransactionReference = data.transactionId ? String(data.transactionId) : null;

    if (!providerReference) {
      throw Errors.internal('Mayar missing invoice id');
    }

    return {
      checkoutUrl,
      providerReference,
      providerTransactionReference,
      rawResponse: json,
    };
  }

  async lookupPaymentStatus(input: PaymentStatusLookupInput): Promise<PaymentStatusResult> {
    const invoiceId = input.providerReference;
    if (!invoiceId) {
      throw Errors.validation('providerReference (Invoice ID) is required for Mayar lookup');
    }

    const apiKey = this.env.MAYAR_API_KEY;
    const baseUrl = normalizeBaseUrl(this.env.MAYAR_BASE_URL);

    const res = await fetch(`${baseUrl}/hl/v1/invoice/${invoiceId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    const json = (await res.json()) as Record<string, unknown>;
    
    if (!res.ok) {
      const message = String(json.message ?? json.error ?? 'Mayar lookup failed');
      throw new Error(message);
    }
    
    const data = json.data as Record<string, unknown> | undefined;
    if (!data) {
      throw Errors.internal('Mayar missing data object in lookup');
    }

    const status = String(data.status ?? 'unknown');
    const paid = status.toUpperCase() === 'PAID';
    const paidAmount = typeof data.amount === 'number' ? data.amount : 
                       (typeof data.amount === 'string' ? parseFloat(data.amount) : null);
    
    const providerReference = String(data.id ?? invoiceId);
    const providerTransactionReference = data.transactionId ? String(data.transactionId) : null;

    return {
      status,
      paid,
      paidAmount,
      providerReference,
      providerTransactionReference,
      rawResponse: json,
    };
  }
}

export function createMayarAdapter(env: PayCoreEnv): MayarAdapter {
  return new MayarAdapter(env);
}
