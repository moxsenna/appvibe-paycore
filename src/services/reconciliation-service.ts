import type { PayCoreLogger } from '../lib/logger.ts';
import { nowIso } from '../lib/time.ts';
import type { PayCoreSupabase } from '../lib/supabase.ts';
import type { PayCoreEnv, FulfillmentQueueMessage } from '../types/env.ts';
import { writeAudit } from './audit-service.ts';
import {
  claimFulfillmentDelivery,
  listDeliveriesDueRetry,
} from './fulfillment-delivery-store.ts';



export interface ReconciliationSummary {
  from: string;
  to: string;
  totalOrders: number;
  paidOrders: number;
  pendingOrders: number;
  manualReviewOrders: number;
  fulfillmentQueued: number;
  fulfillmentDelivered: number;
  fulfillmentFailed: number;
}

export interface ReconciliationRunResult {
  summary: ReconciliationSummary;
  expiredOrderCount: number;
  requeuedFulfillmentCount: number;
  paidUndeliveredFound: number;
}

export class ReconciliationService {
  constructor(
    private readonly db: PayCoreSupabase,
    private readonly log?: PayCoreLogger,
  ) {}

  async summarizeRange(fromIso: string, toIso: string): Promise<ReconciliationSummary> {
    const { data, error } = await this.db
      .from('payment_orders')
      .select('payment_status, fulfillment_status')
      .gte('created_at', fromIso)
      .lte('created_at', toIso);

    if (error) {
      throw new Error(`Reconciliation query failed: ${error.message}`);
    }

    const rows = data ?? [];
    let paidOrders = 0;
    let pendingOrders = 0;
    let manualReviewOrders = 0;
    let fulfillmentQueued = 0;
    let fulfillmentDelivered = 0;
    let fulfillmentFailed = 0;

    for (const row of rows) {
      const paymentStatus = String(row.payment_status);
      const fulfillmentStatus = String(row.fulfillment_status);
      if (paymentStatus === 'paid') paidOrders += 1;
      if (paymentStatus === 'pending' || paymentStatus === 'created') pendingOrders += 1;
      if (paymentStatus === 'manual_review') manualReviewOrders += 1;
      if (fulfillmentStatus === 'queued' || fulfillmentStatus === 'processing') {
        fulfillmentQueued += 1;
      }
      if (fulfillmentStatus === 'delivered') fulfillmentDelivered += 1;
      if (fulfillmentStatus === 'failed' || fulfillmentStatus === 'manual_review') {
        fulfillmentFailed += 1;
      }
    }

    return {
      from: fromIso,
      to: toIso,
      totalOrders: rows.length,
      paidOrders,
      pendingOrders,
      manualReviewOrders,
      fulfillmentQueued,
      fulfillmentDelivered,
      fulfillmentFailed,
    };
  }

  /** Mark pending/created orders past expires_at as expired. */
  async expirePendingOrders(now = new Date()): Promise<number> {
    const nowIso = now.toISOString();
    const { data, error } = await this.db
      .from('payment_orders')
      .update({ payment_status: 'expired', updated_at: nowIso })
      .in('payment_status', ['pending', 'created'])
      .not('expires_at', 'is', null)
      .lt('expires_at', nowIso)
      .select('order_id');

    if (error) {
      throw new Error(`expirePendingOrders failed: ${error.message}`);
    }

    const count = data?.length ?? 0;
    if (count > 0) {
      this.log?.info('reconciliation_expired_orders', { count });
      for (const row of data ?? []) {
        await writeAudit(this.db, {
          actorType: 'system',
          action: 'payment_expired',
          entityType: 'payment_order',
          entityId: String(row.order_id),
          metadata: { source: 'reconciliation_cron' },
        });
      }
    }
    return count;
  }

  /** Count paid orders not yet delivered (for monitoring). */
  async countPaidUndelivered(): Promise<number> {
    const { count, error } = await this.db
      .from('payment_orders')
      .select('id', { count: 'exact', head: true })
      .eq('payment_status', 'paid')
      .in('fulfillment_status', ['queued', 'processing', 'failed', 'pending']);

    if (error) {
      throw new Error(`countPaidUndelivered failed: ${error.message}`);
    }
    return count ?? 0;
  }

  /**
   * Re-dispatch from fulfillment_deliveries (next_retry_at, delivery_status) — not payment_orders.updated_at.
   */
  async retryStuckFulfillments(env: PayCoreEnv): Promise<number> {
    const nowStr = nowIso();
    const due = await listDeliveriesDueRetry(this.db, nowStr, 50);
    let requeued = 0;

    for (const row of due) {
      const claim = await claimFulfillmentDelivery(this.db, row.delivery_id, nowStr);
      if (!claim?.claimed) {
        continue;
      }

      const message: FulfillmentQueueMessage = {
        deliveryId: row.delivery_id,
        eventId: row.event_id,
        paymentOrderId: row.payment_order_id,
        appId: row.app_id,
        attemptNumber: row.attempt_number,
      };

      await env.FULFILLMENT_QUEUE.send(message);
      requeued += 1;
    }

    if (requeued > 0) {
      this.log?.info('reconciliation_requeued_fulfillment', { count: requeued });
    }
    return requeued;
  }


  async runDaily(env: PayCoreEnv): Promise<ReconciliationRunResult> {
    const to = new Date();
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);

    const expiredOrderCount = await this.expirePendingOrders(to);
    const paidUndeliveredFound = await this.countPaidUndelivered();
    const requeuedFulfillmentCount = await this.retryStuckFulfillments(env);
    const summary = await this.summarizeRange(from.toISOString(), to.toISOString());

    return {
      summary,
      expiredOrderCount,
      requeuedFulfillmentCount,
      paidUndeliveredFound,
    };
  }
}
