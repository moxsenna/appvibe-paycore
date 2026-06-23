import { Hono } from 'hono';
import type { PayCoreHonoEnv } from '../types/hono.ts';

export const healthRoutes = new Hono<PayCoreHonoEnv>();

healthRoutes.get('/health', (c) =>
  c.json({
    status: 'ok',
    service: 'appvibe-paycore',
    environment: c.get('env').ENVIRONMENT,
    request_id: c.get('requestId'),
  }),
);