# Runbook

## Status fields

- **payment_status** — from Duitku callback (source of truth for paid).
- **fulfillment_status** — aggregate on `payment_orders` (`delivered`, `manual_review`, …).
- **delivery_status** — on `fulfillment_deliveries` (`queued`, `processing`, `failed`, `delivered`, `dead_letter`).

Investigate paid-but-undelivered using **delivery rows**, not `payment_orders.updated_at`.

## Retry schedule

After each failed HTTP to the app: 1m, 5m, 30m, 2h, 12h, 24h (6 delays, 7 attempts max). Then `dead_letter` + `fulfillment_status=manual_review`.

## Atomic claim

Before dispatch, `paycore_claim_fulfillment_delivery` sets `processing` + `claimed_at`. If claim fails, worker acks and skips (no duplicate dispatch).

## Daily cron (02:00 UTC)

- Expire pending orders past `expires_at`
- `paycore_list_deliveries_due_retry` → claim → queue (same `delivery_id`, same `event_id`)
- Stale `processing`: `claimed_at < now() - 15 minutes`

## Manual retry

`POST /admin/orders/:order_id/retry-fulfillment` — creates/reuses delivery row and enqueues.

## Manual review

Do not auto-retry `dead_letter` or `manual_review` deliveries. Fix app webhook, then admin retry.