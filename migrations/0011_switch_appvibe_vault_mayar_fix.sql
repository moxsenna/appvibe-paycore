UPDATE apps
SET
  default_merchant_profile_id = 'mp_mayar_main',
  updated_at = (unixepoch() * 1000)
WHERE id = 'app_appvibe_vault';
