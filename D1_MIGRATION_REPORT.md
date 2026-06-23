# PayCore — Supabase → Cloudflare D1 migration report

## 1. Ringkasan perubahan

Persistence dipindah dari Supabase PostgreSQL + RPC ke **Cloudflare D1** dengan repository layer (`src/db/repositories/*`). Perilaku fulfillment hardening (claim, same `deliveryId`/`eventId`, cron due list) dipertahankan. Supabase client dan env vars dihapus.

## 2. Daftar file yang diubah (utama)

- `migrations/0001_initial.sql`, `0002_seed.sql` (baru)
- `migrations/postgres-legacy/*` (arsip 001–004 PostgreSQL)
- `src/db/**`, `src/types/env.ts`, `src/types/hono.ts`, `src/types/queue.ts`
- `src/app.ts`, `src/index.ts`, `src/config/env.ts`, `src/lib/time.ts`, `src/lib/idempotency.ts`
- Semua `src/services/*`, `src/routes/*`, `src/middleware/app-auth.ts`
- `wrangler.toml`, `package.json`, `.dev.vars.example`, `README.md`, docs
- `tests/d1-*.test.ts` (baru)
- Dihapus: `src/lib/supabase.ts`

## 3. Mapping Supabase/PostgreSQL → D1

| PostgreSQL | D1 |
|------------|-----|
| `UUID` / `gen_random_uuid()` | `TEXT` + `crypto.randomUUID()` |
| `JSONB` | `TEXT` JSON |
| `TIMESTAMPTZ` | `INTEGER` ms UTC |
| `BOOLEAN` | `INTEGER` 0/1 |
| `paycore_reserve_idempotency` RPC | `idempotency-repository.ts` |
| `paycore_complete_idempotency` RPC | `completeIdempotency()` |
| `paycore_record_webhook_paid` RPC | `webhook-repository.ts` |
| `paycore_claim_fulfillment_delivery` RPC | `deliveries-repository.ts` conditional UPDATE |
| `paycore_list_deliveries_due_retry` RPC | `listDeliveriesDueRetry()` SQL |
| `supabase.from().select()` | Prepared statements per repository |

## 4. Migration D1 yang dibuat

- `migrations/0001_initial.sql` — schema + indexes
- `migrations/0002_seed.sql` — Narraza + default merchant

**Belum dijalankan** terhadap Cloudflare remote dalam sesi ini.

## 5. Binding Cloudflare

- `DB` → D1 (`paycore-staging` / `paycore-production`)
- `FULFILLMENT_QUEUE`, `DEAD_LETTER_QUEUE`
- Cron `0 2 * * *`

## 6. Perintah local development

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
npm run typecheck && npm test && npm run lint
```

## 7. Setup staging

1. Buat D1 `paycore-staging`, isi `database_id` di `wrangler.toml`.
2. Set Worker secrets (Duitku, Narraza, PayCore keys).
3. Buat Queues staging sesuai `wrangler.toml`.

## 8. Migration staging

```bash
npm run db:migrate:staging
```

## 9. Environment variables

**Dihapus:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

**Tetap:** `ENVIRONMENT`, `SENTRY_DSN`, Duitku, `PAYCORE_*`, `NARRAZA_*`, `PAYCORE_ADMIN_DEV_TOKEN`

**D1/Queue:** via bindings, bukan secret URL.

## 10. Test

Jalankan di repo setelah refactor:

```bash
npm run typecheck
npm test
npm run lint
```

Tambahan: `tests/d1-schema.test.ts`, `tests/d1-claim-simulation.test.ts`; existing `fulfillment-retry.test.ts` retained.

## 11. Risiko / edge case D1

- Tidak ada `FOR UPDATE`; claim race mengandalkan conditional UPDATE — dua worker bisa satu menang (`changes=1`).
- `INSERT OR IGNORE` duplicate webhook: perlu cek `changes` (sudah di `recordWebhookPaid`).
- SQLite write throughput vs Postgres — monitor pada volume tinggi.
- Time Travel / backup policy mengikuti plan Cloudflare.

## 12. Sengaja belum dikerjakan

- Deploy production
- Duitku inquiry reconciliation
- E2E staging sandbox
- Remote D1 migration apply (hanya script disediakan)