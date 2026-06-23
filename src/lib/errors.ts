export class PayCoreError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'PayCoreError';
  }
}

export function isPayCoreError(err: unknown): err is PayCoreError {
  return err instanceof PayCoreError;
}

export const Errors = {
  unauthorized: (msg = 'Unauthorized') => new PayCoreError(msg, 'unauthorized', 401),
  forbidden: (msg = 'Forbidden') => new PayCoreError(msg, 'forbidden', 403),
  notFound: (msg = 'Not found') => new PayCoreError(msg, 'not_found', 404),
  conflict: (msg = 'Conflict') => new PayCoreError(msg, 'conflict', 409),
  validation: (msg: string, details?: Record<string, unknown>) =>
    new PayCoreError(msg, 'validation_error', 400, details),
  idempotencyMismatch: () =>
    new PayCoreError('Idempotency key reused with different payload', 'idempotency_mismatch', 409),
  internal: (msg = 'Internal error') => new PayCoreError(msg, 'internal_error', 500),
};