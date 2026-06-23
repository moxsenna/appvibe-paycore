-- AppVibe PayCore — initial schema
-- Apply via Supabase SQL editor or migration pipeline

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- merchant_profiles
-- ---------------------------------------------------------------------------
CREATE TABLE merchant_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(32) NOT NULL,
  profile_key VARCHAR(64) NOT NULL UNIQUE,
  merchant_code VARCHAR(128) NOT NULL,
  credential_ref VARCHAR(128) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'IDR',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_merchant_profiles_provider ON merchant_profiles (provider);

-- ---------------------------------------------------------------------------
-- apps
-- ---------------------------------------------------------------------------
CREATE TABLE apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id VARCHAR(64) NOT NULL UNIQUE,
  display_name VARCHAR(128) NOT NULL,
  order_prefix VARCHAR(16) NOT NULL UNIQUE,
  webhook_url TEXT NOT NULL,
  webhook_secret_ref VARCHAR(128) NOT NULL,
  allowed_return_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_merchant_profile_id UUID REFERENCES merchant_profiles (id),
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- payment_orders
-- ---------------------------------------------------------------------------
CREATE TABLE payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id VARCHAR(64) NOT NULL UNIQUE,
  app_id UUID NOT NULL REFERENCES apps (id),
  merchant_profile_id UUID NOT NULL REFERENCES merchant_profiles (id),
  external_order_id VARCHAR(128) NOT NULL,
  product_key VARCHAR(128),
  description TEXT,
  amount BIGINT NOT NULL CHECK (amount > 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'IDR',
  payment_status VARCHAR(32) NOT NULL DEFAULT 'created',
  fulfillment_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  provider VARCHAR(32) NOT NULL,
  provider_reference VARCHAR(128),
  checkout_url TEXT,
  return_url TEXT NOT NULL,
  customer_name_encrypted TEXT,
  customer_email_encrypted TEXT,
  customer_phone_encrypted TEXT,
  fulfillment_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  internal_event_id VARCHAR(64),
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_payment_orders_app_external UNIQUE (app_id, external_order_id),
  CONSTRAINT uq_payment_orders_provider_ref UNIQUE (provider, provider_reference)
);

CREATE INDEX idx_payment_orders_app ON payment_orders (app_id);
CREATE INDEX idx_payment_orders_status ON payment_orders (payment_status, fulfillment_status);
CREATE INDEX idx_payment_orders_created ON payment_orders (created_at DESC);

-- ---------------------------------------------------------------------------
-- idempotency_keys
-- ---------------------------------------------------------------------------
CREATE TABLE idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES apps (id),
  idempotency_key VARCHAR(128) NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  payment_order_id UUID REFERENCES payment_orders (id),
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_idempotency_app_key UNIQUE (app_id, idempotency_key)
);

-- ---------------------------------------------------------------------------
-- payment_events (provider webhooks)
-- ---------------------------------------------------------------------------
CREATE TABLE payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(64) NOT NULL UNIQUE,
  provider VARCHAR(32) NOT NULL,
  merchant_profile_id UUID REFERENCES merchant_profiles (id),
  order_id UUID REFERENCES payment_orders (id),
  provider_event_id VARCHAR(128),
  event_type VARCHAR(64) NOT NULL,
  payload_hash VARCHAR(64) NOT NULL,
  raw_payload JSONB NOT NULL,
  signature_valid BOOLEAN NOT NULL DEFAULT false,
  processing_status VARCHAR(32) NOT NULL DEFAULT 'received',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  CONSTRAINT uq_payment_events_provider_event UNIQUE (provider, provider_event_id),
  CONSTRAINT uq_payment_events_provider_hash UNIQUE (provider, payload_hash)
);

CREATE INDEX idx_payment_events_order ON payment_events (order_id);

-- ---------------------------------------------------------------------------
-- fulfillment_deliveries
-- ---------------------------------------------------------------------------
CREATE TABLE fulfillment_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(64) NOT NULL,
  payment_order_id UUID NOT NULL REFERENCES payment_orders (id),
  app_id UUID NOT NULL REFERENCES apps (id),
  target_url TEXT NOT NULL,
  attempt_number INT NOT NULL DEFAULT 1,
  request_payload JSONB NOT NULL,
  response_status INT,
  response_body TEXT,
  delivery_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  next_retry_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fulfillment_deliveries_order ON fulfillment_deliveries (payment_order_id);
CREATE INDEX idx_fulfillment_deliveries_retry ON fulfillment_deliveries (delivery_status, next_retry_at)
  WHERE delivery_status IN ('pending', 'failed');

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type VARCHAR(32) NOT NULL,
  actor_id VARCHAR(128),
  action VARCHAR(64) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id VARCHAR(128) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_created ON audit_logs (created_at DESC);