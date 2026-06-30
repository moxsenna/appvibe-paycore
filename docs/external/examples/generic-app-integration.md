# Generic app integration template

Copy this pattern for any AppVibe backend (Siklusio, TEKAD, Subscription Tracker, …).

## 1. Register with PayCore team

Provide:

- `app_id` (slug)
- `order_prefix`
- `webhook_url` (HTTPS)
- `return_url` (HTTPS, for allowlist)
- Staging vs production URLs

## 2. Environment variables (your app)

```text
PAYCORE_BASE_URL=        # staging or production PayCore host
PAYCORE_APP_ID=          # matches X-PayCore-App
PAYCORE_KEY_ID=          # matches PayCore key mapping
PAYCORE_APP_SECRET=      # HMAC to PayCore
PAYCORE_WEBHOOK_SECRET=  # verify events from PayCore
PAYCORE_RETURN_URL=      # sent in create order body
```

Never commit secrets. Use CI/CD secret store.

## 3. Create payment (pseudo-flow)

```text
1. User clicks pay in your app
2. Your API generates external_order_id (unique)
3. Your API builds JSON body (amount, customer, fulfillment_data, return_url)
4. Sign POST /v1/orders (see integration-guide)
5. Store order_id + external_order_id from response
6. Redirect user to checkout_url
```

## 4. Webhook handler (pseudo-flow)

```text
1. Read raw body string
2. Read X-PayCore-Event-Timestamp and X-PayCore-Event-Signature
3. Verify signature (integration-guide §8)
4. Parse JSON; require event_type === payment.succeeded
5. Idempotent grant using event_id + order_id
6. Return 200
```

## 5. Status poll (optional)

```http
GET /v1/orders/{order_id}
```

Signed like POST. Use for UI display only — fulfillment still from webhook.

## 6. Allowed vs forbidden

| Allowed | Forbidden |
|---------|-----------|
| POST /v1/orders | POST /webhooks/duitku |
| GET /v1/orders/:id | Trust return URL as paid |
| Verify PayCore event HMAC | Verify Duitku callback in app |
| Idempotent fulfillment | Double grant on retry without unique key |

## 7. Minimal TypeScript module layout

```text
lib/paycore-sign.ts      # signPayCoreRequest
lib/paycore-verify.ts    # verifyPayCoreEvent
routes/paycore-webhook.ts # POST /internal/payment-events
services/checkout.ts     # create order + redirect URL
```

Implementations must match `src/lib/crypto.ts` in PayCore repo.

## 8. Further reading

- `docs/external/integration-guide.md` — full guide
- `docs/internal/integrating-new-app.md` — PayCore maintainer onboarding checklist
- `docs/external/troubleshooting.md`
