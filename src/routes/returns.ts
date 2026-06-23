import { Hono } from 'hono';
import { Errors } from '../lib/errors.ts';
import type { PayCoreHonoEnv } from '../types/hono.ts';

export const returnRoutes = new Hono<PayCoreHonoEnv>();

function isReturnUrlAllowed(returnUrl: string, allowed: unknown): boolean {
  if (!Array.isArray(allowed)) return false;
  let target: URL;
  try {
    target = new URL(returnUrl);
  } catch {
    return false;
  }
  for (const entry of allowed) {
    if (typeof entry !== 'string') continue;
    try {
      const allowedUrl = new URL(entry);
      if (allowedUrl.origin === target.origin && target.pathname.startsWith(allowedUrl.pathname)) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

returnRoutes.get('/:order_id', async (c) => {
  const orderId = c.req.param('order_id');
  const supabase = c.get('supabase');

  const { data: order, error } = await supabase
    .from('payment_orders')
    .select('order_id, return_url, app_id')
    .eq('order_id', orderId)
    .maybeSingle();

  if (error) {
    throw Errors.internal('Failed to load order');
  }
  if (!order) {
    throw Errors.notFound('Order not found');
  }

  const { data: app, error: appError } = await supabase
    .from('apps')
    .select('allowed_return_urls')
    .eq('id', order.app_id)
    .maybeSingle();

  if (appError) {
    throw Errors.internal('Failed to load app');
  }

  if (!app || !isReturnUrlAllowed(order.return_url, app.allowed_return_urls)) {
    throw Errors.forbidden('Return URL is not allowlisted for this app');
  }

  const redirect = new URL(order.return_url);
  redirect.searchParams.set('order_id', order.order_id);
  return c.redirect(redirect.toString(), 302);
});