-- Up

ALTER TABLE payment_orders ADD COLUMN provider_transaction_reference TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_orders_provider_transaction_reference
ON payment_orders(provider, provider_transaction_reference)
WHERE provider_transaction_reference IS NOT NULL;

ALTER TABLE payment_events ADD COLUMN verification_method TEXT NOT NULL DEFAULT 'provider_signature';
ALTER TABLE payment_events ADD COLUMN verification_valid INTEGER NOT NULL DEFAULT 0;

UPDATE payment_events
SET verification_valid = signature_valid
WHERE verification_valid = 0;

INSERT INTO merchant_profiles (
  id,
  provider,
  profile_key,
  merchant_code,
  credential_ref,
  currency,
  status,
  created_at,
  updated_at
) VALUES (
  'mp_mayar_main',
  'mayar',
  'mp_mayar_main',
  'MAYAR_DUMMY_CODE',
  'MAYAR_APPVIBE_MAIN',
  'IDR',
  'active',
  1719600000000,
  1719600000000
);

-- Note: we update apps to use the Mayar profile if they were using Duitku
UPDATE apps
SET default_merchant_profile_id = 'mp_mayar_main'
WHERE id IN ('app_narraza', 'app_appvibe_vault');
