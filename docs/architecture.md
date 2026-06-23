# Architecture

## Persistence

**Cloudflare D1 (SQLite)** stores all PayCore transactional data. Timestamps are **Unix milliseconds** (`INTEGER`). JSON columns are `TEXT`.

No Supabase, no PostgreSQL RPC. Atomic behavior uses:

- `INSERT OR IGNORE` + unique constraints (webhooks, idempotency)
- Conditional `UPDATE` + `meta.changes` (delivery claim)
- `db.batch()` for paired order/fulfillment updates

## Status layers

| Layer | Field | Meaning |
|-------|-------|---------|
| Payment | `payment_status` | Provider callback |
| Fulfillment (order) | `fulfillment_status` | Aggregate app outcome |
| Delivery (row) | `delivery_status` | Retry source of truth |

## Fulfillment retry

Same `deliveryId` and `event_id` for all attempts. Claim before HTTP dispatch. Cron lists due rows from `fulfillment_deliveries` only.

## Not in this phase

Duitku `transactionStatus` inquiry reconciliation.