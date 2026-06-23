import { Errors } from './errors.ts';

/** Unix milliseconds UTC — canonical storage in D1 */
export function nowMs(): number {
  return Date.now();
}

/** ISO 8601 UTC — API responses and queue messages */
export function nowIso(): string {
  return new Date().toISOString();
}

export function msToIso(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined) return null;
  return new Date(ms).toISOString();
}

export function isoToMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

const MAX_SKEW_MS = 5 * 60_000;

export function assertTimestampFresh(isoTimestamp: string): void {
  const t = Date.parse(isoTimestamp);
  if (Number.isNaN(t)) {
    throw Errors.unauthorized('Invalid timestamp');
  }
  const skew = Math.abs(Date.now() - t);
  if (skew > MAX_SKEW_MS) {
    throw Errors.unauthorized('Timestamp outside allowed skew');
  }
}

export function msFromDate(d: Date): number {
  return d.getTime();
}