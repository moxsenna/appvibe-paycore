import { describe, expect, it } from 'vitest';

/** Mirrors D1 meta.changes === 1 claim semantics */
function tryClaimRow(state: { status: string; claimed: boolean }): boolean {
  if (['delivered', 'dead_letter', 'manual_review'].includes(state.status)) {
    return false;
  }
  if (state.claimed) {
    return false;
  }
  state.claimed = true;
  state.status = 'processing';
  return true;
}

describe('D1-style delivery claim', () => {
  it('only one worker wins on same delivery', () => {
    const row = { status: 'queued', claimed: false };
    expect(tryClaimRow(row)).toBe(true);
    expect(tryClaimRow(row)).toBe(false);
  });

  it('delivered cannot be claimed', () => {
    const row = { status: 'delivered', claimed: false };
    expect(tryClaimRow(row)).toBe(false);
  });

  it('dead_letter cannot be requeued', () => {
    const row = { status: 'dead_letter', claimed: false };
    expect(tryClaimRow(row)).toBe(false);
  });
});