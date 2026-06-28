import { Hono } from 'hono';
import { WebhookService } from '../services/webhook-service.ts';
import type { PayCoreHonoEnv } from '../types/hono.ts';

export const webhookRoutes = new Hono<PayCoreHonoEnv>();

webhookRoutes.post('/duitku', async (c) => {
  const rawBody = c.get('rawBody') ?? '';
  const service = new WebhookService(c.get('env'), c.get('db'), c.get('logger'));
  const result = await service.handleDuitkuCallback(rawBody);

  return c.json(
    {
      outcome: result.outcome,
      order_id: result.orderId,
      internal_event_id: result.internalEventId,
    },
    result.httpStatus as 200 | 401 | 404 | 422,
  );
});

webhookRoutes.post('/mayar', async (c) => {
  const rawBody = c.get('rawBody') ?? '';
  const service = new WebhookService(c.get('env'), c.get('db'), c.get('logger'));
  const result = await service.handleMayarWebhook(rawBody);

  return c.json(
    {
      outcome: result.outcome,
      order_id: result.orderId,
      internal_event_id: result.internalEventId,
    },
    result.httpStatus as 200 | 400 | 401 | 404 | 409 | 422 | 503,
  );
});