import { Errors, PayCoreError } from './errors.ts';

export type IdempotencyReserveOutcome =
  | 'reserved_new'
  | 'replay'
  | 'in_progress'
  | 'request_mismatch';

export interface IdempotencyReserveResult {
  outcome: IdempotencyReserveOutcome;
  paymentOrderId: string | null;
  responseBody: Record<string, unknown> | null;
}

export function assertIdempotencyOutcome(result: IdempotencyReserveResult): void {
  if (result.outcome === 'request_mismatch') {
    throw Errors.idempotencyMismatch();
  }
  if (result.outcome === 'in_progress') {
    throw new PayCoreError(
      'Idempotency key already in use by another request',
      'idempotency_in_progress',
      409,
    );
  }
}