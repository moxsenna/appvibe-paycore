import { Hono } from 'hono';
import { z } from 'zod';
import { insertAuditLog } from '../db/repositories/audit-repository.ts';
import { listDeliveriesForOrder } from '../db/repositories/deliveries-repository.ts';
import { listPaymentEventsForOrder } from '../db/repositories/events-repository.ts';
import {
  getOrderAdminDetail,
  getOrderUuidByPublicId,
  listOrdersAdmin,
  updateOrderStatuses,
} from '../db/repositories/orders-repository.ts';
import { Errors } from '../lib/errors.ts';
import { FulfillmentService } from '../services/fulfillment-service.ts';
import type { PayCoreHonoEnv } from '../types/hono.ts';

const listOrdersQuerySchema = z.object({
  app_id: z.string().optional(),
  provider: z.string().optional(),
  payment_status: z.string().optional(),
  fulfillment_status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const manualReviewBodySchema = z.object({
  note: z.string().min(1).max(2000).optional(),
});

export const adminRoutes = new Hono<PayCoreHonoEnv>();

adminRoutes.get('/orders', async (c) => {
  const query = listOrdersQuerySchema.safeParse({
    app_id: c.req.query('app_id'),
    provider: c.req.query('provider'),
    payment_status: c.req.query('payment_status'),
    fulfillment_status: c.req.query('fulfillment_status'),
    limit: c.req.query('limit'),
    offset: c.req.query('offset'),
  });
  if (!query.success) {
    throw Errors.validation('Invalid query parameters', { issues: query.error.flatten() });
  }

  const db = c.get('db');
  const rows = await listOrdersAdmin(db, {
    appSlug: query.data.app_id,
    status: query.data.payment_status,
    limit: query.data.limit + query.data.offset,
  });
  const sliced = rows.slice(query.data.offset, query.data.offset + query.data.limit);

  return c.json({
    orders: sliced,
    limit: query.data.limit,
    offset: query.data.offset,
    count: sliced.length,
  });
});

adminRoutes.get('/orders/:order_id', async (c) => {
  const orderId = c.req.param('order_id');
  const db = c.get('db');

  const order = await getOrderAdminDetail(db, orderId);
  if (!order) {
    throw Errors.notFound('Order not found');
  }

  const orderUuid = String(order.id);
  const events = await listPaymentEventsForOrder(db, orderUuid);
  const deliveries = await listDeliveriesForOrder(db, orderUuid);

  return c.json({ order, events, deliveries });
});

adminRoutes.post('/orders/:order_id/retry-fulfillment', async (c) => {
  const orderId = c.req.param('order_id');
  const fulfillment = new FulfillmentService(c.get('env'), c.get('db'), c.get('logger'));
  const result = await fulfillment.retryFulfillmentForOrder(orderId, c.get('adminActor') ?? 'admin');

  await insertAuditLog(c.get('db'), {
    actorType: 'admin',
    actorId: c.get('adminActor') ?? 'admin',
    action: 'fulfillment.retry_manual',
    entityType: 'payment_order',
    entityId: orderId,
    metadata: {},
  });

  return c.json(result.body, result.status as 202);
});

adminRoutes.post('/orders/:order_id/manual-review', async (c) => {
  const orderId = c.req.param('order_id');
  const body = manualReviewBodySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    throw Errors.validation('Invalid body', { issues: body.error.flatten() });
  }

  const db = c.get('db');
  const order = await getOrderUuidByPublicId(db, orderId);
  if (!order) {
    throw Errors.notFound('Order not found');
  }

  await updateOrderStatuses(db, order.id, {
    payment_status: 'manual_review',
    fulfillment_status: 'manual_review',
  });

  await insertAuditLog(db, {
    actorType: 'admin',
    actorId: c.get('adminActor') ?? 'admin',
    action: 'order.manual_review',
    entityType: 'payment_order',
    entityId: orderId,
    metadata: { note: body.data.note ?? null },
  });

  return c.json({ order_id: orderId, payment_status: 'manual_review' });
});