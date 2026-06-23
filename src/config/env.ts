import { z } from 'zod';
import type { PayCoreEnv } from '../types/env.ts';

const envSchema = z.object({
  ENVIRONMENT: z.string().min(1),
  SENTRY_DSN: z.string().optional(),
  DUITKU_BASE_URL: z.string().url(),
  DUITKU_MERCHANT_CODE: z.string().min(1),
  DUITKU_API_KEY: z.string().min(1),
  DUITKU_CALLBACK_SECRET: z.string().optional(),
  PAYCORE_PUBLIC_BASE_URL: z.string().url(),
  PAYCORE_INTERNAL_MASTER_KEY: z.string().min(16),
  PAYCORE_ENCRYPTION_KEY: z.string().min(16),
  NARRAZA_APP_KEY_ID: z.string().min(1),
  NARRAZA_APP_SECRET: z.string().min(8),
  NARRAZA_WEBHOOK_SECRET: z.string().min(8),
  VAULT_APP_KEY_ID: z.string().min(1),
  VAULT_APP_SECRET: z.string().min(8),
  VAULT_WEBHOOK_SECRET: z.string().min(8),
  PAYCORE_ADMIN_DEV_TOKEN: z.string().optional(),
});

export function validateEnv(raw: PayCoreEnv): PayCoreEnv {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid PayCore environment: ${fields}`);
  }
  return raw;
}

export function resolveAppSecret(env: PayCoreEnv, keyId: string): string | null {
  if (keyId === env.NARRAZA_APP_KEY_ID) return env.NARRAZA_APP_SECRET;
  if (keyId === env.VAULT_APP_KEY_ID) return env.VAULT_APP_SECRET;
  return null;
}

export function resolveWebhookSecret(env: PayCoreEnv, secretRef: string): string | null {
  if (secretRef === 'NARRAZA_WEBHOOK_SECRET') return env.NARRAZA_WEBHOOK_SECRET;
  if (secretRef === 'VAULT_WEBHOOK_SECRET') return env.VAULT_WEBHOOK_SECRET;
  return null;
}