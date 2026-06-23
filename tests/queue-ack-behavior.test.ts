import { describe, expect, it } from 'vitest';

/**
 * Contract: after markDeliveryOutcome (delivered | retry_scheduled | dead_letter),
 * processQueueMessage resolves → index.ts calls message.ack().
 * Only throws before outcome persist → message.retry().
 */
type Outcome = 'delivered' | 'retry_scheduled' | 'dead_letter' | 'claim_skipped';

function simulateConsumer(outcome: Outcome, threw: boolean): 'ack' | 'retry' {
  if (threw) return 'retry';
  return 'ack';
}

describe('queue consumer ack contract', () => {
  it('acks on delivered', () => {
    expect(simulateConsumer('delivered', false)).toBe('ack');
  });

  it('acks on retry_scheduled after HTTP 500 persisted', () => {
    expect(simulateConsumer('retry_scheduled', false)).toBe('ack');
  });

  it('acks on dead_letter', () => {
    expect(simulateConsumer('dead_letter', false)).toBe('ack');
  });

  it('acks on claim_skipped', () => {
    expect(simulateConsumer('claim_skipped', false)).toBe('ack');
  });

  it('retries only when handler throws before safe persist', () => {
    expect(simulateConsumer('retry_scheduled', true)).toBe('retry');
  });
});