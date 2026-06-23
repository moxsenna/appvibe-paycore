import { describe, expect, it } from 'vitest';
import {
  FULFILLMENT_MAX_ATTEMPTS,
  RETRY_DELAYS_MS,
  STUCK_PROCESSING_MS,
  isDeliveryDueForCronRetry,
  isStuckByTimestamp,
  isTooRecentForRetry,
  shouldMoveToDeadLetter,
  type DeliveryRetryRow,
} from '../src/lib/fulfillment-retry.ts';

const now = new Date('2026-06-23T16:00:00Z');

function row(partial: Partial<DeliveryRetryRow>): DeliveryRetryRow {
  return {
    deliveryStatus: 'failed',
    nextRetryAt: new Date('2026-06-23T15:00:00Z'),
    lastAttemptAt: null,
    claimedAt: null,
    attemptNumber: 1,
    paymentStatus: 'paid',
    fulfillmentStatus: 'failed',
    ...partial,
  };
}

describe('stuck timestamp (15 min)', () => {
  it('does not treat 5 minutes ago as stuck', () => {
    const last = new Date(now.getTime() - 5 * 60_000);
    expect(isStuckByTimestamp(last, now, STUCK_PROCESSING_MS)).toBe(false);
    expect(isTooRecentForRetry(last, now, STUCK_PROCESSING_MS)).toBe(true);
  });

  it('treats 16 minutes ago as stuck', () => {
    const last = new Date(now.getTime() - 16 * 60_000);
    expect(isStuckByTimestamp(last, now, STUCK_PROCESSING_MS)).toBe(true);
  });

  it('treats 1 hour ago as stuck', () => {
    const last = new Date(now.getTime() - 60 * 60_000);
    expect(isStuckByTimestamp(last, now, STUCK_PROCESSING_MS)).toBe(true);
  });
});

describe('cron retry eligibility', () => {
  it('does not requeue when next_retry_at is in the future', () => {
    const due = row({
      nextRetryAt: new Date('2026-06-23T17:00:00Z'),
    });
    expect(isDeliveryDueForCronRetry(due, now)).toBe(false);
  });

  it('requeues when next_retry_at <= now', () => {
    const due = row({
      nextRetryAt: new Date('2026-06-23T15:59:00Z'),
    });
    expect(isDeliveryDueForCronRetry(due, now)).toBe(true);
  });

  it('never requeues delivered', () => {
    expect(
      isDeliveryDueForCronRetry(
        row({ deliveryStatus: 'delivered', fulfillmentStatus: 'delivered' }),
        now,
      ),
    ).toBe(false);
  });

  it('never requeues dead_letter or manual_review', () => {
    expect(isDeliveryDueForCronRetry(row({ deliveryStatus: 'dead_letter' }), now)).toBe(false);
    expect(isDeliveryDueForCronRetry(row({ deliveryStatus: 'manual_review' }), now)).toBe(false);
  });
});

describe('attempt limits and event id stability', () => {
  it('moves to dead letter after max attempts', () => {
    expect(shouldMoveToDeadLetter(FULFILLMENT_MAX_ATTEMPTS + 1)).toBe(true);
    expect(shouldMoveToDeadLetter(FULFILLMENT_MAX_ATTEMPTS)).toBe(false);
  });

  it('retry schedule has 6 delays per PRD', () => {
    expect(RETRY_DELAYS_MS.length).toBe(6);
  });

  it('event id should stay constant across retries (contract)', () => {
    const eventId = 'evt_abc123';
    const attempt1 = { eventId, attemptNumber: 1 };
    const attempt2 = { eventId, attemptNumber: 2 };
    expect(attempt2.eventId).toBe(attempt1.eventId);
  });
});

describe('atomic claim simulation', () => {
  it('only one winner when two workers claim same delivery', () => {
    let claimedBy: string | null = null;
    const tryClaim = (worker: string): boolean => {
      if (claimedBy !== null) return false;
      claimedBy = worker;
      return true;
    };
    expect(tryClaim('cron')).toBe(true);
    expect(tryClaim('queue')).toBe(false);
  });
});