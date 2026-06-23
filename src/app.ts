import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { validateEnv } from './config/env.ts';
import { createLogger } from './lib/logger.ts';
import { createSupabaseAdmin } from './lib/supabase.ts';
import {
  appAuthMiddleware,
  captureRawBodyMiddleware,
} from './middleware/app-auth.ts';
import { adminAuthMiddleware } from './middleware/admin-auth.ts';
import { paycoreErrorHandler } from './middleware/error-handler.ts';
import { requestIdMiddleware } from './middleware/request-id.ts';
import { adminRoutes } from './routes/admin.ts';
import { healthRoutes } from './routes/health.ts';
import { orderRoutes } from './routes/orders.ts';
import { returnRoutes } from './routes/returns.ts';
import { webhookRoutes } from './routes/webhooks.ts';
import type { PayCoreHonoEnv } from './types/hono.ts';

const bootstrapMiddleware = createMiddleware<PayCoreHonoEnv>(async (c, next) => {
  const env = validateEnv(c.env);
  const requestId = c.get('requestId');
  c.set('env', env);
  c.set('supabase', createSupabaseAdmin(env));
  c.set('logger', createLogger({ request_id: requestId, service: 'paycore' }));
  await next();
});

export function createApp() {
  const app = new Hono<PayCoreHonoEnv>();

  app.use('*', requestIdMiddleware);
  app.use('*', bootstrapMiddleware);
  app.onError(paycoreErrorHandler);

  app.route('/', healthRoutes);

  const v1 = new Hono<PayCoreHonoEnv>();
  v1.use('*', captureRawBodyMiddleware);
  v1.use('*', appAuthMiddleware);
  v1.route('/', orderRoutes);
  app.route('/v1', v1);

  const webhooks = new Hono<PayCoreHonoEnv>();
  webhooks.use('*', captureRawBodyMiddleware);
  webhooks.route('/', webhookRoutes);
  app.route('/webhooks', webhooks);

  app.route('/return', returnRoutes);

  const admin = new Hono<PayCoreHonoEnv>();
  admin.use('*', captureRawBodyMiddleware);
  admin.use('*', adminAuthMiddleware);
  admin.route('/', adminRoutes);
  app.route('/admin', admin);

  app.notFound((c) =>
    c.json(
      {
        error: { code: 'not_found', message: 'Not found' },
        request_id: c.get('requestId'),
      },
      404,
    ),
  );

  return app;
}