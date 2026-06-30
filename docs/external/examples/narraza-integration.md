# Narraza × PayCore

## Identity

| Field | Staging value |
|-------|----------------|
| `app_id` | `narraza` |
| `order_prefix` | `NAR` |
| PayCore base (staging) | `https://pay-staging.appvibe.biz.id` |
| PayCore base (production) | `https://pay.appvibe.biz.id` |
| Key id (staging example) | `pk_staging_narraza_01` |

## Endpoints Narraza must implement

```http
POST /internal/payment-events
```

(URL in PayCore seed: `https://api.narraza.web.id/internal/payment-events` — update D1 if Narraza staging host differs.)

## Endpoints Narraza calls (server-side only)

```http
POST https://pay-staging.appvibe.biz.id/v1/orders
GET  https://pay-staging.appvibe.biz.id/v1/orders/{order_id}
```

Never call `/webhooks/duitku`.

## Environment (Narraza backend — staging)

```text
PAYCORE_BASE_URL=https://pay-staging.appvibe.biz.id
PAYCORE_APP_ID=narraza
PAYCORE_KEY_ID=pk_staging_narraza_01
PAYCORE_APP_SECRET=<must match PayCore Worker mapping for key id>
PAYCORE_WEBHOOK_SECRET=<must match PayCore NARRAZA_WEBHOOK_SECRET>
PAYCORE_RETURN_URL=https://app-staging.narraza.web.id/payment/return
```

**Staging Narraza must use staging PayCore and staging secrets** — not production URLs or keys.

## Fulfillment idempotency (recommended)

Ledger / reference:

```text
paycore:{order_id}
```

Example: `paycore:NAR-20260624-8H2KQ`

See `tests/narraza-idempotency.test.ts` for the intended pattern.

Process flow:

1. Verify event signature.
2. If `event_id` seen → return 200.
3. If `paycore:{order_id}` exists in ledger → return 200.
4. Else grant credits from `fulfillment_data` inside a DB transaction.
5. Return 200.

## User return flow

After payment, user may hit:

```text
https://pay-staging.appvibe.biz.id/return/{order_id}
```

PayCore redirects to `return_url` with `order_id` query param. **Do not grant credits here** — wait for webhook.

## Duitku (operator, not Narraza code)

Callback URL in Duitku sandbox:

```text
https://pay-staging.appvibe.biz.id/webhooks/duitku
```

## Testing

1. Health: `https://pay-staging.appvibe.biz.id/health`
2. Buy credit pack on Narraza staging.
3. Confirm one ledger entry per `order_id`.
4. Ask operator to resend Duitku callback → still one credit.

## Docs

- `docs/external/integration-guide.md`
- `docs/external/payment-events.md`
- `docs/internal/staging-e2e-checklist.md`
