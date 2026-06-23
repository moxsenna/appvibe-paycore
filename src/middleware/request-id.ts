import { createMiddleware } from 'hono/factory';
import type { PayCoreHonoEnv } from '../types/hono.ts';

export const requestIdMiddleware = createMiddleware<PayCoreHonoEnv>(async (c, next) => {
  const incoming = c.req.header('X-Request-Id')?.trim();
  const requestId =
    incoming && incoming.length <= 128 ? incoming : crypto.randomUUID();
  c.set('requestId', requestId);
  c.header('X-Request-Id', requestId);
  await next();
});