export interface PayCoreEnv {
  ENVIRONMENT: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
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

  PAYCORE_ADMIN_DEV_TOKEN?: string;

  FULFILLMENT_QUEUE: Queue<FulfillmentQueueMessage>;
  DEAD_LETTER_QUEUE: Queue<FulfillmentQueueMessage>;
}

export interface FulfillmentQueueMessage {
  deliveryId: string;
  eventId: string;
  paymentOrderId: string;
  appId: string;
  attemptNumber: number;
}

export type AppCredentials = {
  keyId: string;
  secret: string;
  webhookSecret: string;
};