import { parseJson, type PayCoreDb } from '../client.ts';

export interface AppRow {
  id: string;
  app_id: string;
  order_prefix: string;
  default_merchant_profile_id: string | null;
  allowed_return_urls: unknown;
  status: string;
  webhook_url: string;
  webhook_secret_ref: string;
}

export async function getAppByUuid(db: PayCoreDb, appUuid: string): Promise<AppRow | null> {
  const row = await db
    .prepare(
      `SELECT id, app_id, order_prefix, default_merchant_profile_id, allowed_return_urls, status,
              webhook_url, webhook_secret_ref
       FROM apps WHERE id = ?`,
    )
    .bind(appUuid)
    .first<Record<string, unknown>>();
  if (!row) return null;
  return {
    id: String(row.id),
    app_id: String(row.app_id),
    order_prefix: String(row.order_prefix),
    default_merchant_profile_id:
      row.default_merchant_profile_id === null ? null : String(row.default_merchant_profile_id),
    allowed_return_urls: parseJson(row.allowed_return_urls as string, []),
    status: String(row.status),
    webhook_url: String(row.webhook_url),
    webhook_secret_ref: String(row.webhook_secret_ref),
  };
}

export async function getAppBySlug(db: PayCoreDb, appSlug: string): Promise<{ id: string; app_id: string; status: string } | null> {
  const row = await db
    .prepare(`SELECT id, app_id, status FROM apps WHERE app_id = ?`)
    .bind(appSlug)
    .first<{ id: string; app_id: string; status: string }>();
  return row ?? null;
}

export interface MerchantProfileRow {
  id: string;
  profile_key: string;
  provider: string;
  merchant_code: string;
}

export async function getActiveMerchantProfile(
  db: PayCoreDb,
  opts: { profileKey?: string; defaultId?: string | null },
): Promise<MerchantProfileRow | null> {
  let row: Record<string, unknown> | null = null;
  if (opts.profileKey) {
    row = await db
      .prepare(
        `SELECT id, profile_key, provider, merchant_code FROM merchant_profiles
         WHERE status = 'active' AND profile_key = ?`,
      )
      .bind(opts.profileKey)
      .first<Record<string, unknown>>();
  } else if (opts.defaultId) {
    row = await db
      .prepare(
        `SELECT id, profile_key, provider, merchant_code FROM merchant_profiles
         WHERE status = 'active' AND id = ?`,
      )
      .bind(opts.defaultId)
      .first<Record<string, unknown>>();
  }
  if (!row) return null;
  return {
    id: String(row.id),
    profile_key: String(row.profile_key),
    provider: String(row.provider),
    merchant_code: String(row.merchant_code),
  };
}

export async function getMerchantCode(db: PayCoreDb, merchantProfileId: string): Promise<string | null> {
  const row = await db
    .prepare(`SELECT merchant_code FROM merchant_profiles WHERE id = ?`)
    .bind(merchantProfileId)
    .first<{ merchant_code: string }>();
  return row?.merchant_code ?? null;
}

export async function getAllowedReturnUrls(db: PayCoreDb, appUuid: string): Promise<unknown> {
  const row = await db
    .prepare(`SELECT allowed_return_urls FROM apps WHERE id = ?`)
    .bind(appUuid)
    .first<{ allowed_return_urls: string }>();
  return parseJson(row?.allowed_return_urls, []);
}