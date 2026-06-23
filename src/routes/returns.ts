import { Hono } from 'hono';
import { getAllowedReturnUrls } from '../db/repositories/apps-repository.ts';
import { getOrderReturnContext } from '../db/repositories/orders-repository.ts';
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
  const db = c.get('db');

  const order = await getOrderReturnContext(db, orderId);
  if (!order) {
    throw Errors.notFound('Order not found');
  }

  const allowed = await getAllowedReturnUrls(db, order.app_id);
  if (!isReturnUrlAllowed(order.return_url, allowed)) {
    throw Errors.forbidden('Return URL is not allowlisted for this app');
  }

  const redirect = new URL(order.return_url);
  redirect.searchParams.set('order_id', order.order_id);
  return c.redirect(redirect.toString(), 302);
});