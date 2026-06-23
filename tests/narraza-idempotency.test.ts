import { describe, expect, it } from 'vitest';

const processed = new Set<string>();

function grantCreditOnce(paycoreOrderId: string): 'granted' | 'duplicate' {
  const ref = `paycore:${paycoreOrderId}`;
  if (processed.has(ref)) return 'duplicate';
  processed.add(ref);
  return 'granted';
}

describe('narraza-style fulfillment reference', () => {
  it('processes paycore order id only once', () => {
    expect(grantCreditOnce('NAR-20260623-8H2KQ')).toBe('granted');
    expect(grantCreditOnce('NAR-20260623-8H2KQ')).toBe('duplicate');
  });
});