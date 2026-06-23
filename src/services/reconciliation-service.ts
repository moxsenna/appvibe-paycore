import type { PayCoreDb } from '../db/index.ts';
import { summarizeOrdersInRange, expirePendingOrders, countPaidUndelivered } from '../db/repositories/orders-repository.ts';
import { insertAuditLog } from '../db/repositories/audit-repository.ts';
import type { PayCoreLogger } from '../lib/logger.ts';
import { nowMs } from '../lib/time.ts';
import type { PayCoreEnv } from '../types/env.ts';
import type { FulfillmentQueueMessage } from '../types/queue.ts';
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
    private readonly db: PayCoreDb,
    private readonly log?: PayCoreLogger,
  ) {}

  async summarizeRange(fromIso: string, toIso: string): Promise<ReconciliationSummary> {
    const fromMs = Date.parse(fromIso);
    const toMs = Date.parse(toIso);
    const counts = await summarizeOrdersInRange(this.db, fromMs, toMs);
    return {
      from: fromIso,
      to: toIso,
      ...counts,
    };
  }

  async expirePendingOrders(now = new Date()): Promise<number> {
    return expirePendingOrders(this.db, now.getTime());
  }

  async countPaidUndelivered(): Promise<number> {
    return countPaidUndelivered(this.db);
  }

  async retryStuckFulfillments(env: PayCoreEnv): Promise<number> {
    const now = nowMs();
    const due = await listDeliveriesDueRetry(this.db, now, 50);
    let requeued = 0;

    for (const row of due) {
      const claim = await claimFulfillmentDelivery(this.db, row.delivery_id, now);
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
    const from = new Date(to.getTime() - 24 * 60 * 60_000);
    const fromIso = from.toISOString();
    const toIso = to.toISOString();

    const summary = await this.summarizeRange(fromIso, toIso);
    const expiredOrderCount = await this.expirePendingOrders(to);
    const paidUndeliveredFound = await this.countPaidUndelivered();
    const requeuedFulfillmentCount = await this.retryStuckFulfillments(env);

    await insertAuditLog(this.db, {
      actorType: 'system',
      actorId: 'cron',
      action: 'reconciliation.daily',
      entityType: 'system',
      entityId: 'paycore',
      metadata: {
        from: fromIso,
        to: toIso,
        expiredOrderCount,
        paidUndeliveredFound,
        requeuedFulfillmentCount,
        summary,
      },
    });

    return {
      summary,
      expiredOrderCount,
      requeuedFulfillmentCount,
      paidUndeliveredFound,
    };
  }
}