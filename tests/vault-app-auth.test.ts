import { describe, expect, it } from 'vitest';
import { resolveAppSecret, resolveWebhookSecret } from '../src/config/env.ts';
import type { PayCoreEnv } from '../src/types/env.ts';

const base = {
  ENVIRONMENT: 'test',
  DUITKU_BASE_URL: 'https://api-sandbox.duitku.com',
  DUITKU_MERCHANT_CODE: 'DS',
  DUITKU_API_KEY: 'key',
  PAYCORE_PUBLIC_BASE_URL: 'https://pay-staging.appvibe.biz.id',
  PAYCORE_INTERNAL_MASTER_KEY: 'x'.repeat(32),
  PAYCORE_ENCRYPTION_KEY: 'y'.repeat(32),
  NARRAZA_APP_KEY_ID: 'pk_nar',
  NARRAZA_APP_SECRET: 'nar_secret_12',
  NARRAZA_WEBHOOK_SECRET: 'nar_wh_12',
  VAULT_APP_KEY_ID: 'pk_vault',
  VAULT_APP_SECRET: 'vault_secret_12',
  VAULT_WEBHOOK_SECRET: 'vault_wh_12',
} as PayCoreEnv;

describe('vault app credentials', () => {
  it('resolves vault app secret by key id', () => {
    expect(resolveAppSecret(base, 'pk_vault')).toBe('vault_secret_12');
  });

  it('resolves vault webhook secret ref', () => {
    expect(resolveWebhookSecret(base, 'VAULT_WEBHOOK_SECRET')).toBe('vault_wh_12');
  });
});
