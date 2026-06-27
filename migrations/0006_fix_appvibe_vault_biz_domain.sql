-- Keep the AppVibe Vault client pointed at the product-sales checkout repo.
-- appvibe.web.id is a separate service-business project and must not receive
-- appvibe.biz.id payment fulfillment webhooks.
UPDATE apps
SET
  webhook_url = 'https://appvibe.biz.id/api/webhooks/paycore',
  allowed_return_urls = '["https://appvibe.biz.id/checkout/", "http://localhost:5173/checkout/", "http://127.0.0.1:5173/checkout/"]',
  updated_at = (unixepoch() * 1000)
WHERE app_id = 'appvibe_vault';
