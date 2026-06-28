import { newId, parseJson, stringifyJson, type PayCoreDb } from '../client.ts';
import { msToIso, nowMs } from '../../lib/time.ts';

export interface InsertOrderInput {
  order_id: string;
  app_id: string;
  merchant_profile_id: string;
  external_order_id: string;
  product_key: string | null;
  description: string;
  amount: number;
  currency: string;
  provider: string;
  return_url: string;
  customer_name_encrypted: string;
  customer_email_encrypted: string;
  customer_phone_encrypted: string | null;
  fulfillment_data: Record<string, unknown>;
  expires_at_ms: number;
}

export async function insertPaymentOrder(db: PayCoreDb, input: InsertOrderInput): Promise<string> {
  const id = newId();
  const now = nowMs();
  await db
    .prepare(
      `INSERT INTO payment_orders (
        id, order_id, app_id, merchant_profile_id, external_order_id, product_key, description,
        amount, currency, payment_status, fulfillment_status, provider, return_url,
        customer_name_encrypted, customer_email_encrypted, customer_phone_encrypted,
        fulfillment_data, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'created', 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.order_id,
      input.app_id,
      input.merchant_profile_id,
      input.external_order_id,
      input.product_key,
      input.description,
      input.amount,
      input.currency,
      input.provider,
      input.return_url,
      input.customer_name_encrypted,
      input.customer_email_encrypted,
      input.customer_phone_encrypted,
      stringifyJson(input.fulfillment_data),
      input.expires_at_ms,
      now,
      now,
    )
    .run();
  return id;
}

export async function updateOrderCheckout(
  db: PayCoreDb,
  orderUuid: string,
  patch: {
    payment_status: string;
    checkout_url?: string | null;
    provider_reference?: string | null;
    provider_transaction_reference?: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE payment_orders SET payment_status = ?, checkout_url = ?, provider_reference = ?, provider_transaction_reference = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      patch.payment_status,
      patch.checkout_url ?? null,
      patch.provider_reference ?? null,
      patch.provider_transaction_reference ?? null,
      nowMs(),
      orderUuid,
    )
    .run();
}

export async function getOrderForApp(
  db: PayCoreDb,
  orderId: string,
  appUuid: string,
): Promise<Record<string, unknown> | null> {
  const row = await db
    .prepare(
      `SELECT order_id, external_order_id, payment_status, fulfillment_status, provider, amount, currency,
              checkout_url, expires_at, paid_at
       FROM payment_orders WHERE order_id = ? AND app_id = ?`,
    )
    .bind(orderId, appUuid)
    .first<Record<string, unknown>>();
  if (!row) return null;
  return {
    order_id: row.order_id,
    external_order_id: row.external_order_id,
    payment_status: row.payment_status,
    fulfillment_status: row.fulfillment_status,
    provider: row.provider,
    amount: Number(row.amount),
    currency: row.currency,
    checkout_url: row.checkout_url,
    expires_at: msToIso(row.expires_at as number | null),
    paid_at: msToIso(row.paid_at as number | null),
  };
}

export interface OrderLookupRow {
  id: string;
  order_id: string;
  app_id: string;
  merchant_profile_id: string;
  payment_status: string;
  amount: number;
  currency: string;
}

export async function findOrderByPublicId(db: PayCoreDb, orderId: string): Promise<OrderLookupRow | null> {
  const row = await db
    .prepare(
      `SELECT id, order_id, app_id, merchant_profile_id, payment_status, amount, currency
       FROM payment_orders WHERE order_id = ?`,
    )
    .bind(orderId)
    .first<Record<string, unknown>>();
  if (!row) return null;
  return {
    id: String(row.id),
    order_id: String(row.order_id),
    app_id: String(row.app_id),
    merchant_profile_id: String(row.merchant_profile_id),
    payment_status: String(row.payment_status),
    amount: Number(row.amount),
    currency: String(row.currency),
  };
}

export async function getOrderForFulfillment(
  db: PayCoreDb,
  orderUuid: string,
): Promise<{
  id: string;
  order_id: string;
  external_order_id: string;
  app_id: string;
  amount: number;
  currency: string;
  provider: string;
  provider_reference: string | null;
  product_key: string | null;
  fulfillment_data: Record<string, unknown>;
  internal_event_id: string | null;
  paid_at: number | null;
  app_id_slug: string;
  webhook_url: string;
  webhook_secret_ref: string;
} | null> {
  const row = await db
    .prepare(
      `SELECT po.id, po.order_id, po.external_order_id, po.app_id, po.amount, po.currency, po.provider,
              po.provider_reference, po.product_key, po.fulfillment_data, po.internal_event_id, po.paid_at,
              a.app_id AS app_id_slug, a.webhook_url, a.webhook_secret_ref
       FROM payment_orders po
       INNER JOIN apps a ON a.id = po.app_id
       WHERE po.id = ?`,
    )
    .bind(orderUuid)
    .first<Record<string, unknown>>();
  if (!row) return null;
  return {
    id: String(row.id),
    order_id: String(row.order_id),
    external_order_id: String(row.external_order_id),
    app_id: String(row.app_id),
    amount: Number(row.amount),
    currency: String(row.currency),
    provider: String(row.provider),
    provider_reference: row.provider_reference === null ? null : String(row.provider_reference),
    product_key: row.product_key === null ? null : String(row.product_key),
    fulfillment_data: parseJson(row.fulfillment_data as string, {}),
    internal_event_id: row.internal_event_id === null ? null : String(row.internal_event_id),
    paid_at: row.paid_at === null ? null : Number(row.paid_at),
    app_id_slug: String(row.app_id_slug),
    webhook_url: String(row.webhook_url),
    webhook_secret_ref: String(row.webhook_secret_ref),
  };
}

export async function getOrderReturnContext(
  db: PayCoreDb,
  orderId: string,
): Promise<{ order_id: string; return_url: string; app_id: string } | null> {
  const row = await db
    .prepare(`SELECT order_id, return_url, app_id FROM payment_orders WHERE order_id = ?`)
    .bind(orderId)
    .first<{ order_id: string; return_url: string; app_id: string }>();
  return row ?? null;
}

export async function getOrderAdminDetail(db: PayCoreDb, orderId: string): Promise<Record<string, unknown> | null> {
  const row = await db
    .prepare(`SELECT * FROM payment_orders WHERE order_id = ?`)
    .bind(orderId)
    .first<Record<string, unknown>>();
  if (!row) return null;
  const app = await db
    .prepare(`SELECT app_id, display_name FROM apps WHERE id = ?`)
    .bind(row.app_id)
    .first<{ app_id: string; display_name: string }>();
  return {
    ...row,
    expires_at: msToIso(row.expires_at as number | null),
    paid_at: msToIso(row.paid_at as number | null),
    created_at: msToIso(row.created_at as number),
    updated_at: msToIso(row.updated_at as number),
    fulfillment_data: parseJson(row.fulfillment_data as string, {}),
    apps: app,
  };
}

export async function getOrderUuidByPublicId(db: PayCoreDb, orderId: string): Promise<{
  id: string;
  app_id: string;
  internal_event_id: string | null;
  payment_status: string;
  fulfillment_status: string;
} | null> {
  const row = await db
    .prepare(
      `SELECT id, app_id, internal_event_id, payment_status, fulfillment_status FROM payment_orders WHERE order_id = ?`,
    )
    .bind(orderId)
    .first<Record<string, unknown>>();
  if (!row) return null;
  return {
    id: String(row.id),
    app_id: String(row.app_id),
    internal_event_id: row.internal_event_id === null ? null : String(row.internal_event_id),
    payment_status: String(row.payment_status),
    fulfillment_status: String(row.fulfillment_status),
  };
}

export async function listOrdersAdmin(
  db: PayCoreDb,
  filters: { appSlug?: string; status?: string; limit: number },
): Promise<Record<string, unknown>[]> {
  let sql = `SELECT po.order_id, po.external_order_id, po.payment_status, po.fulfillment_status,
                    po.provider, po.amount, po.currency, po.paid_at, po.created_at, a.app_id
             FROM payment_orders po
             INNER JOIN apps a ON a.id = po.app_id WHERE 1=1`;
  const binds: (string | number)[] = [];
  if (filters.appSlug) {
    sql += ` AND a.app_id = ?`;
    binds.push(filters.appSlug);
  }
  if (filters.status) {
    sql += ` AND po.payment_status = ?`;
    binds.push(filters.status);
  }
  sql += ` ORDER BY po.created_at DESC LIMIT ?`;
  binds.push(filters.limit);

  const { results } = await db.prepare(sql).bind(...binds).all<Record<string, unknown>>();
  return (results ?? []).map((r) => ({
    ...r,
    paid_at: msToIso(r.paid_at as number | null),
    created_at: msToIso(r.created_at as number),
  }));
}

export async function updateOrderStatuses(
  db: PayCoreDb,
  orderUuid: string,
  patch: { payment_status?: string; fulfillment_status?: string },
): Promise<void> {
  const sets: string[] = ['updated_at = ?'];
  const binds: (string | number)[] = [nowMs()];
  if (patch.payment_status) {
    sets.push('payment_status = ?');
    binds.push(patch.payment_status);
  }
  if (patch.fulfillment_status) {
    sets.push('fulfillment_status = ?');
    binds.push(patch.fulfillment_status);
  }
  binds.push(orderUuid);
  await db.prepare(`UPDATE payment_orders SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
}

export async function expirePendingOrders(db: PayCoreDb, nowMsVal: number): Promise<number> {
  const res = await db
    .prepare(
      `UPDATE payment_orders SET payment_status = 'expired', updated_at = ?
       WHERE payment_status IN ('pending', 'created') AND expires_at IS NOT NULL AND expires_at < ?`,
    )
    .bind(nowMsVal, nowMsVal)
    .run();
  return res.meta.changes ?? 0;
}

export async function countPaidUndelivered(db: PayCoreDb): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM payment_orders
       WHERE payment_status = 'paid' AND fulfillment_status NOT IN ('delivered', 'manual_review')`,
    )
    .first<{ c: number }>();
  return Number(row?.c ?? 0);
}

export async function summarizeOrdersInRange(
  db: PayCoreDb,
  fromMs: number,
  toMs: number,
): Promise<{
  totalOrders: number;
  paidOrders: number;
  pendingOrders: number;
  manualReviewOrders: number;
  fulfillmentQueued: number;
  fulfillmentDelivered: number;
  fulfillmentFailed: number;
}> {
  const row = await db
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) AS paid,
        SUM(CASE WHEN payment_status IN ('pending','created') THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN payment_status = 'manual_review' OR fulfillment_status = 'manual_review' THEN 1 ELSE 0 END) AS manual_review,
        SUM(CASE WHEN fulfillment_status = 'queued' THEN 1 ELSE 0 END) AS fq,
        SUM(CASE WHEN fulfillment_status = 'delivered' THEN 1 ELSE 0 END) AS fd,
        SUM(CASE WHEN fulfillment_status = 'failed' THEN 1 ELSE 0 END) AS ff
       FROM payment_orders WHERE created_at >= ? AND created_at < ?`,
    )
    .bind(fromMs, toMs)
    .first<Record<string, number>>();
  return {
    totalOrders: Number(row?.total ?? 0),
    paidOrders: Number(row?.paid ?? 0),
    pendingOrders: Number(row?.pending ?? 0),
    manualReviewOrders: Number(row?.manual_review ?? 0),
    fulfillmentQueued: Number(row?.fq ?? 0),
    fulfillmentDelivered: Number(row?.fd ?? 0),
    fulfillmentFailed: Number(row?.ff ?? 0),
  };
}

export async function findOrderForMayarWebhook(
  db: PayCoreDb,
  reference: string
): Promise<{ id: string, order_id: string, provider_reference: string | null } | null> {
  const row = await db
    .prepare(`SELECT id, order_id, provider_reference FROM payment_orders WHERE provider = 'mayar' AND (provider_reference = ? OR provider_transaction_reference = ?) LIMIT 1`)
    .bind(reference, reference)
    .first<{ id: string, order_id: string, provider_reference: string | null }>();
  return row ?? null;
}

export async function getPendingOrdersByProvider(
  db: PayCoreDb,
  provider: string,
  olderThanMs: number,
  nowMsVal: number,
  limit: number
): Promise<{ id: string; order_id: string; provider_reference: string | null; merchant_profile_id: string; app_id: string; }[]> {
  const { results } = await db
    .prepare(
      `SELECT id, order_id, provider_reference, merchant_profile_id, app_id 
       FROM payment_orders 
       WHERE provider = ? 
       AND provider_reference IS NOT NULL
       AND payment_status IN ('created', 'pending') 
       AND created_at < ? 
       AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at ASC 
       LIMIT ?`
    )
    .bind(provider, olderThanMs, nowMsVal, limit)
    .all<{ id: string; order_id: string; provider_reference: string | null; merchant_profile_id: string; app_id: string; }>();
  return (results ?? []).map(r => ({
    id: String(r.id),
    order_id: String(r.order_id),
    provider_reference: r.provider_reference === null ? null : String(r.provider_reference),
    merchant_profile_id: String(r.merchant_profile_id),
    app_id: String(r.app_id),
  }));
}