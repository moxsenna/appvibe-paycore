import { createApp } from './app.ts';
import { validateEnv } from './config/env.ts';
import { createLogger } from './lib/logger.ts';
import { FulfillmentService } from './services/fulfillment-service.ts';
import { ReconciliationService } from './services/reconciliation-service.ts';
import type { PayCoreEnv } from './types/env.ts';
import type { FulfillmentQueueMessage } from './types/queue.ts';

const app = createApp();

/**
 * Cloudflare Queue: ack when processQueueMessage completes without throw.
 * App webhook HTTP failures are persisted via markDeliveryOutcome (failed + next_retry_at);
 * those paths must not throw — PayCore retry uses delayed queue send / cron, not message.retry().
 */
export default {
  fetch: app.fetch,

  async queue(
    batch: MessageBatch<FulfillmentQueueMessage>,
    env: PayCoreEnv,
  ): Promise<void> {
    const paycoreEnv = validateEnv(env);
    const log = createLogger({ service: 'paycore-queue', batch_size: batch.messages.length });
    const fulfillment = new FulfillmentService(paycoreEnv, paycoreEnv.DB, log);

    for (const message of batch.messages) {
      try {
        await fulfillment.processQueueMessage(message.body);
        message.ack();
      } catch (err) {
        log.error('fulfillment_queue_message_failed', {
          event_id: message.body.eventId,
          delivery_id: message.body.deliveryId,
          attempt: message.body.attemptNumber,
          error: err instanceof Error ? err.message : 'unknown',
          will_cf_retry: true,
        });
        message.retry();
      }
    }
  },

  async scheduled(event: ScheduledEvent, env: PayCoreEnv): Promise<void> {
    const paycoreEnv = validateEnv(env);
    const log = createLogger({ service: 'paycore-cron' });
    const recon = new ReconciliationService(paycoreEnv.DB, log);

    if (event.cron === '*/15 * * * *') {
      const reconciledCount = await recon.reconcileMayarOrders(paycoreEnv);
      log.info('15min_mayar_reconciliation', {
        reconciled_count: reconciledCount,
      });
      return;
    }

    const result = await recon.runDaily(paycoreEnv);

    log.info('daily_reconciliation', {
      from: result.summary.from,
      to: result.summary.to,
      total_orders: result.summary.totalOrders,
      paid_orders: result.summary.paidOrders,
      fulfillment_failed: result.summary.fulfillmentFailed,
      expired_orders: result.expiredOrderCount,
      paid_undelivered: result.paidUndeliveredFound,
      requeued_fulfillment: result.requeuedFulfillmentCount,
    });
  },
};