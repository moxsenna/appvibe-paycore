-- AppVibe Vault should keep using Duitku in production.
-- The Mayar profile is available for other apps, but appvibe.biz.id checkout
-- is wired to the existing Duitku merchant profile and callback flow.
UPDATE apps
SET
  default_merchant_profile_id = 'mp_appvibe_default',
  updated_at = (unixepoch() * 1000)
WHERE id = 'app_appvibe_vault';
