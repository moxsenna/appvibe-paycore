import { Hono } from 'hono';
import { z } from 'zod';
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

  const supabase = c.get('supabase');
  let dbQuery = supabase
    .from('payment_orders')
    .select(
      'order_id, external_order_id, payment_status, fulfillment_status, provider, amount, currency, paid_at, created_at, apps!inner(app_id)',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(query.data.offset, query.data.offset + query.data.limit - 1);

  if (query.data.provider) {
    dbQuery = dbQuery.eq('provider', query.data.provider);
  }
  if (query.data.payment_status) {
    dbQuery = dbQuery.eq('payment_status', query.data.payment_status);
  }
  if (query.data.fulfillment_status) {
    dbQuery = dbQuery.eq('fulfillment_status', query.data.fulfillment_status);
  }
  if (query.data.app_id) {
    dbQuery = dbQuery.eq('apps.app_id', query.data.app_id);
  }

  const { data, error, count } = await dbQuery;
  if (error) {
    throw Errors.internal('Failed to list orders');
  }

  return c.json({
    items: data ?? [],
    total: count ?? 0,
    limit: query.data.limit,
    offset: query.data.offset,
  });
});

adminRoutes.get('/orders/:order_id', async (c) => {
  const orderId = c.req.param('order_id');
  const supabase = c.get('supabase');

  const { data: order, error } = await supabase
    .from('payment_orders')
    .select('*, apps(app_id, display_name)')
    .eq('order_id', orderId)
    .maybeSingle();

  if (error) {
    throw Errors.internal('Failed to load order');
  }
  if (!order) {
    throw Errors.notFound('Order not found');
  }

  const { data: events } = await supabase
    .from('payment_events')
    .select('*')
    .eq('order_id', order.id)
    .order('received_at', { ascending: false });

  const { data: deliveries } = await supabase
    .from('fulfillment_deliveries')
    .select('*')
    .eq('payment_order_id', order.id)
    .order('created_at', { ascending: false });

  return c.json({
    order,
    payment_events: events ?? [],
    fulfillment_deliveries: deliveries ?? [],
  });
});

adminRoutes.post('/orders/:order_id/retry-fulfillment', async (c) => {
  const orderId = c.req.param('order_id');
  const supabase = c.get('supabase');
  const { data: order, error } = await supabase
    .from('payment_orders')
    .select('id, app_id, internal_event_id, payment_status, fulfillment_status')
    .eq('order_id', orderId)
    .maybeSingle();

  if (error) {
    throw Errors.internal('Failed to load order');
  }
  if (!order) {
    throw Errors.notFound('Order not found');
  }
  if (!order.internal_event_id) {
    throw Errors.validation('Order has no internal event to deliver');
  }

  const fulfillment = new FulfillmentService(c.get('env'), c.get('supabase'), c.get('logger'));
  await fulfillment.enqueueForPaidOrder({
    paymentOrderId: String(order.id),
    internalEventId: String(order.internal_event_id),
    appUuid: String(order.app_id),
  });

  await supabase.from('audit_logs').insert({
    actor_type: 'admin',
    actor_id: c.get('adminActor') ?? 'admin',
    action: 'fulfillment.retry_manual',
    entity_type: 'payment_order',
    entity_id: orderId,
    metadata: {},
  });

  return c.json({ order_id: orderId, status: 'queued' });
});

adminRoutes.post('/orders/:order_id/manual-review', async (c) => {
  const orderId = c.req.param('order_id');
  let body: unknown = {};
  const raw = c.get('rawBody');
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      throw Errors.validation('Invalid JSON body');
    }
  }

  const parsed = manualReviewBodySchema.safeParse(body);
  if (!parsed.success) {
    throw Errors.validation('Invalid body', { issues: parsed.error.flatten() });
  }

  const supabase = c.get('supabase');
  const { data: order, error: loadError } = await supabase
    .from('payment_orders')
    .select('id')
    .eq('order_id', orderId)
    .maybeSingle();

  if (loadError) {
    throw Errors.internal('Failed to load order');
  }
  if (!order) {
    throw Errors.notFound('Order not found');
  }

  const { error: updateError } = await supabase
    .from('payment_orders')
    .update({
      payment_status: 'manual_review',
      fulfillment_status: 'manual_review',
      updated_at: new Date().toISOString(),
    })
    .eq('id', order.id);

  if (updateError) {
    throw Errors.internal('Failed to update order');
  }

  await supabase.from('audit_logs').insert({
    actor_type: 'admin',
    actor_id: c.get('adminActor') ?? 'admin',
    action: 'order.manual_review',
    entity_type: 'payment_order',
    entity_id: orderId,
    metadata: parsed.data.note ? { note: parsed.data.note } : {},
  });

  return c.json({ order_id: orderId, payment_status: 'manual_review', fulfillment_status: 'manual_review' });
});