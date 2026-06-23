-- Duitku MD5 signatures use DUITKU_MERCHANT_CODE + DUITKU_API_KEY from Worker secrets.
-- merchant_profiles.merchant_code is for ops/audit; keep in sync via:
--   npm run duitku:sync-merchant:staging
-- Callback URL is NOT a secret — register in Duitku dashboard:
--   https://pay-staging.appvibe.biz.id/webhooks/duitku

UPDATE merchant_profiles
SET merchant_code = 'CONFIGURE_VIA_SECRET_SYNC',
    updated_at = (unixepoch() * 1000)
WHERE profile_key = 'appvibe_default'
  AND merchant_code = 'DUMMY_MERCHANT';