# Payment events (PayCore → your app)

## Endpoint on your side

Configure in PayCore `apps.webhook_url`, typically:

```http
POST /internal/payment-events
```

Must be **HTTPS**. PayCore uses `fetch()` from the Worker (no browser).

## Event type (MVP)

Only **`payment.succeeded`** is dispatched today (`src/services/fulfillment-service.ts`).

## HTTP request from PayCore

Headers actually sent:

```http
Content-Type: application/json
X-PayCore-Event-Timestamp: <ISO UTC>
X-PayCore-Event-Signature: sha256=<hmac_hex>
```

Body: JSON from `buildPaymentSucceededPayload`.

## JSON schema (actual)

```json
{
  "event_id": "evt_<hex>",
  "event_type": "payment.succeeded",
  "occurred_at": "<ISO UTC, same as paid_at when known>",
  "data": {
    "order_id": "<PayCore global order id>",
    "external_order_id": "<your id>",
    "app_id": "<app slug>",
    "provider": "duitku",
    "provider_reference": "<string or null>",
    "amount": 99000,
    "currency": "IDR",
    "product_key": "<string or null>",
    "fulfillment_data": { },
    "paid_at": "<ISO UTC>"
  }
}
```

There is **no** `payment_status` field inside `data` in the current implementation.

## Your handler must

1. Read **raw body** as string before JSON parse (for signature).
2. Verify `X-PayCore-Event-Timestamp` within ±5 minutes (recommended).
3. Verify `X-PayCore-Event-Signature` (see `docs/integration-guide.md` §8).
4. Check **`event_id`** not processed (unique).
5. Check **`order_id`** not fulfilled twice (unique business key).
6. Apply fulfillment (credits, subscription, …) atomically.
7. Return **HTTP 2xx** on success.
8. Return **HTTP 2xx** if event already processed (idempotent).

Non-2xx causes PayCore to schedule retry with the **same** `event_id` and delivery row.

## Retry behavior (PayCore)

- Same `event_id` and `deliveryId` across retries.
- Backoff: 1m, 5m, 30m, 2h, 12h, 24h (see `src/lib/fulfillment-retry.ts`).
- After max attempts → `dead_letter` + order `manual_review`.

## What not to do

- Do not call Duitku from this handler to “confirm” payment.
- Do not trust `return_url` or user redirect.
- Do not issue a new `event_id` on your side for the same PayCore order.