import type { D1Database, Queue } from '@cloudflare/workers-types';
import type { FulfillmentQueueMessage } from './queue.ts';

export interface PayCoreEnv {
  ENVIRONMENT: string;
  DB: D1Database;
  FULFILLMENT_QUEUE: Queue<FulfillmentQueueMessage>;
  DEAD_LETTER_QUEUE: Queue<FulfillmentQueueMessage>;

  SENTRY_DSN?: string;

  DUITKU_BASE_URL: string;
  DUITKU_MERCHANT_CODE: string;
  DUITKU_API_KEY: string;
  DUITKU_CALLBACK_SECRET?: string;

  PAYCORE_PUBLIC_BASE_URL: string;
  PAYCORE_INTERNAL_MASTER_KEY: string;
  PAYCORE_ENCRYPTION_KEY: string;

  NARRAZA_APP_KEY_ID: string;
  NARRAZA_APP_SECRET: string;
  NARRAZA_WEBHOOK_SECRET: string;

  VAULT_APP_KEY_ID: string;
  VAULT_APP_SECRET: string;
  VAULT_WEBHOOK_SECRET: string;

  PAYCORE_ADMIN_DEV_TOKEN?: string;
}

export type { FulfillmentQueueMessage };