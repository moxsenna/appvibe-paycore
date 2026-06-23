# AppVibe PayCore — Implementation Report

**Checkpoint:** fulfillment retry & delivery deduplication hardened (stable for staging E2E).

## 1. Ringkasan

Cloudflare Worker (Hono), Supabase (migrations 001–004 + RPCs), Duitku adapter (pure JS MD5), app/admin auth, orders, centralized Duitku webhook, fulfillment queue with **atomic delivery claim**, daily reconciliation cron, admin API, Vitest.

Not deployed in this session. **Provider status inquiry reconciliation is intentionally not wired to cron yet.**

## 2. Fulfillment hardening (latest)

| Concern | Implementation |
|---------|----------------|
| Retry identity | Same `deliveryId` (UUID row) and `event_id` across attempts; only `attempt_number` increments |
| Source of truth for retry | `fulfillment_deliveries` (`next_retry_at`, `delivery_status`, `claimed_at`, `last_attempt_at`) |
| Concurrent workers | `paycore_claim_fulfillment_delivery` (`FOR UPDATE`) before HTTP dispatch |
| Stuck processing | Reclaim when `claimed_at < now() - 15 minutes` |
| Retry schedule | 1m, 5m, 30m, 2h, 12h, 24h → max 7 attempts → `dead_letter` + order `manual_review` |
| Enqueue on paid | `ensureDeliveryRowForPaidEvent` then queue message with row `id` |

Key files: `src/lib/fulfillment-retry.ts`, `src/services/fulfillment-delivery-store.ts`, `src/services/fulfillment-service.ts`, `src/services/reconciliation-service.ts`, `migrations/004_fulfillment_delivery_hardening.sql`.

## 3. Daily cron (`0 2 * * *` UTC)

`src/index.ts` → `ReconciliationService.runDaily`:

1. **summarizeRange** — last 24h order/fulfillment counts + audit row  
2. **expirePendingOrders** — `pending`/`created` past `expires_at` → `expired`  
3. **countPaidUndelivered** — monitoring metric (paid, fulfillment not `delivered`)  
4. **retryStuckFulfillments** — `paycore_list_deliveries_due_retry` → claim → `FULFILLMENT_QUEUE` (same `deliveryId` / `eventId`)

Does **not** call Duitku `transactionStatus` (deferred until staging E2E passes).

## 4. Duitku

- Callback: `POST /webhooks/duitku`  
- MD5: `src/lib/md5.ts` + `duitkuCallbackSignatureMd5` / `duitkuRequestSignatureMd5`  
- Docs: **`docs/duitku-integration.md`** (callback, signatures, staging checklist)

## 5. Quality gates

```bash
npm run typecheck   # OK
npm test            # 5 files, 21 tests OK
npm run lint        # OK
```

Tests include `tests/fulfillment-retry.test.ts` (stuck timing, `next_retry_at`, terminal statuses, claim simulation).

## 6. Migrations

Apply in order: `001_initial_schema.sql`, `002_rpc_functions.sql`, `003_seed.sql`, `004_fulfillment_delivery_hardening.sql`.

## 7. Schemas & config

- Canonical Zod: `src/schemas/order.ts`, `src/schemas/webhook.ts`  
- `tsconfig.json`: `allowImportingTsExtensions: true`  
- Queues + cron: `wrangler.toml` (staging/production env blocks)

## 8. Next recommended step (product)

**Staging deployment + E2E Duitku sandbox:**

create order → sandbox pay → callback → queue → Narraza webhook (mock or real) → idempotent credit.

After that: optional **provider inquiry reconciliation** for missed callbacks.

## 9. Risks

- Confirm Duitku MD5 `amount` string format against live sandbox callbacks.  
- Apply migration 004 before relying on claim RPCs in production.  
- Configure Cloudflare Queues, secrets, and Supabase service role manually per `docs/runbook.md`.