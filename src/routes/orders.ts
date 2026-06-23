import { Hono } from 'hono';
import { Errors } from '../lib/errors.ts';
import { createOrderRequestSchema } from '../schemas/order.ts';
import { OrderService } from '../services/order-service.ts';
import type { PayCoreHonoEnv } from '../types/hono.ts';

export const orderRoutes = new Hono<PayCoreHonoEnv>();

orderRoutes.post('/orders', async (c) => {
  const appAuth = c.get('appAuth');
  if (!appAuth) {
    throw Errors.unauthorized();
  }

  const idempotencyKey = c.req.header('Idempotency-Key')?.trim();
  if (!idempotencyKey || idempotencyKey.length > 128) {
    throw Errors.validation('Idempotency-Key header is required');
  }

  const requestBodyRaw = c.get('rawBody') ?? '';
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(requestBodyRaw || '{}');
  } catch {
    throw Errors.validation('Invalid JSON body');
  }

  const parsed = createOrderRequestSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw Errors.validation('Invalid order payload', { issues: parsed.error.flatten() });
  }

  const service = new OrderService(c.get('env'), c.get('supabase'), c.get('logger'));
  const result = await service.createOrder({
    appUuid: appAuth.appUuid,
    idempotencyKey,
    requestBodyRaw,
    body: parsed.data,
  });

  return c.json(result.body, result.status as 200 | 201 | 409 | 502);
});

orderRoutes.get('/orders/:order_id', async (c) => {
  const appAuth = c.get('appAuth');
  if (!appAuth) {
    throw Errors.unauthorized();
  }

  const orderId = c.req.param('order_id');
  const service = new OrderService(c.get('env'), c.get('supabase'), c.get('logger'));
  const order = await service.getOrderForApp(orderId, appAuth.appUuid);
  return c.json(order);
});