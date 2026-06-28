# Duitku Integration - PayCore

**Operator checklist (staging):** `docs/duitku-sandbox-setup.md`

PayCore uses one Duitku callback domain for all apps. AppVibe Vault, Narraza, and future products must never expose their own Duitku callback URL.

## Endpoints

| Direction | URL |
|-----------|-----|
| Duitku -> PayCore staging | `POST https://pay-staging.appvibe.biz.id/webhooks/duitku` |
| Duitku -> PayCore production | `POST https://pay.appvibe.biz.id/webhooks/duitku` |
| PayCore -> Duitku POP create invoice staging | `POST https://api-sandbox.duitku.com/api/merchant/createInvoice` |
| PayCore -> Duitku POP create invoice production | `POST https://api-prod.duitku.com/api/merchant/createInvoice` |
| PayCore -> Duitku transaction status staging | `POST https://sandbox.duitku.com/webapi/api/merchant/transactionStatus` |
| PayCore -> Duitku transaction status production | `POST https://passport.duitku.com/webapi/api/merchant/transactionStatus` |

Implementation: `src/providers/duitku.ts`, `src/services/webhook-service.ts`.

## Secrets

| Variable | Purpose |
|----------|---------|
| `DUITKU_BASE_URL` | `https://api-sandbox.duitku.com` for staging, `https://api-prod.duitku.com` for production. |
| `DUITKU_MERCHANT_CODE` | Sandbox/live merchant code from Duitku dashboard. |
| `DUITKU_API_KEY` | API key / merchant key used for POP HMAC and callback verification. |
| `DUITKU_CALLBACK_SECRET` | Optional legacy placeholder. Callback verification uses `DUITKU_API_KEY`. |

Never commit API keys. Register callback URLs in the Duitku dashboard only.

## POP Create Invoice Signature

PayCore uses Duitku POP Create Invoice. Official docs:

- Production endpoint: `https://api-prod.duitku.com/api/merchant/createInvoice`
- Sandbox endpoint: `https://api-sandbox.duitku.com/api/merchant/createInvoice`
- Header signature uses HMAC SHA256.

Headers sent by PayCore:

```text
Content-Type: application/json; charset=UTF-8
x-duitku-timestamp: {Date.now() in milliseconds}
x-duitku-merchantcode: {DUITKU_MERCHANT_CODE}
x-duitku-signature: HMAC_SHA256(DUITKU_MERCHANT_CODE + timestamp, DUITKU_API_KEY)
```

`paymentAmount` must equal the total of `itemDetails.price * itemDetails.quantity`.

## Callback Verification

POP callback signature is verified with HMAC SHA256:

```text
expected = HMAC_SHA256(merchantCode + amount + merchantOrderId, DUITKU_API_KEY)
```

PayCore still accepts the older V2 MD5 callback formula as a compatibility fallback:

```text
legacy = MD5(merchantCode + amount + merchantOrderId + DUITKU_API_KEY)
```

This fallback is only for old sandbox/live callbacks already in flight. New production setup should use POP HMAC.

## Callback Processing Rules

1. Verify signature before any state change.
2. Resolve order by `merchantOrderId` (= PayCore `order_id`).
3. Verify callback merchant code matches active Worker secret.
4. Verify amount matches stored order amount.
5. Persist raw webhook.
6. Apply paid transition via D1 repository for idempotency.
7. Enqueue fulfillment delivery to the app webhook.

Duplicate callbacks must return success without second fulfillment.

## Return URL

Customer browser return is not proof of payment. Duitku redirects users to PayCore `/return/:order_id`, and PayCore then redirects back to the app's allowlisted return URL. Only server callback may set `payment_status = paid`.

## Production Cutover Guardrails

- Do not reuse sandbox merchant code or API key in production.
- Set `DUITKU_BASE_URL=https://api-prod.duitku.com`.
- Register exactly this production callback URL in Duitku dashboard:

```text
https://pay.appvibe.biz.id/webhooks/duitku
```

- Production Worker must use production app secrets and webhook secrets.
- Run production D1 migrations before enabling production orders.
- Do not run a real production payment until owner explicitly approves live testing.

## References

- Duitku POP official docs: `https://docs.duitku.com/pop/en/`
- `docs/runbook.md` - fulfillment retry and manual review.
- `docs/architecture.md` - payment vs fulfillment vs delivery status.
