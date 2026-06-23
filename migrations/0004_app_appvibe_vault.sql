-- AppVibe White-Label Vault landing (checkout test via PayCore, not Narraza)
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
  'app_appvibe_vault',
  'appvibe_vault',
  'AppVibe White-Label Vault',
  'VLT',
  'https://appvibe.web.id/api/webhooks/paycore',
  'VAULT_WEBHOOK_SECRET',
  '["https://appvibe.web.id/payment/return","http://localhost:5173/payment/return","http://127.0.0.1:5173/payment/return"]',
  'mp_appvibe_default',
  'active',
  (unixepoch() * 1000),
  (unixepoch() * 1000)
);