import type { PayCoreDb } from '../db/index.ts';
import { sha256Hex } from '../lib/crypto.ts';
import { summarizeOrdersInRange, expirePendingOrders, countPaidUndelivered, getPendingOrdersByProvider } from '../db/repositories/orders-repository.ts';
import { insertAuditLog } from '../db/repositories/audit-repository.ts';
import { recordVerifiedPayment } from '../db/repositories/webhook-repository.ts';
import { createMayarAdapter } from '../providers/mayar.ts';
import { FulfillmentService } from './fulfillment-service.ts';
import { AuditService } from './audit-service.ts';
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

  async reconcileMayarOrders(env: PayCoreEnv): Promise<number> {
    const now = nowMs();
    // find orders older than 5 minutes, limit to 50 for safety
    const pendingOrders = await getPendingOrdersByProvider(this.db, 'mayar', now - 5 * 60_000, 50);
    
    if (pendingOrders.length === 0) return 0;
    
    const adapter = createMayarAdapter(env);
    const fulfillment = new FulfillmentService(env, this.db, this.log as PayCoreLogger);
    const audit = new AuditService(this.db, this.log as PayCoreLogger);
    let reconciledCount = 0;

    for (const order of pendingOrders) {
      if (!order.provider_reference) continue;
      
      try {
        const status = await adapter.lookupPaymentStatus({ providerReference: order.provider_reference, merchantOrderId: order.order_id });
        if (status.paid) {
          const eventId = `pevt_${crypto.randomUUID().replace(/-/g, '')}`;
          const safePayload = {
            event: 'payment.received',
            data: {
              id: status.providerReference,
              status: 'paid',
              amount: status.paidAmount,
              transactionId: status.providerTransactionReference,
            },
          };
          const payloadHash = await sha256Hex(`reconciliation:${order.id}:${status.providerReference}`);
          
          const recorded = await recordVerifiedPayment(this.db, {
            source: 'reconciliation',
            verificationMethod: 's2s_invoice_lookup',
            verificationValid: true,
            eventId,
            provider: 'mayar',
            merchantProfileId: order.merchant_profile_id,
            orderUuid: order.id,
            providerEventId: status.providerReference ?? 'unknown',
            payloadHash,
            rawPayload: safePayload,
            providerReference: status.providerReference,
            paidAmount: status.paidAmount ?? 0,
          });

          const outcome = recorded.outcome;
          if (outcome === 'paid' && recorded.internalEventId) {
             await audit.record({
               actorType: 'system',
               actorId: 'reconciliation',
               action: 'webhook.paid',
               entityType: 'payment_order',
               entityId: order.order_id,
               metadata: { verification_method: 's2s_invoice_lookup' },
             });
             await fulfillment.enqueueForPaidOrder({
               paymentOrderId: order.id,
               internalEventId: recorded.internalEventId,
               appUuid: order.app_id,
             });
             reconciledCount++;
          }
        }
      } catch (err) {
        this.log?.error('mayar_reconciliation_lookup_failed', {
          order_id: order.order_id,
          message: err instanceof Error ? err.message : 'unknown'
        });
      }
    }
    return reconciledCount;
  }
}