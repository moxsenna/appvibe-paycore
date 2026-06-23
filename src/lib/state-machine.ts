export type PaymentStatus =
  | 'created'
  | 'pending'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'refunded'
  | 'manual_review'
  | 'create_failed';

export type FulfillmentStatus =
  | 'not_required'
  | 'pending'
  | 'queued'
  | 'processing'
  | 'delivered'
  | 'failed'
  | 'manual_review';

const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  created: ['pending', 'create_failed', 'cancelled'],
  pending: ['paid', 'failed', 'expired', 'cancelled', 'manual_review'],
  paid: ['refunded', 'manual_review'],
  failed: ['manual_review'],
  expired: ['manual_review', 'paid'],
  cancelled: ['manual_review'],
  refunded: [],
  manual_review: ['paid', 'refunded', 'failed', 'expired'],
  create_failed: ['pending', 'cancelled'],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  if (from === to) return true;
  const allowed = PAYMENT_TRANSITIONS[from];
  return allowed?.includes(to) ?? false;
}

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransitionPayment(from, to)) {
    throw new Error(`Invalid payment transition ${from} -> ${to}`);
  }
}