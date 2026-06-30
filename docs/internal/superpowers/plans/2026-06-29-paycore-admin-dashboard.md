# PayCore Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the PayCore admin onboarding dashboard and Admin API orchestration layer so new AppVibe projects can be registered, configured, tested, and exported as integration kits with minimal manual coding.

**Architecture:** Keep privileged operations inside the existing PayCore Worker. Add D1-backed credential mappings, provider-template reuse through merchant profiles, onboarding/test audit records, Admin API endpoints, and a separate `admin/` Cloudflare Pages frontend that calls the PayCore Admin API.

**Tech Stack:** Cloudflare Workers, Hono, TypeScript, D1, Vitest, Cloudflare Workers Secrets API, Cloudflare Pages, Vite, React, CSS modules/plain CSS.

---

All paths below are relative to `D:/Coding/paycore` unless explicitly stated otherwise.

## Scope Check

This plan intentionally covers one vertical MVP: project onboarding from dashboard form to backend records, Worker secrets, integration test, and generated consumer-project kit. It does not build the full monitoring dashboard, role hierarchy, Midtrans adapter, or automatic provider credential creation.

## File Structure

### Backend

- Create `migrations/0008_admin_onboarding.sql`
  - Adds `app_credentials`, `onboarding_runs`, and `integration_tests`.
  - Adds provider-template display metadata to `merchant_profiles`.
  - Seeds credential mappings for existing Narraza and AppVibe Vault apps.

- Modify `tests/d1-schema.test.ts`
  - Adds assertions for new tables and indexes.

- Create `src/lib/secret-refs.ts`
  - Generates deterministic secret refs and validates refs before env lookup.

- Create `tests/secret-refs.test.ts`
  - Unit tests for secret ref generation and validation.

- Modify `src/types/env.ts`
  - Adds Cloudflare API config fields used by admin onboarding.
  - Keeps existing Narraza/Vault fields during compatibility transition.

- Modify `src/config/env.ts`
  - Adds generic `resolveEnvSecret`.
  - Keeps legacy `resolveAppSecret` fallback for existing tests until DB-backed auth is fully wired.

- Create `src/db/repositories/credentials-repository.ts`
  - D1 access for active credential lookup and rotation metadata.

- Extend `src/db/repositories/apps-repository.ts`
  - Admin list/detail/create/update helpers for apps and merchant profiles.

- Create `src/db/repositories/onboarding-repository.ts`
  - D1 access for onboarding runs and integration test records.

- Create `src/services/cloudflare-secrets-client.ts`
  - Small fetch-based client for Cloudflare Workers Secrets API.

- Create `tests/cloudflare-secrets-client.test.ts`
  - Mocked fetch tests for bulk secret update payloads and failures.

- Create `src/services/admin-onboarding-service.ts`
  - Create app, activate app, rotate secrets, run webhook ping, generate integration kit.

- Create `src/schemas/admin-onboarding.ts`
  - Zod schemas for Admin API payloads.

- Modify `src/routes/admin.ts`
  - Adds app onboarding, provider-template, test, and integration-kit endpoints.

- Modify `src/middleware/app-auth.ts`
  - Resolves app secrets through D1-backed credential mapping by `X-PayCore-Key-Id`.

- Modify `src/services/fulfillment-service.ts`
  - Uses generic webhook secret resolution.

- Create backend tests:
  - `tests/admin-onboarding-validation.test.ts`
  - `tests/admin-app-auth-credentials.test.ts`
  - `tests/admin-integration-kit.test.ts`
  - `tests/admin-webhook-ping.test.ts`

- Modify docs:
  - `docs/internal/integrating-new-app.md`
  - `docs/external/integration-guide.md`
  - `docs/external/openapi.yaml`
  - `prompt.md`

### Frontend

- Create `admin/package.json`
- Create `admin/tsconfig.json`
- Create `admin/index.html`
- Create `admin/src/main.tsx`
- Create `admin/src/App.tsx`
- Create `admin/src/api.ts`
- Create `admin/src/types.ts`
- Create `admin/src/components/ProjectForm.tsx`
- Create `admin/src/components/ProjectSidebar.tsx`
- Create `admin/src/components/GeneratedOutput.tsx`
- Create `admin/src/components/IntegrationTestsPanel.tsx`
- Create `admin/src/styles.css`

The frontend is intentionally kept as one small Vite app with focused components. It does not share runtime code with the Worker in the first pass.

---

### Task 1: Workspace Hygiene And Baseline

**Files:**
- Modify: `.gitignore`
- Verify: `package.json`

- [ ] **Step 1: Add brainstorm artifacts to `.gitignore`**

Add this line near other local/generated directories:

```gitignore
.superpowers/
```

- [ ] **Step 2: Verify baseline tests before functional changes**

Run:

```bash
npm run typecheck
npm test
npm run lint
```

Expected:

```text
tsc exits 0
vitest exits 0
eslint exits 0
```

If a command fails before this work begins, capture the exact failure in the task notes and do not hide it inside later changes.

- [ ] **Step 3: Commit hygiene-only change**

```bash
git add .gitignore
git commit -m "chore: ignore brainstorm artifacts"
```

---

### Task 2: D1 Schema For Admin Onboarding

**Files:**
- Create: `migrations/0008_admin_onboarding.sql`
- Modify: `tests/d1-schema.test.ts`

- [ ] **Step 1: Write the failing schema assertions**

Extend `tests/d1-schema.test.ts` so it reads both `0001_initial.sql` and `0008_admin_onboarding.sql`.

Add these assertions:

```ts
const adminOnboardingMigration = readFileSync(
  join(process.cwd(), 'migrations', '0008_admin_onboarding.sql'),
  'utf8',
);

describe('admin onboarding migration', () => {
  for (const table of ['app_credentials', 'onboarding_runs', 'integration_tests']) {
    it(`defines table ${table}`, () => {
      expect(adminOnboardingMigration).toMatch(new RegExp(`CREATE TABLE ${table}`, 'i'));
    });
  }

  it('adds provider template display metadata to merchant profiles', () => {
    expect(adminOnboardingMigration).toMatch(/ALTER TABLE merchant_profiles ADD COLUMN display_label TEXT/i);
  });

  it('indexes active credentials by key id', () => {
    expect(adminOnboardingMigration).toMatch(/idx_app_credentials_active_key/i);
    expect(adminOnboardingMigration).toMatch(/WHERE status = 'active'/i);
  });

  it('seeds existing app credentials for compatibility', () => {
    expect(adminOnboardingMigration).toContain('pk_staging_narraza_01');
    expect(adminOnboardingMigration).toContain('pk_staging_vault_01');
  });
});
```

- [ ] **Step 2: Run schema test and verify it fails**

Run:

```bash
npm test -- tests/d1-schema.test.ts
```

Expected:

```text
FAIL tests/d1-schema.test.ts
ENOENT: no such file or directory, open '...0008_admin_onboarding.sql'
```

- [ ] **Step 3: Add the migration**

Create `migrations/0008_admin_onboarding.sql`:

```sql
-- Admin onboarding dashboard support.
-- D1 stores references and operational state. Secret values stay in Worker secrets.

ALTER TABLE merchant_profiles ADD COLUMN display_label TEXT;
ALTER TABLE merchant_profiles ADD COLUMN template_description TEXT;

UPDATE merchant_profiles
SET display_label = profile_key
WHERE display_label IS NULL;

CREATE TABLE app_credentials (
  id TEXT PRIMARY KEY NOT NULL,
  app_id TEXT NOT NULL REFERENCES apps (id),
  environment TEXT NOT NULL,
  key_id TEXT NOT NULL UNIQUE,
  app_secret_ref TEXT NOT NULL,
  webhook_secret_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  rotated_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_app_credentials_active_key
ON app_credentials (key_id)
WHERE status = 'active';

CREATE UNIQUE INDEX idx_app_credentials_active_app_env
ON app_credentials (app_id, environment)
WHERE status = 'active';

CREATE INDEX idx_app_credentials_app ON app_credentials (app_id);

CREATE TABLE onboarding_runs (
  id TEXT PRIMARY KEY NOT NULL,
  app_id TEXT REFERENCES apps (id),
  environment TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  actor_id TEXT,
  request_id TEXT,
  input_summary TEXT NOT NULL DEFAULT '{}',
  result_summary TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  error_detail TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_onboarding_runs_app_created ON onboarding_runs (app_id, created_at DESC);
CREATE INDEX idx_onboarding_runs_status ON onboarding_runs (status, created_at DESC);

CREATE TABLE integration_tests (
  id TEXT PRIMARY KEY NOT NULL,
  app_id TEXT NOT NULL REFERENCES apps (id),
  environment TEXT NOT NULL,
  test_type TEXT NOT NULL,
  status TEXT NOT NULL,
  request_id TEXT,
  target_url TEXT,
  response_status INTEGER,
  response_body_excerpt TEXT,
  latency_ms INTEGER,
  generated_fix_prompt TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_integration_tests_app_created ON integration_tests (app_id, created_at DESC);
CREATE INDEX idx_integration_tests_type_status ON integration_tests (test_type, status);

INSERT OR IGNORE INTO app_credentials (
  id, app_id, environment, key_id, app_secret_ref, webhook_secret_ref,
  status, created_at, rotated_at, updated_at
) VALUES (
  'cred_narraza_staging_01',
  'app_narraza',
  'staging',
  'pk_staging_narraza_01',
  'NARRAZA_APP_SECRET',
  'NARRAZA_WEBHOOK_SECRET',
  'active',
  (unixepoch() * 1000),
  NULL,
  (unixepoch() * 1000)
);

INSERT OR IGNORE INTO app_credentials (
  id, app_id, environment, key_id, app_secret_ref, webhook_secret_ref,
  status, created_at, rotated_at, updated_at
) VALUES (
  'cred_appvibe_vault_staging_01',
  'app_appvibe_vault',
  'staging',
  'pk_staging_vault_01',
  'VAULT_APP_SECRET',
  'VAULT_WEBHOOK_SECRET',
  'active',
  (unixepoch() * 1000),
  NULL,
  (unixepoch() * 1000)
);
```

- [ ] **Step 4: Run schema test and verify it passes**

Run:

```bash
npm test -- tests/d1-schema.test.ts
```

Expected:

```text
PASS tests/d1-schema.test.ts
```

- [ ] **Step 5: Commit schema**

```bash
git add migrations/0008_admin_onboarding.sql tests/d1-schema.test.ts
git commit -m "feat: add admin onboarding schema"
```

---

### Task 3: Secret Ref Helpers

**Files:**
- Create: `src/lib/secret-refs.ts`
- Create: `tests/secret-refs.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/secret-refs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  assertValidSecretRef,
  buildAppSecretRef,
  buildWebhookSecretRef,
  normalizeSecretRefPart,
} from '../src/lib/secret-refs.ts';

describe('secret ref helpers', () => {
  it('normalizes app ids for env secret names', () => {
    expect(normalizeSecretRefPart('siklusio')).toBe('SIKLUSIO');
    expect(normalizeSecretRefPart('appvibe-vault')).toBe('APPVIBE_VAULT');
    expect(normalizeSecretRefPart('appvibe_vault')).toBe('APPVIBE_VAULT');
  });

  it('builds deterministic app and webhook refs', () => {
    expect(buildAppSecretRef('siklusio', 'staging')).toBe('APP_SIKLUSIO_STAGING_SECRET');
    expect(buildWebhookSecretRef('siklusio', 'production')).toBe(
      'WEBHOOK_SIKLUSIO_PRODUCTION_SECRET',
    );
  });

  it('rejects unsafe refs', () => {
    expect(() => assertValidSecretRef('APP_SIKLUSIO_STAGING_SECRET')).not.toThrow();
    expect(() => assertValidSecretRef('__proto__')).toThrow('Invalid secret ref');
    expect(() => assertValidSecretRef('APP siklusio')).toThrow('Invalid secret ref');
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- tests/secret-refs.test.ts
```

Expected:

```text
FAIL tests/secret-refs.test.ts
Cannot find module '../src/lib/secret-refs.ts'
```

- [ ] **Step 3: Implement helper**

Create `src/lib/secret-refs.ts`:

```ts
const SAFE_SECRET_REF = /^[A-Z][A-Z0-9_]{2,127}$/;

export function normalizeSecretRefPart(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

export function buildAppSecretRef(appId: string, environment: string): string {
  return `APP_${normalizeSecretRefPart(appId)}_${normalizeSecretRefPart(environment)}_SECRET`;
}

export function buildWebhookSecretRef(appId: string, environment: string): string {
  return `WEBHOOK_${normalizeSecretRefPart(appId)}_${normalizeSecretRefPart(environment)}_SECRET`;
}

export function assertValidSecretRef(ref: string): void {
  if (!SAFE_SECRET_REF.test(ref)) {
    throw new Error(`Invalid secret ref: ${ref}`);
  }
}
```

- [ ] **Step 4: Run test and verify it passes**

Run:

```bash
npm test -- tests/secret-refs.test.ts
```

Expected:

```text
PASS tests/secret-refs.test.ts
```

- [ ] **Step 5: Commit helper**

```bash
git add src/lib/secret-refs.ts tests/secret-refs.test.ts
git commit -m "feat: add deterministic secret refs"
```

---

### Task 4: Generic Env Secret Resolution

**Files:**
- Modify: `src/types/env.ts`
- Modify: `src/config/env.ts`
- Modify: `tests/vault-app-auth.test.ts`

- [ ] **Step 1: Add failing generic resolver tests**

Extend `tests/vault-app-auth.test.ts` with:

```ts
import { resolveEnvSecret } from '../src/config/env.ts';

it('resolves any valid Worker secret ref from env', () => {
  const env = {
    ...base,
    APP_SIKLUSIO_STAGING_SECRET: 'siklusio_app_secret',
  } as PayCoreEnv & Record<string, string>;

  expect(resolveEnvSecret(env, 'APP_SIKLUSIO_STAGING_SECRET')).toBe('siklusio_app_secret');
});

it('returns null for missing or unsafe secret refs', () => {
  expect(resolveEnvSecret(base, 'APP_UNKNOWN_SECRET')).toBeNull();
  expect(resolveEnvSecret(base, '__proto__')).toBeNull();
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- tests/vault-app-auth.test.ts
```

Expected:

```text
FAIL tests/vault-app-auth.test.ts
No export named 'resolveEnvSecret'
```

- [ ] **Step 3: Extend env type and schema**

In `src/types/env.ts`, add optional Cloudflare API config fields:

```ts
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  PAYCORE_WORKER_SCRIPT_NAME?: string;
```

In `src/config/env.ts`, add the same optional schema entries:

```ts
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1).optional(),
  CLOUDFLARE_API_TOKEN: z.string().min(1).optional(),
  PAYCORE_WORKER_SCRIPT_NAME: z.string().min(1).optional(),
```

- [ ] **Step 4: Implement generic resolver**

Add this import and function in `src/config/env.ts`:

```ts
import { assertValidSecretRef } from '../lib/secret-refs.ts';
```

```ts
export function resolveEnvSecret(env: PayCoreEnv, secretRef: string): string | null {
  try {
    assertValidSecretRef(secretRef);
  } catch {
    return null;
  }

  const raw = (env as unknown as Record<string, unknown>)[secretRef];
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}
```

Change `resolveWebhookSecret` to:

```ts
export function resolveWebhookSecret(env: PayCoreEnv, secretRef: string): string | null {
  return resolveEnvSecret(env, secretRef);
}
```

Keep the existing `resolveAppSecret` function for legacy tests and fallback behavior.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- tests/vault-app-auth.test.ts tests/secret-refs.test.ts
```

Expected:

```text
PASS tests/vault-app-auth.test.ts
PASS tests/secret-refs.test.ts
```

- [ ] **Step 6: Commit generic env resolution**

```bash
git add src/types/env.ts src/config/env.ts tests/vault-app-auth.test.ts
git commit -m "feat: resolve dynamic worker secrets"
```

---

### Task 5: Credential Repository And App Auth Refactor

**Files:**
- Create: `src/db/repositories/credentials-repository.ts`
- Modify: `src/middleware/app-auth.ts`
- Create: `tests/admin-app-auth-credentials.test.ts`

- [ ] **Step 1: Write repository and middleware behavior tests**

Create `tests/admin-app-auth-credentials.test.ts` with focused tests for the repository mapper and fallback behavior:

```ts
import { describe, expect, it } from 'vitest';
import { mapCredentialRow } from '../src/db/repositories/credentials-repository.ts';

describe('app credential mapping', () => {
  it('maps D1 credential rows into typed values', () => {
    expect(
      mapCredentialRow({
        id: 'cred_1',
        app_id: 'app_siklusio',
        environment: 'staging',
        key_id: 'pk_staging_siklusio_01',
        app_secret_ref: 'APP_SIKLUSIO_STAGING_SECRET',
        webhook_secret_ref: 'WEBHOOK_SIKLUSIO_STAGING_SECRET',
        status: 'active',
        rotated_at: null,
      }),
    ).toEqual({
      id: 'cred_1',
      appUuid: 'app_siklusio',
      environment: 'staging',
      keyId: 'pk_staging_siklusio_01',
      appSecretRef: 'APP_SIKLUSIO_STAGING_SECRET',
      webhookSecretRef: 'WEBHOOK_SIKLUSIO_STAGING_SECRET',
      status: 'active',
      rotatedAt: null,
    });
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- tests/admin-app-auth-credentials.test.ts
```

Expected:

```text
FAIL tests/admin-app-auth-credentials.test.ts
Cannot find module '../src/db/repositories/credentials-repository.ts'
```

- [ ] **Step 3: Implement credentials repository**

Create `src/db/repositories/credentials-repository.ts`:

```ts
import type { PayCoreDb } from '../client.ts';

export interface AppCredentialRow {
  id: string;
  appUuid: string;
  environment: string;
  keyId: string;
  appSecretRef: string;
  webhookSecretRef: string;
  status: string;
  rotatedAt: number | null;
}

export function mapCredentialRow(row: Record<string, unknown>): AppCredentialRow {
  return {
    id: String(row.id),
    appUuid: String(row.app_id),
    environment: String(row.environment),
    keyId: String(row.key_id),
    appSecretRef: String(row.app_secret_ref),
    webhookSecretRef: String(row.webhook_secret_ref),
    status: String(row.status),
    rotatedAt: row.rotated_at === null ? null : Number(row.rotated_at),
  };
}

export async function getActiveCredentialByKeyId(
  db: PayCoreDb,
  keyId: string,
): Promise<AppCredentialRow | null> {
  const row = await db
    .prepare(
      `SELECT id, app_id, environment, key_id, app_secret_ref, webhook_secret_ref, status, rotated_at
       FROM app_credentials
       WHERE key_id = ? AND status = 'active'
       LIMIT 1`,
    )
    .bind(keyId)
    .first<Record<string, unknown>>();
  return row ? mapCredentialRow(row) : null;
}
```

- [ ] **Step 4: Refactor app auth middleware**

In `src/middleware/app-auth.ts`, import:

```ts
import { resolveAppSecret, resolveEnvSecret } from '../config/env.ts';
import { getActiveCredentialByKeyId } from '../db/repositories/credentials-repository.ts';
```

Replace:

```ts
  const secret = resolveAppSecret(env, keyId);
```

with:

```ts
  const db = c.get('db');
  const credential = await getActiveCredentialByKeyId(db, keyId).catch(() => null);
  const secret = credential
    ? resolveEnvSecret(env, credential.appSecretRef)
    : resolveAppSecret(env, keyId);
```

Remove the later duplicate `const db = c.get('db');` declaration and reuse the existing variable.

After fetching `appRow`, add a key/app consistency check:

```ts
  if (credential && credential.appUuid !== appRow.id) {
    throw Errors.unauthorized('API key does not belong to app');
  }
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- tests/admin-app-auth-credentials.test.ts tests/vault-app-auth.test.ts
npm run typecheck
```

Expected:

```text
PASS tests/admin-app-auth-credentials.test.ts
PASS tests/vault-app-auth.test.ts
tsc exits 0
```

- [ ] **Step 6: Commit credential auth**

```bash
git add src/db/repositories/credentials-repository.ts src/middleware/app-auth.ts tests/admin-app-auth-credentials.test.ts
git commit -m "feat: resolve app auth credentials from d1"
```

---

### Task 6: Cloudflare Secrets Client

**Files:**
- Create: `src/services/cloudflare-secrets-client.ts`
- Create: `tests/cloudflare-secrets-client.test.ts`

- [ ] **Step 1: Write failing client tests**

Create `tests/cloudflare-secrets-client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudflareSecretsClient } from '../src/services/cloudflare-secrets-client.ts';

describe('CloudflareSecretsClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('patches multiple worker secrets using secrets-bulk', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ success: true, result: {}, errors: [], messages: [] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new CloudflareSecretsClient({
      accountId: 'acct_123',
      apiToken: 'token_123',
      scriptName: 'appvibe-paycore-staging',
    });

    await client.bulkUpdateSecrets({
      APP_SIKLUSIO_STAGING_SECRET: 'app-secret',
      WEBHOOK_SIKLUSIO_STAGING_SECRET: 'webhook-secret',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acct_123/workers/scripts/appvibe-paycore-staging/secrets-bulk',
    );
    expect(init.method).toBe('PATCH');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token_123');
    expect(JSON.parse(String(init.body))).toEqual({
      secrets: {
        APP_SIKLUSIO_STAGING_SECRET: {
          type: 'secret_text',
          name: 'APP_SIKLUSIO_STAGING_SECRET',
          text: 'app-secret',
        },
        WEBHOOK_SIKLUSIO_STAGING_SECRET: {
          type: 'secret_text',
          name: 'WEBHOOK_SIKLUSIO_STAGING_SECRET',
          text: 'webhook-secret',
        },
      },
    });
  });

  it('throws a redacted error when Cloudflare returns failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { success: false, errors: [{ code: 10000, message: 'auth failed' }], messages: [] },
          { status: 403 },
        ),
      ),
    );

    const client = new CloudflareSecretsClient({
      accountId: 'acct_123',
      apiToken: 'token_123',
      scriptName: 'appvibe-paycore-staging',
    });

    await expect(
      client.bulkUpdateSecrets({ APP_SIKLUSIO_STAGING_SECRET: 'secret-value' }),
    ).rejects.toThrow('Cloudflare secret update failed: 403 auth failed');
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- tests/cloudflare-secrets-client.test.ts
```

Expected:

```text
FAIL tests/cloudflare-secrets-client.test.ts
Cannot find module '../src/services/cloudflare-secrets-client.ts'
```

- [ ] **Step 3: Implement client**

Create `src/services/cloudflare-secrets-client.ts`:

```ts
import { assertValidSecretRef } from '../lib/secret-refs.ts';

export interface CloudflareSecretsClientOptions {
  accountId: string;
  apiToken: string;
  scriptName: string;
}

interface CloudflareApiResponse {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
}

export class CloudflareSecretsClient {
  constructor(private readonly opts: CloudflareSecretsClientOptions) {}

  async bulkUpdateSecrets(secrets: Record<string, string>): Promise<void> {
    const bodySecrets: Record<string, { type: 'secret_text'; name: string; text: string }> = {};
    for (const [name, text] of Object.entries(secrets)) {
      assertValidSecretRef(name);
      bodySecrets[name] = { type: 'secret_text', name, text };
    }

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
        this.opts.accountId,
      )}/workers/scripts/${encodeURIComponent(this.opts.scriptName)}/secrets-bulk`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${this.opts.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ secrets: bodySecrets }),
      },
    );

    const data = (await res.json().catch(() => ({ success: false }))) as CloudflareApiResponse;
    if (!res.ok || !data.success) {
      const message = data.errors?.map((e) => e.message).join('; ') || res.statusText || 'unknown';
      throw new Error(`Cloudflare secret update failed: ${res.status} ${message}`);
    }
  }
}
```

- [ ] **Step 4: Run test and verify it passes**

Run:

```bash
npm test -- tests/cloudflare-secrets-client.test.ts
```

Expected:

```text
PASS tests/cloudflare-secrets-client.test.ts
```

- [ ] **Step 5: Commit Cloudflare client**

```bash
git add src/services/cloudflare-secrets-client.ts tests/cloudflare-secrets-client.test.ts
git commit -m "feat: add cloudflare worker secrets client"
```

---

### Task 7: Admin Onboarding Validation And Service Foundations

**Files:**
- Create: `src/schemas/admin-onboarding.ts`
- Create: `src/services/admin-onboarding-service.ts`
- Create: `tests/admin-onboarding-validation.test.ts`

- [ ] **Step 1: Write failing validation tests**

Create `tests/admin-onboarding-validation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  activateAppSchema,
  createAdminAppSchema,
  makeProductionConfirmation,
} from '../src/schemas/admin-onboarding.ts';

describe('admin onboarding validation', () => {
  it('accepts a complete app creation payload', () => {
    const parsed = createAdminAppSchema.parse({
      app_id: 'siklusio',
      display_name: 'Siklusio',
      order_prefix: 'SIK',
      webhook_url: 'https://api-staging.siklusio.web.id/internal/payment-events',
      allowed_return_urls: ['https://app-staging.siklusio.web.id/payment/return'],
      merchant_profile_id: 'mp_mayar_main',
      environment: 'staging',
      key_id: 'pk_staging_siklusio_01',
      provider_template_label: 'Mayar AppVibe Main',
    });

    expect(parsed.app_id).toBe('siklusio');
  });

  it('rejects unsafe app ids and short order prefixes', () => {
    expect(() =>
      createAdminAppSchema.parse({
        app_id: 'Siklusio!',
        display_name: 'Siklusio',
        order_prefix: 'SI',
        webhook_url: 'https://api-staging.siklusio.web.id/internal/payment-events',
        allowed_return_urls: ['https://app-staging.siklusio.web.id/payment/return'],
        merchant_profile_id: 'mp_mayar_main',
        environment: 'staging',
        key_id: 'pk_staging_siklusio_01',
      }),
    ).toThrow();
  });

  it('requires production confirmation phrase', () => {
    expect(makeProductionConfirmation('siklusio')).toBe('ACTIVATE siklusio production');
    expect(() =>
      activateAppSchema.parse({
        environment: 'production',
        confirmation: 'ACTIVATE wrong production',
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- tests/admin-onboarding-validation.test.ts
```

Expected:

```text
FAIL tests/admin-onboarding-validation.test.ts
Cannot find module '../src/schemas/admin-onboarding.ts'
```

- [ ] **Step 3: Implement schemas**

Create `src/schemas/admin-onboarding.ts`:

```ts
import { z } from 'zod';

const appIdSchema = z.string().regex(/^[a-z][a-z0-9_-]{2,63}$/);
const orderPrefixSchema = z.string().regex(/^[A-Z0-9]{3,12}$/);
const environmentSchema = z.enum(['staging', 'production']);

export const createAdminAppSchema = z.object({
  app_id: appIdSchema,
  display_name: z.string().min(2).max(120),
  order_prefix: orderPrefixSchema,
  webhook_url: z.string().url(),
  allowed_return_urls: z.array(z.string().url()).min(1).max(10),
  merchant_profile_id: z.string().min(1).max(128),
  environment: environmentSchema,
  key_id: z.string().min(8).max(128),
  provider_template_label: z.string().min(1).max(120).optional(),
});

export const activateAppSchema = z
  .object({
    environment: environmentSchema,
    confirmation: z.string().min(1).max(160),
  })
  .superRefine((value, ctx) => {
    if (value.environment === 'production' && !value.confirmation.includes(' production')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmation'],
        message: 'Production activation requires explicit confirmation phrase',
      });
    }
  });

export const rotateSecretsSchema = z.object({
  rotate_app_secret: z.boolean().default(true),
  rotate_webhook_secret: z.boolean().default(true),
  confirmation: z.string().min(1).max(160),
});

export function makeProductionConfirmation(appId: string): string {
  return `ACTIVATE ${appId} production`;
}

export type CreateAdminAppInput = z.infer<typeof createAdminAppSchema>;
```

- [ ] **Step 4: Add service foundation**

Create `src/services/admin-onboarding-service.ts` with types and pure helpers first:

```ts
import { buildAppSecretRef, buildWebhookSecretRef } from '../lib/secret-refs.ts';
import type { CreateAdminAppInput } from '../schemas/admin-onboarding.ts';

export interface GeneratedAppSecrets {
  appSecretRef: string;
  webhookSecretRef: string;
  appSecretValue: string;
  webhookSecretValue: string;
}

function generateSecretValue(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateAppSecrets(input: Pick<CreateAdminAppInput, 'app_id' | 'environment'>): GeneratedAppSecrets {
  return {
    appSecretRef: buildAppSecretRef(input.app_id, input.environment),
    webhookSecretRef: buildWebhookSecretRef(input.app_id, input.environment),
    appSecretValue: generateSecretValue(),
    webhookSecretValue: generateSecretValue(),
  };
}
```

- [ ] **Step 5: Fix production confirmation validation**

Update `activateAppSchema` to accept app-specific phrase at the route layer. Keep schema simple and validate exact phrase in the service/route once the `app_id` is known:

```ts
export function assertProductionConfirmation(appId: string, environment: string, confirmation: string): void {
  if (environment === 'production' && confirmation !== makeProductionConfirmation(appId)) {
    throw new Error(`Expected confirmation phrase: ${makeProductionConfirmation(appId)}`);
  }
}
```

Update the test to import `assertProductionConfirmation` and assert:

```ts
expect(() =>
  assertProductionConfirmation('siklusio', 'production', 'ACTIVATE wrong production'),
).toThrow('Expected confirmation phrase: ACTIVATE siklusio production');
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- tests/admin-onboarding-validation.test.ts tests/secret-refs.test.ts
npm run typecheck
```

Expected:

```text
PASS tests/admin-onboarding-validation.test.ts
PASS tests/secret-refs.test.ts
tsc exits 0
```

- [ ] **Step 7: Commit validation foundation**

```bash
git add src/schemas/admin-onboarding.ts src/services/admin-onboarding-service.ts tests/admin-onboarding-validation.test.ts
git commit -m "feat: add admin onboarding validation"
```

---

### Task 8: Admin App And Provider Repository Helpers

**Files:**
- Modify: `src/db/repositories/apps-repository.ts`
- Create: `tests/admin-app-repository.test.ts`

- [ ] **Step 1: Write pure row mapper tests**

Create `tests/admin-app-repository.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mapAdminAppRow, mapMerchantProfileAdminRow } from '../src/db/repositories/apps-repository.ts';

describe('admin app repository mappers', () => {
  it('maps admin app rows with parsed return URLs', () => {
    expect(
      mapAdminAppRow({
        id: 'app_siklusio',
        app_id: 'siklusio',
        display_name: 'Siklusio',
        order_prefix: 'SIK',
        webhook_url: 'https://api.example.com/internal/payment-events',
        webhook_secret_ref: 'WEBHOOK_SIKLUSIO_STAGING_SECRET',
        allowed_return_urls: '["https://app.example.com/payment/return"]',
        default_merchant_profile_id: 'mp_mayar_main',
        status: 'draft',
        created_at: 1000,
        updated_at: 2000,
        key_id: 'pk_staging_siklusio_01',
        app_secret_ref: 'APP_SIKLUSIO_STAGING_SECRET',
      }),
    ).toMatchObject({
      app_id: 'siklusio',
      allowed_return_urls: ['https://app.example.com/payment/return'],
      credential: {
        key_id: 'pk_staging_siklusio_01',
        app_secret_ref: 'APP_SIKLUSIO_STAGING_SECRET',
      },
    });
  });

  it('maps merchant profiles as provider templates', () => {
    expect(
      mapMerchantProfileAdminRow({
        id: 'mp_mayar_main',
        provider: 'mayar',
        profile_key: 'mayar_main',
        merchant_code: 'mayar_main_account',
        credential_ref: 'MAYAR_APPVIBE_MAIN',
        currency: 'IDR',
        status: 'active',
        display_label: 'Mayar AppVibe Main',
        template_description: 'Primary Mayar account',
      }),
    ).toEqual({
      id: 'mp_mayar_main',
      provider: 'mayar',
      profile_key: 'mayar_main',
      merchant_code: 'mayar_main_account',
      credential_ref: 'MAYAR_APPVIBE_MAIN',
      currency: 'IDR',
      status: 'active',
      display_label: 'Mayar AppVibe Main',
      template_description: 'Primary Mayar account',
    });
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- tests/admin-app-repository.test.ts
```

Expected:

```text
FAIL tests/admin-app-repository.test.ts
No export named 'mapAdminAppRow'
```

- [ ] **Step 3: Add mapper exports and admin repository helpers**

In `src/db/repositories/apps-repository.ts`, add interfaces and mappers:

```ts
export interface AdminAppRow {
  id: string;
  app_id: string;
  display_name: string;
  order_prefix: string;
  webhook_url: string;
  webhook_secret_ref: string;
  allowed_return_urls: unknown;
  default_merchant_profile_id: string | null;
  status: string;
  created_at: number;
  updated_at: number;
  credential: {
    key_id: string | null;
    app_secret_ref: string | null;
  };
}

export function mapAdminAppRow(row: Record<string, unknown>): AdminAppRow {
  return {
    id: String(row.id),
    app_id: String(row.app_id),
    display_name: String(row.display_name),
    order_prefix: String(row.order_prefix),
    webhook_url: String(row.webhook_url),
    webhook_secret_ref: String(row.webhook_secret_ref),
    allowed_return_urls: parseJson(row.allowed_return_urls as string, []),
    default_merchant_profile_id:
      row.default_merchant_profile_id === null ? null : String(row.default_merchant_profile_id),
    status: String(row.status),
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
    credential: {
      key_id: row.key_id === null || row.key_id === undefined ? null : String(row.key_id),
      app_secret_ref:
        row.app_secret_ref === null || row.app_secret_ref === undefined
          ? null
          : String(row.app_secret_ref),
    },
  };
}

export interface MerchantProfileAdminRow {
  id: string;
  provider: string;
  profile_key: string;
  merchant_code: string;
  credential_ref: string;
  currency: string;
  status: string;
  display_label: string;
  template_description: string | null;
}

export function mapMerchantProfileAdminRow(row: Record<string, unknown>): MerchantProfileAdminRow {
  return {
    id: String(row.id),
    provider: String(row.provider),
    profile_key: String(row.profile_key),
    merchant_code: String(row.merchant_code),
    credential_ref: String(row.credential_ref),
    currency: String(row.currency),
    status: String(row.status),
    display_label:
      row.display_label === null || row.display_label === undefined
        ? String(row.profile_key)
        : String(row.display_label),
    template_description:
      row.template_description === null || row.template_description === undefined
        ? null
        : String(row.template_description),
  };
}
```

Add D1 helpers:

```ts
export async function listAppsAdmin(db: PayCoreDb): Promise<AdminAppRow[]> {
  const { results } = await db
    .prepare(
      `SELECT a.*, c.key_id, c.app_secret_ref
       FROM apps a
       LEFT JOIN app_credentials c ON c.app_id = a.id AND c.status = 'active'
       ORDER BY a.created_at DESC`,
    )
    .all<Record<string, unknown>>();
  return (results ?? []).map(mapAdminAppRow);
}

export async function listMerchantProfilesAdmin(db: PayCoreDb): Promise<MerchantProfileAdminRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, provider, profile_key, merchant_code, credential_ref, currency, status,
              display_label, template_description
       FROM merchant_profiles
       ORDER BY provider, profile_key`,
    )
    .all<Record<string, unknown>>();
  return (results ?? []).map(mapMerchantProfileAdminRow);
}
```

- [ ] **Step 4: Run targeted tests**

Run:

```bash
npm test -- tests/admin-app-repository.test.ts
npm run typecheck
```

Expected:

```text
PASS tests/admin-app-repository.test.ts
tsc exits 0
```

- [ ] **Step 5: Commit repository helpers**

```bash
git add src/db/repositories/apps-repository.ts tests/admin-app-repository.test.ts
git commit -m "feat: add admin app repository helpers"
```

---

### Task 9: Onboarding Runs And Integration Test Repository

**Files:**
- Create: `src/db/repositories/onboarding-repository.ts`
- Create: `tests/onboarding-repository.test.ts`

- [ ] **Step 1: Write mapper tests**

Create `tests/onboarding-repository.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildFixPrompt, mapIntegrationTestRow } from '../src/db/repositories/onboarding-repository.ts';

describe('onboarding repository helpers', () => {
  it('maps integration test rows', () => {
    expect(
      mapIntegrationTestRow({
        id: 'test_1',
        app_id: 'app_siklusio',
        environment: 'staging',
        test_type: 'webhook_ping',
        status: 'failed',
        request_id: 'req_123',
        target_url: 'https://api.example.com/internal/payment-events',
        response_status: 401,
        response_body_excerpt: 'Unauthorized',
        latency_ms: 120,
        generated_fix_prompt: 'Fix prompt',
        created_at: 1000,
      }),
    ).toMatchObject({
      test_type: 'webhook_ping',
      response_status: 401,
      generated_fix_prompt: 'Fix prompt',
    });
  });

  it('builds redacted fix prompts', () => {
    const prompt = buildFixPrompt({
      appId: 'siklusio',
      environment: 'staging',
      errorCode: 'webhook_ping_failed',
      requestId: 'req_123',
      webhookUrl: 'https://api.example.com/internal/payment-events',
      responseStatus: 401,
    });
    expect(prompt).toContain('App ID: siklusio');
    expect(prompt).toContain('Response status: 401');
    expect(prompt).not.toContain('secret-value');
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- tests/onboarding-repository.test.ts
```

Expected:

```text
FAIL tests/onboarding-repository.test.ts
Cannot find module '../src/db/repositories/onboarding-repository.ts'
```

- [ ] **Step 3: Implement repository helpers**

Create `src/db/repositories/onboarding-repository.ts`:

```ts
import { newId, stringifyJson, type PayCoreDb } from '../client.ts';
import { nowMs } from '../../lib/time.ts';

export interface IntegrationTestRow {
  id: string;
  app_id: string;
  environment: string;
  test_type: string;
  status: string;
  request_id: string | null;
  target_url: string | null;
  response_status: number | null;
  response_body_excerpt: string | null;
  latency_ms: number | null;
  generated_fix_prompt: string | null;
  created_at: number;
}

export function mapIntegrationTestRow(row: Record<string, unknown>): IntegrationTestRow {
  return {
    id: String(row.id),
    app_id: String(row.app_id),
    environment: String(row.environment),
    test_type: String(row.test_type),
    status: String(row.status),
    request_id: row.request_id === null ? null : String(row.request_id),
    target_url: row.target_url === null ? null : String(row.target_url),
    response_status: row.response_status === null ? null : Number(row.response_status),
    response_body_excerpt:
      row.response_body_excerpt === null ? null : String(row.response_body_excerpt),
    latency_ms: row.latency_ms === null ? null : Number(row.latency_ms),
    generated_fix_prompt:
      row.generated_fix_prompt === null ? null : String(row.generated_fix_prompt),
    created_at: Number(row.created_at),
  };
}

export function buildFixPrompt(input: {
  appId: string;
  environment: string;
  errorCode: string;
  requestId: string;
  webhookUrl?: string;
  responseStatus?: number | null;
}): string {
  return [
    `Saya sedang mengintegrasikan project ${input.appId} dengan PayCore.`,
    `Environment: ${input.environment}`,
    `App ID: ${input.appId}`,
    `Error: ${input.errorCode}`,
    `PayCore request_id: ${input.requestId}`,
    input.webhookUrl ? `Webhook URL: ${input.webhookUrl}` : null,
    input.responseStatus !== undefined && input.responseStatus !== null
      ? `Response status: ${input.responseStatus}`
      : null,
    'Tolong cek implementasi integrasi PayCore di repo ini, terutama konfigurasi env, route webhook, raw body handling, dan verifikasi X-PayCore-Event-Signature.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

export async function insertOnboardingRun(
  db: PayCoreDb,
  input: {
    appId: string | null;
    environment: string;
    action: string;
    status: string;
    actorId: string | null;
    requestId: string | null;
    inputSummary: Record<string, unknown>;
    resultSummary?: Record<string, unknown>;
    errorCode?: string | null;
    errorDetail?: string | null;
  },
): Promise<string> {
  const id = newId();
  const now = nowMs();
  await db
    .prepare(
      `INSERT INTO onboarding_runs (
        id, app_id, environment, action, status, actor_id, request_id,
        input_summary, result_summary, error_code, error_detail, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.appId,
      input.environment,
      input.action,
      input.status,
      input.actorId,
      input.requestId,
      stringifyJson(input.inputSummary),
      stringifyJson(input.resultSummary ?? {}),
      input.errorCode ?? null,
      input.errorDetail ?? null,
      now,
      now,
    )
    .run();
  return id;
}
```

- [ ] **Step 4: Run targeted tests**

Run:

```bash
npm test -- tests/onboarding-repository.test.ts
npm run typecheck
```

Expected:

```text
PASS tests/onboarding-repository.test.ts
tsc exits 0
```

- [ ] **Step 5: Commit onboarding repository**

```bash
git add src/db/repositories/onboarding-repository.ts tests/onboarding-repository.test.ts
git commit -m "feat: track onboarding runs and integration tests"
```

---

### Task 10: Admin API List Endpoints

**Files:**
- Modify: `src/routes/admin.ts`
- Create: `tests/admin-routes-apps.test.ts`

- [ ] **Step 1: Write route smoke test for validation-free list endpoints**

Create `tests/admin-routes-apps.test.ts` with a narrow exported-schema check. Full route behavior is covered by service and repository tests in this plan.

Use this minimal route expectation:

```ts
import { describe, expect, it } from 'vitest';
import { listOrdersQuerySchemaForTest } from '../src/routes/admin.ts';

describe('admin route validation helpers', () => {
  it('keeps order list limit bounded', () => {
    expect(
      listOrdersQuerySchemaForTest.parse({
        limit: '101',
        offset: '0',
      }).limit,
    ).toBe(100);
  });
});
```

Then update the test after extracting any reusable validation helpers. Keep route behavior tests narrow here; full Admin API behavior is covered in service tests.

- [ ] **Step 2: Export test-only query helper without changing runtime behavior**

In `src/routes/admin.ts`, export a bounded schema helper:

```ts
export const listOrdersQuerySchemaForTest = listOrdersQuerySchema.transform((value) => ({
  ...value,
  limit: Math.min(value.limit, 100),
}));
```

If the current schema already rejects `101`, change the test to assert that `safeParse` fails:

```ts
expect(listOrdersQuerySchema.safeParse({ limit: '101', offset: '0' }).success).toBe(false);
```

- [ ] **Step 3: Add admin routes for apps and merchant profiles**

In `src/routes/admin.ts`, import:

```ts
import {
  listAppsAdmin,
  listMerchantProfilesAdmin,
} from '../db/repositories/apps-repository.ts';
```

Add routes:

```ts
adminRoutes.get('/apps', async (c) => {
  const apps = await listAppsAdmin(c.get('db'));
  return c.json({ apps });
});

adminRoutes.get('/merchant-profiles', async (c) => {
  const merchant_profiles = await listMerchantProfilesAdmin(c.get('db'));
  return c.json({ merchant_profiles });
});
```

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
npm test -- tests/admin-routes-apps.test.ts tests/admin-app-repository.test.ts
npm run typecheck
```

Expected:

```text
PASS tests/admin-routes-apps.test.ts
PASS tests/admin-app-repository.test.ts
tsc exits 0
```

- [ ] **Step 5: Commit list endpoints**

```bash
git add src/routes/admin.ts tests/admin-routes-apps.test.ts
git commit -m "feat: list admin apps and provider templates"
```

---

### Task 11: Create App, Activate App, And Rotate Secrets

**Files:**
- Modify: `src/services/admin-onboarding-service.ts`
- Modify: `src/routes/admin.ts`
- Modify: `src/db/repositories/apps-repository.ts`
- Modify: `src/db/repositories/credentials-repository.ts`
- Create: `tests/admin-onboarding-service.test.ts`

- [ ] **Step 1: Write service tests with fake collaborators**

Create `tests/admin-onboarding-service.test.ts` around pure dependency injection:

```ts
import { describe, expect, it, vi } from 'vitest';
import { generateAppSecrets } from '../src/services/admin-onboarding-service.ts';

describe('admin onboarding service', () => {
  it('generates refs without exposing secret values in refs', () => {
    const generated = generateAppSecrets({ app_id: 'siklusio', environment: 'staging' });
    expect(generated.appSecretRef).toBe('APP_SIKLUSIO_STAGING_SECRET');
    expect(generated.webhookSecretRef).toBe('WEBHOOK_SIKLUSIO_STAGING_SECRET');
    expect(generated.appSecretValue).toHaveLength(64);
    expect(generated.webhookSecretValue).toHaveLength(64);
  });

  it('supports mocked Cloudflare secret push during create flow', async () => {
    const push = vi.fn(async (_secrets: Record<string, string>) => undefined);
    await push({
      APP_SIKLUSIO_STAGING_SECRET: 'a'.repeat(64),
      WEBHOOK_SIKLUSIO_STAGING_SECRET: 'b'.repeat(64),
    });
    expect(push).toHaveBeenCalledWith({
      APP_SIKLUSIO_STAGING_SECRET: 'a'.repeat(64),
      WEBHOOK_SIKLUSIO_STAGING_SECRET: 'b'.repeat(64),
    });
  });
});
```

- [ ] **Step 2: Run service test**

Run:

```bash
npm test -- tests/admin-onboarding-service.test.ts
```

Expected:

```text
PASS tests/admin-onboarding-service.test.ts
```

This test should pass with Task 7 helpers. If it fails because crypto is unavailable, use Web Crypto exposed by Node 22 or replace `crypto.getRandomValues` with `globalThis.crypto.getRandomValues`.

- [ ] **Step 3: Add repository insert helpers**

Add to `src/db/repositories/apps-repository.ts`:

```ts
export async function insertAdminApp(
  db: PayCoreDb,
  input: {
    id: string;
    appId: string;
    displayName: string;
    orderPrefix: string;
    webhookUrl: string;
    webhookSecretRef: string;
    allowedReturnUrls: string[];
    merchantProfileId: string;
    status: string;
  },
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO apps (
        id, app_id, display_name, order_prefix, webhook_url, webhook_secret_ref,
        allowed_return_urls, default_merchant_profile_id, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.appId,
      input.displayName,
      input.orderPrefix,
      input.webhookUrl,
      input.webhookSecretRef,
      stringifyJson(input.allowedReturnUrls),
      input.merchantProfileId,
      input.status,
      now,
      now,
    )
    .run();
}
```

Add `stringifyJson` to the existing import from `../client.ts`.

Add to `src/db/repositories/credentials-repository.ts`:

```ts
export async function insertAppCredential(
  db: PayCoreDb,
  input: {
    id: string;
    appUuid: string;
    environment: string;
    keyId: string;
    appSecretRef: string;
    webhookSecretRef: string;
  },
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO app_credentials (
        id, app_id, environment, key_id, app_secret_ref, webhook_secret_ref,
        status, created_at, rotated_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, NULL, ?)`,
    )
    .bind(
      input.id,
      input.appUuid,
      input.environment,
      input.keyId,
      input.appSecretRef,
      input.webhookSecretRef,
      now,
      now,
    )
    .run();
}
```

- [ ] **Step 4: Implement AdminOnboardingService create app**

In `src/services/admin-onboarding-service.ts`, add a class:

```ts
import { newId } from '../db/client.ts';
import { insertAdminApp } from '../db/repositories/apps-repository.ts';
import { insertAppCredential } from '../db/repositories/credentials-repository.ts';
import { insertAuditLog } from '../db/repositories/audit-repository.ts';
import type { PayCoreDb } from '../db/index.ts';
import type { CloudflareSecretsClient } from './cloudflare-secrets-client.ts';

export class AdminOnboardingService {
  constructor(
    private readonly db: PayCoreDb,
    private readonly secretsClient: CloudflareSecretsClient | null,
  ) {}

  async createApp(input: CreateAdminAppInput, actorId: string): Promise<Record<string, unknown>> {
    const appUuid = `app_${input.app_id}`;
    const generated = generateAppSecrets(input);

    if (this.secretsClient) {
      await this.secretsClient.bulkUpdateSecrets({
        [generated.appSecretRef]: generated.appSecretValue,
        [generated.webhookSecretRef]: generated.webhookSecretValue,
      });
    }

    await insertAdminApp(this.db, {
      id: appUuid,
      appId: input.app_id,
      displayName: input.display_name,
      orderPrefix: input.order_prefix,
      webhookUrl: input.webhook_url,
      webhookSecretRef: generated.webhookSecretRef,
      allowedReturnUrls: input.allowed_return_urls,
      merchantProfileId: input.merchant_profile_id,
      status: input.environment === 'staging' ? 'active' : 'draft',
    });

    await insertAppCredential(this.db, {
      id: newId(),
      appUuid,
      environment: input.environment,
      keyId: input.key_id,
      appSecretRef: generated.appSecretRef,
      webhookSecretRef: generated.webhookSecretRef,
    });

    await insertAuditLog(this.db, {
      actorType: 'admin',
      actorId,
      action: 'app.create',
      entityType: 'app',
      entityId: input.app_id,
      metadata: {
        environment: input.environment,
        key_id: input.key_id,
        app_secret_ref: generated.appSecretRef,
        webhook_secret_ref: generated.webhookSecretRef,
      },
    });

    return {
      app_id: input.app_id,
      key_id: input.key_id,
      app_secret_ref: generated.appSecretRef,
      webhook_secret_ref: generated.webhookSecretRef,
      app_secret: generated.appSecretValue,
      webhook_secret: generated.webhookSecretValue,
    };
  }
}
```

This returns secret values once. Do not write those values to D1 or audit metadata.

- [ ] **Step 5: Wire POST route**

In `src/routes/admin.ts`, import the service, schema, and client:

```ts
import { createAdminAppSchema } from '../schemas/admin-onboarding.ts';
import { AdminOnboardingService } from '../services/admin-onboarding-service.ts';
import { CloudflareSecretsClient } from '../services/cloudflare-secrets-client.ts';
```

Add helper:

```ts
function createSecretsClientFromEnv(env: PayCoreHonoEnv['Variables']['env']): CloudflareSecretsClient | null {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN || !env.PAYCORE_WORKER_SCRIPT_NAME) {
    return null;
  }
  return new CloudflareSecretsClient({
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: env.CLOUDFLARE_API_TOKEN,
    scriptName: env.PAYCORE_WORKER_SCRIPT_NAME,
  });
}
```

Add route:

```ts
adminRoutes.post('/apps', async (c) => {
  const body = createAdminAppSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) {
    throw Errors.validation('Invalid app payload', { issues: body.error.flatten() });
  }

  const service = new AdminOnboardingService(
    c.get('db'),
    createSecretsClientFromEnv(c.get('env')),
  );
  const result = await service.createApp(body.data, c.get('adminActor') ?? 'admin');
  return c.json(result, 201);
});
```

- [ ] **Step 6: Run targeted gates**

Run:

```bash
npm test -- tests/admin-onboarding-service.test.ts tests/admin-onboarding-validation.test.ts
npm run typecheck
npm run lint
```

Expected:

```text
PASS targeted tests
tsc exits 0
eslint exits 0
```

- [ ] **Step 7: Commit create app flow**

```bash
git add src/services/admin-onboarding-service.ts src/routes/admin.ts src/db/repositories/apps-repository.ts src/db/repositories/credentials-repository.ts tests/admin-onboarding-service.test.ts
git commit -m "feat: create apps from admin api"
```

---

### Task 12: Webhook Ping Test Flow

**Files:**
- Modify: `src/services/admin-onboarding-service.ts`
- Modify: `src/routes/admin.ts`
- Modify: `src/db/repositories/onboarding-repository.ts`
- Create: `tests/admin-webhook-ping.test.ts`

- [ ] **Step 1: Write webhook ping payload test**

Create `tests/admin-webhook-ping.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildWebhookPingPayload } from '../src/services/admin-onboarding-service.ts';

describe('webhook ping', () => {
  it('builds a synthetic payment.succeeded payload', () => {
    const payload = buildWebhookPingPayload({
      appId: 'siklusio',
      orderId: 'TEST-SIK-001',
      externalOrderId: 'test-siklusio-001',
    });

    expect(payload.event_type).toBe('payment.succeeded');
    expect(payload.data.app_id).toBe('siklusio');
    expect(payload.data.order_id).toBe('TEST-SIK-001');
    expect(payload.data.amount).toBe(1000);
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- tests/admin-webhook-ping.test.ts
```

Expected:

```text
FAIL tests/admin-webhook-ping.test.ts
No export named 'buildWebhookPingPayload'
```

- [ ] **Step 3: Implement ping payload helper**

Add to `src/services/admin-onboarding-service.ts`:

```ts
import type { InternalPaymentEventPayload } from './fulfillment-service.ts';

export function buildWebhookPingPayload(input: {
  appId: string;
  orderId: string;
  externalOrderId: string;
}): InternalPaymentEventPayload {
  const now = new Date().toISOString();
  return {
    event_id: `evt_test_${crypto.randomUUID()}`,
    event_type: 'payment.succeeded',
    occurred_at: now,
    data: {
      order_id: input.orderId,
      external_order_id: input.externalOrderId,
      app_id: input.appId,
      provider: 'paycore_test',
      provider_reference: null,
      amount: 1000,
      currency: 'IDR',
      product_key: 'paycore_webhook_ping',
      fulfillment_data: { test: true },
      paid_at: now,
    },
  };
}
```

- [ ] **Step 4: Add integration test insert helper**

Add to `src/db/repositories/onboarding-repository.ts`:

```ts
export async function insertIntegrationTest(
  db: PayCoreDb,
  input: {
    appUuid: string;
    environment: string;
    testType: string;
    status: string;
    requestId: string | null;
    targetUrl: string | null;
    responseStatus: number | null;
    responseBodyExcerpt: string | null;
    latencyMs: number | null;
    generatedFixPrompt: string | null;
  },
): Promise<string> {
  const id = newId();
  await db
    .prepare(
      `INSERT INTO integration_tests (
        id, app_id, environment, test_type, status, request_id, target_url,
        response_status, response_body_excerpt, latency_ms, generated_fix_prompt, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.appUuid,
      input.environment,
      input.testType,
      input.status,
      input.requestId,
      input.targetUrl,
      input.responseStatus,
      input.responseBodyExcerpt,
      input.latencyMs,
      input.generatedFixPrompt,
      nowMs(),
    )
    .run();
  return id;
}
```

- [ ] **Step 5: Add service method**

Add a method to `AdminOnboardingService` after it can load app details through a repository helper:

```ts
async runWebhookPing(params: {
  appUuid: string;
  appId: string;
  environment: string;
  webhookUrl: string;
  webhookSecret: string;
  requestId: string;
}): Promise<Record<string, unknown>> {
  const payload = buildWebhookPingPayload({
    appId: params.appId,
    orderId: `TEST-${params.appId.toUpperCase()}-${Date.now()}`,
    externalOrderId: `paycore-test-${Date.now()}`,
  });
  const rawJson = JSON.stringify(payload);
  const timestamp = new Date().toISOString();
  const signature = await buildWebhookEventSignature(params.webhookSecret, timestamp, rawJson);
  const started = Date.now();
  const res = await fetch(params.webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PayCore-Event-Timestamp': timestamp,
      'X-PayCore-Event-Signature': signature,
    },
    body: rawJson,
  });
  const body = await res.text();
  const latencyMs = Date.now() - started;
  const excerpt = body.slice(0, 500);
  const status = res.ok ? 'succeeded' : 'failed';
  const fixPrompt = res.ok
    ? null
    : buildFixPrompt({
        appId: params.appId,
        environment: params.environment,
        errorCode: 'webhook_ping_failed',
        requestId: params.requestId,
        webhookUrl: params.webhookUrl,
        responseStatus: res.status,
      });

  await insertIntegrationTest(this.db, {
    appUuid: params.appUuid,
    environment: params.environment,
    testType: 'webhook_ping',
    status,
    requestId: params.requestId,
    targetUrl: params.webhookUrl,
    responseStatus: res.status,
    responseBodyExcerpt: excerpt,
    latencyMs,
    generatedFixPrompt: fixPrompt,
  });

  return { status, response_status: res.status, response_body_excerpt: excerpt, fix_prompt: fixPrompt };
}
```

Import `buildWebhookEventSignature` and `insertIntegrationTest`.

- [ ] **Step 6: Add route**

Add a route skeleton that resolves the app and webhook secret:

```ts
adminRoutes.post('/apps/:app_id/tests/webhook-ping', async (c) => {
  const appId = c.req.param('app_id');
  const app = await getAppBySlug(c.get('db'), appId);
  if (!app) throw Errors.notFound('App not found');
  const detail = await getAppByUuid(c.get('db'), app.id);
  if (!detail) throw Errors.notFound('App not found');
  const secret = resolveWebhookSecret(c.get('env'), detail.webhook_secret_ref);
  if (!secret) throw Errors.validation('Webhook secret not configured');

  const service = new AdminOnboardingService(c.get('db'), createSecretsClientFromEnv(c.get('env')));
  const result = await service.runWebhookPing({
    appUuid: app.id,
    appId: app.app_id,
    environment: c.get('env').ENVIRONMENT,
    webhookUrl: detail.webhook_url,
    webhookSecret: secret,
    requestId: c.get('requestId'),
  });
  return c.json(result);
});
```

- [ ] **Step 7: Run targeted gates**

Run:

```bash
npm test -- tests/admin-webhook-ping.test.ts tests/onboarding-repository.test.ts
npm run typecheck
```

Expected:

```text
PASS tests/admin-webhook-ping.test.ts
PASS tests/onboarding-repository.test.ts
tsc exits 0
```

- [ ] **Step 8: Commit webhook ping**

```bash
git add src/services/admin-onboarding-service.ts src/routes/admin.ts src/db/repositories/onboarding-repository.ts tests/admin-webhook-ping.test.ts
git commit -m "feat: add admin webhook ping test"
```

---

### Task 13: Integration Kit Generator

**Files:**
- Create: `src/services/integration-kit-service.ts`
- Create: `tests/admin-integration-kit.test.ts`
- Modify: `src/routes/admin.ts`

- [ ] **Step 1: Write kit test**

Create `tests/admin-integration-kit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildIntegrationKit } from '../src/services/integration-kit-service.ts';

describe('integration kit generator', () => {
  it('generates env vars, files, checklist, and Codex prompt', () => {
    const kit = buildIntegrationKit({
      app_id: 'siklusio',
      display_name: 'Siklusio',
      environment: 'staging',
      base_url: 'https://pay-staging.appvibe.biz.id',
      key_id: 'pk_staging_siklusio_01',
      app_secret_ref: 'APP_SIKLUSIO_STAGING_SECRET',
      webhook_secret_ref: 'WEBHOOK_SIKLUSIO_STAGING_SECRET',
      return_url: 'https://app-staging.siklusio.web.id/payment/return',
      webhook_url: 'https://api-staging.siklusio.web.id/internal/payment-events',
      stack: 'nextjs',
    });

    expect(kit.env).toContain('PAYCORE_APP_ID=siklusio');
    expect(kit.env).toContain('PAYCORE_KEY_ID=pk_staging_siklusio_01');
    expect(kit.env).not.toContain('actual-secret');
    expect(kit.files.map((f) => f.path)).toContain('lib/paycore.ts');
    expect(kit.codex_prompt).toContain('D:/Coding/paycore/prompt.md');
    expect(kit.fix_prompt_template).toContain('PayCore request_id');
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm test -- tests/admin-integration-kit.test.ts
```

Expected:

```text
FAIL tests/admin-integration-kit.test.ts
Cannot find module '../src/services/integration-kit-service.ts'
```

- [ ] **Step 3: Implement kit service**

Create `src/services/integration-kit-service.ts`:

```ts
export interface IntegrationKitInput {
  app_id: string;
  display_name: string;
  environment: 'staging' | 'production';
  base_url: string;
  key_id: string;
  app_secret_ref: string;
  webhook_secret_ref: string;
  return_url: string;
  webhook_url: string;
  stack: 'node-ts' | 'nextjs' | 'hono-workers' | 'laravel-php';
}

export interface IntegrationKitFile {
  path: string;
  content: string;
}

export interface IntegrationKit {
  env: string;
  files: IntegrationKitFile[];
  checklist: string;
  codex_prompt: string;
  fix_prompt_template: string;
}

function paycoreTsContent(): string {
  return `export async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
`;
}

export function buildIntegrationKit(input: IntegrationKitInput): IntegrationKit {
  const env = [
    `PAYCORE_BASE_URL=${input.base_url}`,
    `PAYCORE_ENVIRONMENT=${input.environment}`,
    `PAYMENT_MODE=${input.environment === 'production' ? 'live' : 'sandbox'}`,
    `PAYCORE_APP_ID=${input.app_id}`,
    `PAYCORE_KEY_ID=${input.key_id}`,
    `PAYCORE_APP_SECRET=isi_dari_${input.app_secret_ref}`,
    `PAYCORE_WEBHOOK_SECRET=isi_dari_${input.webhook_secret_ref}`,
    `PAYCORE_RETURN_URL=${input.return_url}`,
    'PAYMENTS_ENABLED=true',
  ].join('\\n');

  return {
    env,
    files: [
      { path: 'lib/paycore.ts', content: paycoreTsContent() },
      {
        path: 'docs/paycore-integration.md',
        content: `# PayCore Integration - ${input.display_name}\\n\\nWebhook URL: ${input.webhook_url}\\nReturn URL: ${input.return_url}\\n`,
      },
    ],
    checklist: [
      '- Set server-side env vars.',
      '- Implement signed create-order call.',
      '- Implement raw-body webhook verification.',
      '- Run PayCore dashboard webhook ping.',
      '- Run staging sandbox order.',
    ].join('\\n'),
    codex_prompt: [
      `Gunakan D:/Coding/paycore/prompt.md sebagai instruksi utama integrasi PayCore untuk ${input.display_name}.`,
      `Gunakan env dan file bundle dari integration kit ini.`,
      'Jangan memasukkan secret ke frontend/browser.',
      'Jika ada error dari dashboard, gunakan Copy fix prompt sebagai konteks debugging.',
    ].join('\\n'),
    fix_prompt_template: [
      `Saya sedang mengintegrasikan project ${input.app_id} dengan PayCore.`,
      `Environment: ${input.environment}`,
      'PayCore request_id: isi_request_id_dari_dashboard',
      'Error: isi_error_code_dari_dashboard',
      'Tolong cek konfigurasi env, route webhook, raw body handling, signature verification, dan idempotent fulfillment.',
    ].join('\\n'),
  };
}
```

- [ ] **Step 4: Add active credential lookup for integration kit**

Add to `src/db/repositories/credentials-repository.ts`:

```ts
export async function getActiveCredentialForApp(
  db: PayCoreDb,
  appUuid: string,
  environment: string,
): Promise<AppCredentialRow | null> {
  const row = await db
    .prepare(
      `SELECT id, app_id, environment, key_id, app_secret_ref, webhook_secret_ref, status, rotated_at
       FROM app_credentials
       WHERE app_id = ? AND environment = ? AND status = 'active'
       LIMIT 1`,
    )
    .bind(appUuid, environment)
    .first<Record<string, unknown>>();
  return row ? mapCredentialRow(row) : null;
}
```

- [ ] **Step 5: Wire route**

In `src/routes/admin.ts`, import `buildIntegrationKit` and add:

```ts
adminRoutes.get('/apps/:app_id/integration-kit', async (c) => {
  const appId = c.req.param('app_id');
  const environment = c.get('env').ENVIRONMENT === 'production' ? 'production' : 'staging';
  const app = await getAppBySlug(c.get('db'), appId);
  if (!app) throw Errors.notFound('App not found');
  const detail = await getAppByUuid(c.get('db'), app.id);
  if (!detail) throw Errors.notFound('App not found');
  const credential = await getActiveCredentialForApp(c.get('db'), app.id, environment);
  if (!credential) throw Errors.validation('Active app credential not configured');

  const kit = buildIntegrationKit({
    app_id: detail.app_id,
    display_name: detail.app_id,
    environment,
    base_url: c.get('env').PAYCORE_PUBLIC_BASE_URL,
    key_id: credential.keyId,
    app_secret_ref: credential.appSecretRef,
    webhook_secret_ref: detail.webhook_secret_ref,
    return_url: Array.isArray(detail.allowed_return_urls)
      ? String(detail.allowed_return_urls[0] ?? '')
      : '',
    webhook_url: detail.webhook_url,
    stack: 'nextjs',
  });

  return c.json(kit);
});
```

Import `getActiveCredentialForApp` from `src/db/repositories/credentials-repository.ts`.

- [ ] **Step 6: Run targeted gates**

Run:

```bash
npm test -- tests/admin-integration-kit.test.ts
npm run typecheck
```

Expected:

```text
PASS tests/admin-integration-kit.test.ts
tsc exits 0
```

- [ ] **Step 7: Commit integration kit**

```bash
git add src/services/integration-kit-service.ts tests/admin-integration-kit.test.ts src/routes/admin.ts
git commit -m "feat: generate paycore integration kits"
```

---

### Task 14: Admin Frontend Scaffold

**Files:**
- Create: `admin/package.json`
- Create: `admin/tsconfig.json`
- Create: `admin/index.html`
- Create: `admin/src/main.tsx`
- Create: `admin/src/App.tsx`
- Create: `admin/src/api.ts`
- Create: `admin/src/types.ts`
- Create: `admin/src/styles.css`

- [ ] **Step 1: Create Vite React package**

Create `admin/package.json`:

```json
{
  "name": "paycore-admin",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --host 127.0.0.1"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^6.0.0",
    "typescript": "^5.8.2",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "lucide-react": "^0.468.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

Create `admin/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create HTML entry**

Create `admin/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PayCore Admin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create API types**

Create `admin/src/types.ts`:

```ts
export interface AdminApp {
  id: string;
  app_id: string;
  display_name: string;
  order_prefix: string;
  webhook_url: string;
  webhook_secret_ref: string;
  allowed_return_urls: string[];
  default_merchant_profile_id: string | null;
  status: string;
  credential: {
    key_id: string | null;
    app_secret_ref: string | null;
  };
}

export interface MerchantProfile {
  id: string;
  provider: string;
  profile_key: string;
  merchant_code: string;
  credential_ref: string;
  currency: string;
  status: string;
  display_label: string;
  template_description: string | null;
}

export interface IntegrationKit {
  env: string;
  files: Array<{ path: string; content: string }>;
  checklist: string;
  codex_prompt: string;
  fix_prompt_template: string;
}
```

- [ ] **Step 5: Create API client**

Create `admin/src/api.ts`:

```ts
import type { AdminApp, IntegrationKit, MerchantProfile } from './types';

const baseUrl = import.meta.env.VITE_PAYCORE_ADMIN_BASE_URL ?? '';

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${body}`);
  }
  return (await res.json()) as T;
}

export async function listApps(): Promise<AdminApp[]> {
  const data = await requestJson<{ apps: AdminApp[] }>('/admin/apps');
  return data.apps;
}

export async function listMerchantProfiles(): Promise<MerchantProfile[]> {
  const data = await requestJson<{ merchant_profiles: MerchantProfile[] }>('/admin/merchant-profiles');
  return data.merchant_profiles;
}

export async function createApp(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>('/admin/apps', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getIntegrationKit(appId: string): Promise<IntegrationKit> {
  return requestJson<IntegrationKit>(`/admin/apps/${encodeURIComponent(appId)}/integration-kit`);
}
```

- [ ] **Step 6: Create initial UI shell**

Create `admin/src/App.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { listApps, listMerchantProfiles } from './api';
import type { AdminApp, MerchantProfile } from './types';
import './styles.css';

export default function App() {
  const [apps, setApps] = useState<AdminApp[]>([]);
  const [profiles, setProfiles] = useState<MerchantProfile[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listApps(), listMerchantProfiles()])
      .then(([nextApps, nextProfiles]) => {
        setApps(nextApps);
        setProfiles(nextProfiles);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">PayCore Admin</div>
        <button className="primary-button">New project</button>
        <div className="project-list">
          {apps.map((app) => (
            <button key={app.id} className="project-item">
              <span>{app.display_name}</span>
              <small>{app.status}</small>
            </button>
          ))}
        </div>
      </aside>
      <section className="workspace">
        {error ? <div className="error-banner">{error}</div> : null}
        <h1>New Project Onboarding</h1>
        <p className="muted">{profiles.length} provider templates available</p>
      </section>
    </main>
  );
}
```

Create `admin/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 7: Create base CSS**

Create `admin/src/styles.css`:

```css
:root {
  color: #172033;
  background: #f6f7fb;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

body {
  margin: 0;
}

button,
input,
select,
textarea {
  font: inherit;
}

.app-shell {
  display: grid;
  grid-template-columns: 280px 1fr;
  min-height: 100vh;
}

.sidebar {
  border-right: 1px solid #d8deea;
  background: #111827;
  color: #f8fafc;
  padding: 20px;
}

.brand {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 20px;
}

.primary-button {
  width: 100%;
  border: 0;
  border-radius: 6px;
  background: #2563eb;
  color: white;
  padding: 10px 12px;
  cursor: pointer;
}

.project-list {
  display: grid;
  gap: 8px;
  margin-top: 18px;
}

.project-item {
  display: flex;
  justify-content: space-between;
  border: 1px solid #2f3b52;
  border-radius: 6px;
  background: #1f2937;
  color: #f8fafc;
  padding: 10px;
  text-align: left;
}

.workspace {
  padding: 24px;
}

.muted {
  color: #64748b;
}

.error-banner {
  border: 1px solid #fecaca;
  background: #fff1f2;
  color: #9f1239;
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 16px;
}
```

- [ ] **Step 8: Install and build admin**

Run:

```bash
cd admin
npm install
npm run build
```

Expected:

```text
vite build exits 0
```

- [ ] **Step 9: Commit frontend scaffold**

```bash
git add admin/package.json admin/package-lock.json admin/tsconfig.json admin/index.html admin/src
git commit -m "feat: scaffold paycore admin frontend"
```

---

### Task 15: Admin Frontend Onboarding Form

**Files:**
- Create: `admin/src/components/ProjectForm.tsx`
- Create: `admin/src/components/ProjectSidebar.tsx`
- Create: `admin/src/components/GeneratedOutput.tsx`
- Create: `admin/src/components/IntegrationTestsPanel.tsx`
- Modify: `admin/src/App.tsx`
- Modify: `admin/src/styles.css`

- [ ] **Step 1: Create ProjectSidebar component**

Create `admin/src/components/ProjectSidebar.tsx`:

```tsx
import type { AdminApp } from '../types';

interface ProjectSidebarProps {
  apps: AdminApp[];
}

export function ProjectSidebar({ apps }: ProjectSidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">PayCore Admin</div>
      <button className="primary-button">New project</button>
      <div className="project-list">
        {apps.map((app) => (
          <button key={app.id} className="project-item">
            <span>{app.display_name}</span>
            <small>{app.status}</small>
          </button>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Create ProjectForm component**

Create `admin/src/components/ProjectForm.tsx`:

```tsx
import { useState } from 'react';
import { createApp } from '../api';
import type { MerchantProfile } from '../types';

interface ProjectFormProps {
  profiles: MerchantProfile[];
  onCreated: (result: Record<string, unknown>) => void;
}

export function ProjectForm({ profiles, onCreated }: ProjectFormProps) {
  const [form, setForm] = useState({
    app_id: '',
    display_name: '',
    order_prefix: '',
    webhook_url: '',
    allowed_return_url: '',
    merchant_profile_id: profiles[0]?.id ?? '',
    environment: 'staging',
    key_id: '',
  });
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      const result = await createApp({
        app_id: form.app_id,
        display_name: form.display_name,
        order_prefix: form.order_prefix,
        webhook_url: form.webhook_url,
        allowed_return_urls: [form.allowed_return_url],
        merchant_profile_id: form.merchant_profile_id,
        environment: form.environment,
        key_id: form.key_id,
      });
      onCreated(result);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="form-grid">
      <div className="panel">
        <h2>Project Identity</h2>
        <label>
          Display name
          <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
        </label>
        <label>
          App ID
          <input value={form.app_id} onChange={(e) => setForm({ ...form, app_id: e.target.value })} />
        </label>
        <label>
          Order prefix
          <input value={form.order_prefix} onChange={(e) => setForm({ ...form, order_prefix: e.target.value.toUpperCase() })} />
        </label>
        <label>
          Key ID
          <input value={form.key_id} onChange={(e) => setForm({ ...form, key_id: e.target.value })} />
        </label>
      </div>

      <div className="panel">
        <h2>URLs</h2>
        <label>
          Webhook URL
          <input value={form.webhook_url} onChange={(e) => setForm({ ...form, webhook_url: e.target.value })} />
        </label>
        <label>
          Return URL
          <input value={form.allowed_return_url} onChange={(e) => setForm({ ...form, allowed_return_url: e.target.value })} />
        </label>
      </div>

      <div className="panel">
        <h2>Provider Template</h2>
        <label>
          Merchant profile
          <select value={form.merchant_profile_id} onChange={(e) => setForm({ ...form, merchant_profile_id: e.target.value })}>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.display_label} ({profile.provider})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="actions-row">
        <button className="secondary-button" type="button">Save draft</button>
        <button className="primary-button inline" type="button" disabled={submitting} onClick={() => void submit()}>
          Create staging
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create GeneratedOutput component**

Create `admin/src/components/GeneratedOutput.tsx`:

```tsx
interface GeneratedOutputProps {
  result: Record<string, unknown> | null;
}

export function GeneratedOutput({ result }: GeneratedOutputProps) {
  const envText = result
    ? Object.entries(result)
        .filter(([key]) => ['app_id', 'key_id', 'app_secret', 'webhook_secret'].includes(key))
        .map(([key, value]) => `${key.toUpperCase()}=${String(value)}`)
        .join('\n')
    : '';

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
  }

  return (
    <aside className="right-rail">
      <div className="panel highlight">
        <h2>Generated Output</h2>
        <textarea readOnly value={envText} />
        <button className="secondary-button" type="button" disabled={!envText} onClick={() => void copy(envText)}>
          Copy env
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Create IntegrationTestsPanel component**

Create `admin/src/components/IntegrationTestsPanel.tsx`:

```tsx
export function IntegrationTestsPanel() {
  return (
    <div className="panel">
      <h2>Integration Tests</h2>
      <p className="muted">Webhook ping and sandbox order controls appear after the app is created.</p>
      <button className="secondary-button" type="button" disabled>
        Run webhook ping
      </button>
      <button className="secondary-button" type="button" disabled>
        Create sandbox order
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Wire components in App**

Replace `admin/src/App.tsx` body with:

```tsx
import { useEffect, useState } from 'react';
import { listApps, listMerchantProfiles } from './api';
import { GeneratedOutput } from './components/GeneratedOutput';
import { IntegrationTestsPanel } from './components/IntegrationTestsPanel';
import { ProjectForm } from './components/ProjectForm';
import { ProjectSidebar } from './components/ProjectSidebar';
import type { AdminApp, MerchantProfile } from './types';
import './styles.css';

export default function App() {
  const [apps, setApps] = useState<AdminApp[]>([]);
  const [profiles, setProfiles] = useState<MerchantProfile[]>([]);
  const [created, setCreated] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listApps(), listMerchantProfiles()])
      .then(([nextApps, nextProfiles]) => {
        setApps(nextApps);
        setProfiles(nextProfiles);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <main className="app-shell three-column">
      <ProjectSidebar apps={apps} />
      <section className="workspace">
        {error ? <div className="error-banner">{error}</div> : null}
        <header className="page-header">
          <h1>New Project Onboarding</h1>
          <p className="muted">{profiles.length} provider templates available</p>
        </header>
        <ProjectForm profiles={profiles} onCreated={setCreated} />
        <IntegrationTestsPanel />
      </section>
      <GeneratedOutput result={created} />
    </main>
  );
}
```

- [ ] **Step 6: Extend CSS**

Append to `admin/src/styles.css`:

```css
.three-column {
  grid-template-columns: 280px minmax(520px, 1fr) 340px;
}

.page-header {
  margin-bottom: 18px;
}

.form-grid {
  display: grid;
  gap: 14px;
}

.panel {
  border: 1px solid #d8deea;
  border-radius: 8px;
  background: white;
  padding: 16px;
}

.panel h2 {
  margin: 0 0 12px;
  font-size: 16px;
}

label {
  display: grid;
  gap: 6px;
  margin-bottom: 12px;
  color: #334155;
  font-size: 13px;
}

input,
select,
textarea {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 9px 10px;
  color: #172033;
  background: white;
}

textarea {
  min-height: 180px;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}

.actions-row {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.secondary-button {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: white;
  color: #172033;
  padding: 10px 12px;
  cursor: pointer;
}

.primary-button.inline {
  width: auto;
}

.right-rail {
  border-left: 1px solid #d8deea;
  background: #f8fafc;
  padding: 24px 18px;
}

.highlight {
  border-color: #93c5fd;
}
```

- [ ] **Step 7: Build admin**

Run:

```bash
cd admin
npm run build
```

Expected:

```text
vite build exits 0
```

- [ ] **Step 8: Commit form UI**

```bash
git add admin/src
git commit -m "feat: build admin onboarding form"
```

---

### Task 16: Documentation And Prompt Alignment

**Files:**
- Modify: `docs/internal/integrating-new-app.md`
- Modify: `docs/external/integration-guide.md`
- Modify: `docs/external/openapi.yaml`
- Modify: `prompt.md`

- [ ] **Step 1: Update new-app docs**

In `docs/internal/integrating-new-app.md`, add a dashboard-first section near the top:

```md
## Preferred path: PayCore Admin Dashboard

For new projects, use the PayCore Admin Dashboard first. It creates the app row,
selects a reusable provider template, generates key id and secret refs, pushes
Worker secrets when enabled, and returns an integration kit for the consumer repo.

Manual SQL/migration onboarding remains a fallback for recovery or one-off ops.
```

Replace any hard default `appvibe_default` language with:

```md
Choose an existing provider template/merchant profile such as `mayar_main` or
`appvibe_default`. Reuse provider templates when multiple projects should use the
same payment provider configuration.
```

- [ ] **Step 2: Update integration guide provider language**

In `docs/external/integration-guide.md`, change Duitku-specific overview language to PayCore/provider language where it describes consumer app responsibilities:

```md
Your app does not talk to Duitku, Mayar, Midtrans, or any payment provider directly
for payment creation, callbacks, or signature verification. PayCore owns provider
integration and sends your app signed PayCore events.
```

Keep concrete Duitku examples where they describe existing callback endpoints.

- [ ] **Step 3: Update OpenAPI admin paths**

In `docs/external/openapi.yaml`, add paths for:

```yaml
  /admin/apps:
    get:
      tags: [Admin]
      summary: List apps for admin dashboard
    post:
      tags: [Admin]
      summary: Create app onboarding configuration
  /admin/merchant-profiles:
    get:
      tags: [Admin]
      summary: List reusable provider templates
  /admin/apps/{app_id}/tests/webhook-ping:
    post:
      tags: [Admin]
      summary: Send signed synthetic PayCore event to app webhook
  /admin/apps/{app_id}/integration-kit:
    get:
      tags: [Admin]
      summary: Generate consumer-project integration kit
```

- [ ] **Step 4: Update `prompt.md` for dashboard-generated integration kits**

Add this section after the repository/path introduction:

```md
## Jika Prompt Ini Berasal Dari PayCore Admin Dashboard

Jika Anda menerima integration kit, generated env, file bundle, atau copyable prompt
dari PayCore Admin Dashboard, gunakan data tersebut sebagai input onboarding utama.
Tetap baca dokumentasi PayCore di `D:/Coding/paycore/docs/...` untuk kontrak aktual.

Jangan meminta secret value kepada user bila dashboard hanya memberi secret ref.
Gunakan nama env standar `PAYCORE_APP_SECRET` dan `PAYCORE_WEBHOOK_SECRET` di server
aplikasi konsumen, lalu instruksikan owner mengisi nilainya dari secure store.

Jika dashboard memberi "Copy fix prompt", pertahankan `request_id`, `app_id`,
environment, endpoint yang gagal, dan response status saat debugging. Jangan minta
atau menuliskan secret value ke repository.
```

Change provider-specific prohibitions to include Mayar and Midtrans:

```md
* terhubung langsung ke provider payment seperti Duitku, Mayar, atau Midtrans;
* menyimpan API key provider payment di aplikasi konsumen;
* menerima callback provider payment langsung;
```

- [ ] **Step 5: Run docs-sensitive checks**

Run:

```bash
npm run typecheck
npm test
```

Expected:

```text
tsc exits 0
vitest exits 0
```

- [ ] **Step 6: Commit docs**

```bash
git add docs/internal/integrating-new-app.md docs/external/integration-guide.md docs/external/openapi.yaml prompt.md
git commit -m "docs: align onboarding docs with admin dashboard"
```

---

### Task 17: Final Quality Gates And Manual Smoke

**Files:**
- Verify all changed files

- [ ] **Step 1: Run backend quality gates**

Run:

```bash
npm run typecheck
npm test
npm run lint
```

Expected:

```text
tsc exits 0
vitest exits 0
eslint exits 0
```

- [ ] **Step 2: Run admin frontend quality gate**

Run:

```bash
cd admin
npm run build
```

Expected:

```text
vite build exits 0
```

- [ ] **Step 3: Run local D1 migration check**

Run:

```bash
npm run db:migrate:local
```

Expected:

```text
wrangler applies migrations through 0008_admin_onboarding.sql
```

- [ ] **Step 4: Start local PayCore Worker**

Run:

```bash
npm run dev
```

Expected:

```text
wrangler dev starts local Worker
```

Do not end the execution session with this process still running. Stop it after smoke testing.

- [ ] **Step 5: Smoke Admin API**

With dev token configured in `.dev.vars`, call:

```bash
curl.exe -H "X-PayCore-Admin-Token: $env:PAYCORE_ADMIN_DEV_TOKEN" http://127.0.0.1:8787/admin/apps
curl.exe -H "X-PayCore-Admin-Token: $env:PAYCORE_ADMIN_DEV_TOKEN" http://127.0.0.1:8787/admin/merchant-profiles
```

Expected:

```text
Both return JSON with apps or merchant_profiles arrays.
```

- [ ] **Step 6: Create one staging draft/sandbox app locally**

Use a local-only app id that will not be deployed:

```powershell
$body = @{
  app_id = "local_test_app"
  display_name = "Local Test App"
  order_prefix = "LTA"
  webhook_url = "https://example.com/internal/payment-events"
  allowed_return_urls = @("https://example.com/payment/return")
  merchant_profile_id = "mp_appvibe_default"
  environment = "staging"
  key_id = "pk_staging_local_test_app_01"
} | ConvertTo-Json

curl.exe -X POST http://127.0.0.1:8787/admin/apps `
  -H "Content-Type: application/json" `
  -H "X-PayCore-Admin-Token: $env:PAYCORE_ADMIN_DEV_TOKEN" `
  --data $body
```

Expected:

```text
HTTP 201
Response includes app_secret and webhook_secret once.
Response includes APP_LOCAL_TEST_APP_STAGING_SECRET refs.
```

- [ ] **Step 7: Smoke admin frontend**

Run:

```bash
cd admin
npm run dev
```

Open the printed localhost URL.

Expected:

```text
Sidebar loads apps.
Provider template count renders.
New project form renders without overlapping text at desktop width.
```

Stop the frontend dev server after smoke testing.

- [ ] **Step 8: Commit final fixes**

If smoke tests reveal small defects, fix them and commit:

```bash
git add .gitignore migrations src tests docs prompt.md admin package.json package-lock.json
git commit -m "fix: polish admin onboarding flow"
```

If no defects are found, do not create an empty commit.

---

## Self-Review Checklist

- Spec coverage:
  - App onboarding dashboard: Tasks 10, 11, 14, 15.
  - Provider templates: Tasks 2, 8, 15, 16.
  - Generic secret resolution: Tasks 3, 4, 5.
  - Cloudflare Workers Secrets API: Task 6 and Task 11.
  - Webhook ping: Task 12.
  - Integration kit and Codex prompt: Task 13 and Task 16.
  - Copyable fix prompt: Task 9, Task 12, Task 13, Task 16.
  - Tests and quality gates: Tasks 1 through 17.

- Type consistency:
  - `app_id` is external slug.
  - `appUuid` is internal D1 app primary key.
  - `key_id` is API header value.
  - `app_secret_ref` and `webhook_secret_ref` are Worker secret names.
  - `merchant_profiles` are presented as provider templates in UI.

- Execution constraints:
  - Do not put Cloudflare API token in frontend code.
  - Do not store secret values in D1.
  - Do not commit generated `.superpowers/` artifacts.
  - Do not run production activation in local validation.
