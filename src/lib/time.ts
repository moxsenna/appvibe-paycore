const MAX_SKEW_MS = 5 * 60 * 1000;

export function nowIso(): string {
  return new Date().toISOString();
}

export function assertTimestampFresh(timestamp: string): void {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    throw new Error('Invalid timestamp');
  }
  const skew = Math.abs(Date.now() - parsed);
  if (skew > MAX_SKEW_MS) {
    throw new Error('Timestamp expired');
  }
}