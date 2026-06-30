-- Up
UPDATE apps
SET
  default_merchant_profile_id = 'mp_appvibe_default',
  updated_at = (unixepoch() * 1000)
WHERE id IN ('app_appvibe_vault', 'app_narraza');

-- Down
-- (no-op)
