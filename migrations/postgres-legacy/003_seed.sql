-- Seed data for development/staging (adjust URLs for environment)

INSERT INTO merchant_profiles (provider, profile_key, merchant_code, credential_ref, currency, status)
VALUES ('duitku', 'appvibe_default', 'DUMMY_MERCHANT', 'DUITKU_APPVIBE_MAIN', 'IDR', 'active')
ON CONFLICT (profile_key) DO NOTHING;

INSERT INTO apps (
  app_id,
  display_name,
  order_prefix,
  webhook_url,
  webhook_secret_ref,
  allowed_return_urls,
  default_merchant_profile_id,
  status
)
SELECT
  'narraza',
  'Narraza',
  'NAR',
  'https://api.narraza.web.id/internal/payment-events',
  'NARRAZA_WEBHOOK_SECRET',
  '["https://app.narraza.web.id/payment/return"]'::jsonb,
  mp.id,
  'active'
FROM merchant_profiles mp
WHERE mp.profile_key = 'appvibe_default'
ON CONFLICT (app_id) DO NOTHING;