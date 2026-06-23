INSERT OR IGNORE INTO merchant_profiles (
  id, provider, profile_key, merchant_code, credential_ref, currency, status, created_at, updated_at
) VALUES (
  'mp_appvibe_default',
  'duitku',
  'appvibe_default',
  'DUMMY_MERCHANT',
  'DUITKU_APPVIBE_MAIN',
  'IDR',
  'active',
  0,
  0
);

INSERT OR IGNORE INTO apps (
  id,
  app_id,
  display_name,
  order_prefix,
  webhook_url,
  webhook_secret_ref,
  allowed_return_urls,
  default_merchant_profile_id,
  status,
  created_at,
  updated_at
) VALUES (
  'app_narraza',
  'narraza',
  'Narraza',
  'NAR',
  'https://api.narraza.web.id/internal/payment-events',
  'NARRAZA_WEBHOOK_SECRET',
  '["https://app.narraza.web.id/payment/return"]',
  'mp_appvibe_default',
  'active',
  0,
  0
);