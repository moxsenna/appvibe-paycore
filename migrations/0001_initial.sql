-- AppVibe PayCore — Cloudflare D1 (SQLite)
-- Timestamps: INTEGER Unix milliseconds UTC

CREATE TABLE merchant_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  profile_key TEXT NOT NULL UNIQUE,
  merchant_code TEXT NOT NULL,
  credential_ref TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'IDR',
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_merchant_profiles_provider ON merchant_profiles (provider);

CREATE TABLE apps (
  id TEXT PRIMARY KEY NOT NULL,
  app_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  order_prefix TEXT NOT NULL UNIQUE,
  webhook_url TEXT NOT NULL,
  webhook_secret_ref TEXT NOT NULL,
  allowed_return_urls TEXT NOT NULL DEFAULT '[]',
  default_merchant_profile_id TEXT REFERENCES merchant_profiles (id),
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE payment_orders (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL UNIQUE,
  app_id TEXT NOT NULL REFERENCES apps (id),
  merchant_profile_id TEXT NOT NULL REFERENCES merchant_profiles (id),
  external_order_id TEXT NOT NULL,
  product_key TEXT,
  description TEXT,
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'IDR',
  payment_status TEXT NOT NULL DEFAULT 'created',
  fulfillment_status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT NOT NULL,
  provider_reference TEXT,
  checkout_url TEXT,
  return_url TEXT NOT NULL,
  customer_name_encrypted TEXT,
  customer_email_encrypted TEXT,
  customer_phone_encrypted TEXT,
  fulfillment_data TEXT NOT NULL DEFAULT '{}',
  internal_event_id TEXT,
  expires_at INTEGER,
  paid_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (app_id, external_order_id),
  UNIQUE (provider, provider_reference)
);

CREATE INDEX idx_payment_orders_app ON payment_orders (app_id);
CREATE INDEX idx_payment_orders_status ON payment_orders (payment_status, fulfillment_status);
CREATE INDEX idx_payment_orders_created ON payment_orders (created_at DESC);
CREATE INDEX idx_payment_orders_expire ON payment_orders (payment_status, expires_at);

CREATE TABLE idempotency_keys (
  id TEXT PRIMARY KEY NOT NULL,
  app_id TEXT NOT NULL REFERENCES apps (id),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  payment_order_id TEXT REFERENCES payment_orders (id),
  response_body TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (app_id, idempotency_key)
);

CREATE TABLE payment_events (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  merchant_profile_id TEXT REFERENCES merchant_profiles (id),
  order_id TEXT REFERENCES payment_orders (id),
  provider_event_id TEXT,
  event_type TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  raw_payload TEXT NOT NULL,
  signature_valid INTEGER NOT NULL DEFAULT 0,
  processing_status TEXT NOT NULL DEFAULT 'received',
  received_at INTEGER NOT NULL,
  processed_at INTEGER,
  UNIQUE (provider, provider_event_id),
  UNIQUE (provider, payload_hash)
);

CREATE INDEX idx_payment_events_order ON payment_events (order_id, received_at);

CREATE TABLE fulfillment_deliveries (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL,
  payment_order_id TEXT NOT NULL REFERENCES payment_orders (id),
  app_id TEXT NOT NULL REFERENCES apps (id),
  target_url TEXT NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  request_payload TEXT NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'pending',
  next_retry_at INTEGER,
  delivered_at INTEGER,
  last_attempt_at INTEGER,
  claimed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_fulfillment_deliveries_order ON fulfillment_deliveries (payment_order_id);
CREATE INDEX idx_fulfillment_deliveries_event ON fulfillment_deliveries (event_id);
CREATE INDEX idx_fulfillment_deliveries_due ON fulfillment_deliveries (delivery_status, next_retry_at);
CREATE INDEX idx_fulfillment_deliveries_app_status ON fulfillment_deliveries (app_id, delivery_status);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON audit_logs (created_at DESC);