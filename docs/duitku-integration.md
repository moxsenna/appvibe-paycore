# Duitku integration (PayCore)


**Operator checklist (staging):** `docs/duitku-sandbox-setup.md`
PayCore uses **one** callback domain for all apps. Narraza and other products never expose their own Duitku callback URL.

## Endpoints (PayCore)

| Direction | URL |
|-----------|-----|
| Provider → PayCore | `POST https://pay.appvibe.biz.id/webhooks/duitku` (staging: `pay-staging.appvibe.biz.id`) |
| PayCore → Duitku create | `POST {DUITKU_BASE_URL}/webapi/api/merchant/v2/inquiry` |
| PayCore → Duitku status | `POST {DUITKU_BASE_URL}/webapi/api/merchant/transactionStatus` |

Implementation: `src/providers/duitku.ts`, `src/services/webhook-service.ts`.

## Secrets (Worker only)

| Variable | Purpose |
|----------|---------|
| `DUITKU_BASE_URL` | `https://sandbox.duitku.com` (staging) or production host |
| `DUITKU_MERCHANT_CODE` | Sandbox/live merchant code from Duitku dashboard |
| `DUITKU_API_KEY` | API key for inquiry + callback MD5 |
| `DUITKU_CALLBACK_SECRET` | Optional; callback verification uses **API key**, not this field |

Never commit API keys. Register callback URL in Duitku dashboard only.

## MD5 signatures (pure JS)

Workers have no native MD5. PayCore uses `src/lib/md5.ts` (RFC 1321, little-endian 32-bit words). **Do not** use `crypto.subtle` for MD5.

### Callback verification (server → PayCore)

Concatenate **without** separators:

```text
md5Hex(merchantCode + amount + merchantOrderId + apiKey)
```

- `amount` must match the string Duitku sends in the callback body (see live callback samples).
- Compare to `signature` field using constant-time equality (`timingSafeEqual`).

Code: `duitkuCallbackSignatureMd5` in `src/lib/crypto.ts`.

### Create payment / inquiry request (PayCore → Duitku)

```text
md5Hex(merchantCode + paymentAmount + merchantOrderId + apiKey)
```

- `paymentAmount` is numeric (integer IDR).
- `merchantOrderId` is PayCore global `order_id` (e.g. `NAR-20260623-8H2KQ`).

Code: `duitkuRequestSignatureMd5` in `src/lib/crypto.ts`.

### Transaction status request

Same pattern as create payment for the status API body (merchant code, amount, merchant order id, api key). Adapter method: `getPaymentStatus` on `DuitkuAdapter`.

> **Note:** Daily cron does **not** poll Duitku status yet. Callback is the source of truth for MVP. Provider inquiry reconciliation is planned **after** staging E2E validates the main path.

## Callback processing rules

1. Verify MD5 signature before any state change.
2. Resolve order by `merchantOrderId` (= PayCore `order_id`).
3. Verify amount matches stored order amount.
4. Persist raw webhook; apply paid transition via D1 repository (`recordWebhookPaid`) for idempotency.

Duplicate callbacks must return success without second fulfillment (`duplicate` / `already_paid` outcomes).

## Return URL

Customer browser return is **not** proof of payment. Only the server callback may set `payment_status = paid`.

## Staging checklist

1. Configure Duitku sandbox merchant + callback URL pointing to staging Worker.
2. `POST /v1/orders` from Narraza backend (signed app request).
3. Complete sandbox payment → callback hits `/webhooks/duitku`.
4. Confirm queue consumer dispatches `payment.succeeded` to app `webhook_url`.
5. Repeat callback → no double credit (idempotent delivery row + app handler).

## References

- Duitku official API docs (confirm field order if sandbox responses differ).
- `docs/runbook.md` — fulfillment retry and manual review.
- `docs/architecture.md` — payment vs fulfillment vs delivery status.