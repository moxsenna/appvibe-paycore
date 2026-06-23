import { createApp } from './app.ts';
import { validateEnv } from './config/env.ts';
import { createLogger } from './lib/logger.ts';
import { createSupabaseAdmin } from './lib/supabase.ts';
import { FulfillmentService } from './services/fulfillment-service.ts';
import { ReconciliationService } from './services/reconciliation-service.ts';
import type { FulfillmentQueueMessage, PayCoreEnv } from './types/env.ts';

const app = createApp();

export default {
  fetch: app.fetch,

  async queue(
    batch: MessageBatch<FulfillmentQueueMessage>,
    env: PayCoreEnv,
  ): Promise<void> {
    const paycoreEnv = validateEnv(env);
    const db = createSupabaseAdmin(paycoreEnv);
    const log = createLogger({ service: 'paycore-queue', batch_size: batch.messages.length });
    const fulfillment = new FulfillmentService(paycoreEnv, db, log);

    for (const message of batch.messages) {
      try {
        await fulfillment.processQueueMessage(message.body);
        message.ack();
      } catch (err) {
        log.error('fulfillment_queue_message_failed', {
          event_id: message.body.eventId,
          attempt: message.body.attemptNumber,
          error: err instanceof Error ? err.message : 'unknown',
        });
        message.retry();
      }
    }
  },

  async scheduled(_event: ScheduledEvent, env: PayCoreEnv): Promise<void> {
    const paycoreEnv = validateEnv(env);
    const db = createSupabaseAdmin(paycoreEnv);
    const log = createLogger({ service: 'paycore-cron' });
    const recon = new ReconciliationService(db, log);

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