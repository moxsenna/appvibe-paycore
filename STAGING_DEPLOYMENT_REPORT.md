# Staging deployment report — AppVibe PayCore

**Date:** 2026-06-23 (session)  
**Production:** not touched.

---

## 1. Resource staging yang dibuat

| Resource | Status |
|----------|--------|
| D1 `paycore-staging` | Created (APAC) |
| Queue `paycore-fulfillment-staging` | Created |
| Queue `paycore-dlq-staging` | Created |
| Worker `appvibe-paycore-staging` | Deployed |

## 2. Database ID staging

```text
7b5ceed8-090e-41d4-bf79-4d919c4b59c5
```

Recorded in `wrangler.toml` → `[[env.staging.d1_databases]]`.

## 3. Queue yang dibuat

- `paycore-fulfillment-staging` (producer + consumer on staging worker)
- `paycore-dlq-staging` (DLQ producer + consumer)

## 4. Migration yang diterapkan

Remote staging (`wrangler d1 migrations apply paycore-staging --remote --env staging`):

| Migration | Status |
|-----------|--------|
| `0001_initial.sql` | Applied |
| `0002_seed.sql` | Applied |

`migrations/postgres-legacy/` was **not** applied (not in `migrations_dir`).

**Verified tables:** `apps`, `merchant_profiles`, `payment_orders`, `payment_events`, `fulfillment_deliveries`, `audit_logs`, `idempotency_keys`, `d1_migrations`, `_cf_KV`.

**Seed:** `app_id = narraza`, `profile_key = appvibe_default`.

## 5. Binding Wrangler staging

```text
env.DB                    → paycore-staging (D1)
env.FULFILLMENT_QUEUE     → paycore-fulfillment-staging
env.DEAD_LETTER_QUEUE     → paycore-dlq-staging
env.ENVIRONMENT           → staging (var)
schedule                  → 0 2 * * *
```

## 6. Secret names yang sudah diset

**Belum diset** via `wrangler secret put` dalam sesi ini (`wrangler secret list --env staging` gagal karena worker belum ada sebelum deploy pertama).

Setelah deploy, set minimal:

```text
DUITKU_BASE_URL
DUITKU_MERCHANT_CODE
DUITKU_API_KEY
DUITKU_CALLBACK_SECRET
PAYCORE_PUBLIC_BASE_URL=https://pay-staging.appvibe.biz.id
PAYCORE_INTERNAL_MASTER_KEY
PAYCORE_ENCRYPTION_KEY
NARRAZA_APP_KEY_ID
NARRAZA_APP_SECRET
NARRAZA_WEBHOOK_SECRET
SENTRY_DSN (optional)
```

Tambahkan juga `vars` / secret untuk `PAYCORE_PUBLIC_BASE_URL` jika dipakai di validasi env (sudah required di `validateEnv`).

**Tidak ada** `SUPABASE_*`.

## 7. URL Worker staging

```text
https://appvibe-paycore-staging.moxsenna.workers.dev
```

Target custom domain (belum dikonfigurasi di sesi ini):

```text
https://pay-staging.appvibe.biz.id
```

## 8. Status custom domain

**Belum dilakukan** — perlu Cloudflare dashboard: Workers & Pages → `appvibe-paycore-staging` → Custom Domains → `pay-staging.appvibe.biz.id` + DNS di zona `appvibe.biz.id`.

Duitku sandbox callback (setelah domain aktif):

```text
https://pay-staging.appvibe.biz.id/webhooks/duitku
```

## 9. Hasil health check

`GET /health` pada workers.dev — lihat hasil `curl` sesi deploy. Jika `500` / invalid env: set secrets + `PAYCORE_PUBLIC_BASE_URL` lalu redeploy.

Expected body when healthy:

```json
{ "status": "ok", "service": "appvibe-paycore", "environment": "staging" }
```

## 10. Hasil E2E sandbox per tahap

**Belum dijalankan** — membutuhkan secrets staging, `PAYCORE_PUBLIC_BASE_URL`, custom domain (atau workers.dev + Duitku callback URL sementara), Narraza mock/staging webhook, dan pembayaran sandbox Duitku.

Checklist: `docs/staging-e2e-checklist.md`.

## 11. Hasil duplicate callback test

**Belum dijalankan** (bergantung E2E). Unit/logic: `recordWebhookPaid` + `INSERT OR IGNORE` → outcome `duplicate` / `already_paid`.

## 12. Hasil failed fulfillment + retry test

**Belum dijalankan** di staging live. Desain: HTTP 500 → `markDeliveryOutcome` → `failed` + `next_retry_at`; delayed `FULFILLMENT_QUEUE.send` dengan same `deliveryId` / `eventId`.

## 13. Bukti queue consumer ack behavior

- **Code:** `src/index.ts` — `ack()` setelah `processQueueMessage` selesai tanpa throw; `retry()` hanya on throw.
- **Code:** `processQueueMessage` tidak throw pada app webhook gagal setelah `markDeliveryOutcome`.
- **Test:** `tests/queue-ack-behavior.test.ts` (contract ack on `retry_scheduled` / `delivered` / `dead_letter` / `claim_skipped`).

## 14. File yang berubah (sesi staging)

- `wrangler.toml` — staging D1 id, `paycore-dlq-staging`
- `src/index.ts` — komentar + log `delivery_id` on CF retry
- `tests/queue-ack-behavior.test.ts`
- `docs/staging-e2e-checklist.md`
- `STAGING_DEPLOYMENT_REPORT.md`

## 15. Hal yang belum dilakukan

- Set semua staging secrets + redeploy
- Custom domain `pay-staging.appvibe.biz.id`
- Duitku sandbox callback URL ke staging
- E2E sandbox (create order → pay → callback → queue → Narraza)
- Duplicate callback / 500 retry / invalid signature **live** tests
- Production resources / deploy
- Duitku inquiry reconciliation

---

## Quality gates (repo)

```bash
npm run typecheck  # OK
npm test           # 8 files, 37 tests OK
npm run lint       # OK
```

## Langkah Anda berikutnya

1. `npx wrangler secret put ... --env staging` (semua key di §6).
2. Set `PAYCORE_PUBLIC_BASE_URL` (secret atau `[env.staging.vars]` jika ditambahkan).
3. Attach custom domain; update Duitku callback.
4. Jalankan E2E per `docs/staging-e2e-checklist.md`.