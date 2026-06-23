export const RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  12 * 60 * 60_000,
  24 * 60 * 60_000,
] as const;

export const FULFILLMENT_MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;


export const STUCK_PROCESSING_MS = 15 * 60 * 1000;

export type DeliveryStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'failed'
  | 'delivered'
  | 'dead_letter'
  | 'manual_review';

export interface DeliveryRetryRow {
  deliveryStatus: DeliveryStatus;
  nextRetryAt: Date | null;
  lastAttemptAt: Date | null;
  claimedAt: Date | null;
  attemptNumber: number;
  paymentStatus: string;
  fulfillmentStatus: string;
}

const TERMINAL_DELIVERY: ReadonlySet<DeliveryStatus> = new Set([
  'delivered',
  'dead_letter',
  'manual_review',
]);

/** True when updated_at / last activity is OLDER than threshold (stuck), not "recently updated". */
export function isStuckByTimestamp(lastActivity: Date, now: Date, thresholdMs: number): boolean {
  return now.getTime() - lastActivity.getTime() > thresholdMs;
}

export function isDeliveryDueForCronRetry(row: DeliveryRetryRow, now: Date): boolean {
  if (row.paymentStatus !== 'paid') return false;
  if (row.fulfillmentStatus === 'delivered' || row.fulfillmentStatus === 'manual_review') {
    return false;
  }
  if (TERMINAL_DELIVERY.has(row.deliveryStatus)) return false;

  if (row.deliveryStatus === 'processing') {
    if (!row.claimedAt) return false;
    return isStuckByTimestamp(row.claimedAt, now, STUCK_PROCESSING_MS);
  }

  if (row.deliveryStatus === 'queued' || row.deliveryStatus === 'failed' || row.deliveryStatus === 'pending') {
    if (row.nextRetryAt === null) return true;
    return row.nextRetryAt.getTime() <= now.getTime();
  }

  return false;
}

/** Recently updated within threshold — must NOT be selected for retry. */
export function isTooRecentForRetry(lastActivity: Date, now: Date, thresholdMs: number): boolean {
  return !isStuckByTimestamp(lastActivity, now, thresholdMs);
}

export function retryDelayMsAfterAttempt(failedAttemptNumber: number): number | null {
  const idx = failedAttemptNumber - 1;
  if (idx < 0 || idx >= RETRY_DELAYS_MS.length) return null;
  return RETRY_DELAYS_MS[idx] ?? null;
}

export function shouldMoveToDeadLetter(nextAttemptNumber: number): boolean {
  return nextAttemptNumber > FULFILLMENT_MAX_ATTEMPTS;
}

export function nextRetryDateAfterFailure(failedAttemptNumber: number, from: Date): Date | null {
  const delay = retryDelayMsAfterAttempt(failedAttemptNumber);
  if (delay === null) return null;
  return new Date(from.getTime() + delay);
}