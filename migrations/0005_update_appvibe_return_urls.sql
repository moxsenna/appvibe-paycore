-- Add active appvibe.biz.id checkout return URLs for the Vault client.
UPDATE apps
SET allowed_return_urls = '["https://appvibe.biz.id/checkout/", "http://localhost:5173/checkout/", "http://127.0.0.1:5173/checkout/"]'
WHERE app_id = 'appvibe_vault';
