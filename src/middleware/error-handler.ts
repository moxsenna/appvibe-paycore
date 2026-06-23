import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Context } from 'hono';
import { ZodError } from 'zod';
import { isPayCoreError } from '../lib/errors.ts';
import type { PayCoreHonoEnv } from '../types/hono.ts';

function errorPayload(
  code: string,
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
) {
  return {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
    request_id: requestId,
  };
}

export function paycoreErrorHandler(err: Error, c: Context<PayCoreHonoEnv>): Response {
  const requestId = c.get('requestId') ?? 'unknown';

  if (isPayCoreError(err)) {
    return c.json(
      errorPayload(err.code, err.message, requestId, err.details),
      err.status as ContentfulStatusCode,
    );
  }

  if (err instanceof ZodError) {
    return c.json(
      errorPayload('validation_error', 'Invalid request body', requestId, {
        issues: err.flatten(),
      }),
      400,
    );
  }

  if (err.message === 'Timestamp expired' || err.message === 'Invalid timestamp') {
    return c.json(errorPayload('unauthorized', err.message, requestId), 401);
  }

  console.error(JSON.stringify({ level: 'error', request_id: requestId, message: err.message }));

  return c.json(errorPayload('internal_error', 'Internal error', requestId), 500);
}