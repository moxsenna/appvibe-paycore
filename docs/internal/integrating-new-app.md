# Integrating a new app into PayCore

Use this when adding **Siklusio**, **TEKAD**, or any future AppVibe product.

## Checklist

| Step | Action |
|------|--------|
| 1 | Choose unique **`app_id`** (slug), e.g. `siklusio` |
| 2 | Choose unique **`order_prefix`** (3+ letters), e.g. `SIK` → orders `SIK-20260624-XXXX` |
| 3 | Define **`return_url`** allowlist (HTTPS paths users return to after pay) |
| 4 | Define **`webhook_url`** (HTTPS) for `POST` events, e.g. `/internal/payment-events` |
| 5 | Generate **`PAYCORE_APP_SECRET`** (your backend → PayCore HMAC) |
| 6 | Generate **`PAYCORE_WEBHOOK_SECRET`** (verify PayCore → you HMAC) |
| 7 | Choose **`X-PayCore-Key-Id`**, e.g. `pk_staging_siklusio_01` |
| 8 | Insert row in PayCore D1 `apps` + link `merchant_profiles` (migration/seed or admin SQL) |
| 9 | Map Key-Id → secret on PayCore Worker (`resolveAppSecret` / secrets) |
| 10 | Map `webhook_secret_ref` → webhook secret (`resolveWebhookSecret`) |
| 11 | Deploy PayCore staging if config/secrets changed |
| 12 | Set env on **consumer app** (see below) |
| 13 | Test `POST /v1/orders` → get `checkout_url` |
| 14 | Test sandbox payment → `payment.succeeded` received |
| 15 | Test duplicate `event_id` → no double fulfillment |
| 16 | Test your webhook 500 → PayCore retries, same `event_id` |
| 17 | Production only after staging E2E sign-off |

## Example: Siklusio (staging)

```text
app_id:           siklusio
order_prefix:     SIK
display_name:     Siklusio
webhook_url:      https://api-staging.siklusio.web.id/internal/payment-events
webhook_secret_ref: SIKLUSIO_WEBHOOK_SECRET   (name in PayCore Worker secrets)
allowed_return_urls: ["https://app-staging.siklusio.web.id/payment/return"]
default_merchant_profile_id: appvibe_default (duitku)
status: active
```

Consumer app env (staging):

```text
PAYCORE_BASE_URL=https://pay-staging.appvibe.biz.id
PAYCORE_APP_ID=siklusio
PAYCORE_KEY_ID=pk_staging_siklusio_01
PAYCORE_APP_SECRET=<from secure store>
PAYCORE_WEBHOOK_SECRET=<from secure store>
PAYCORE_RETURN_URL=https://app-staging.siklusio.web.id/payment/return
```

## D1 seed pattern

See `migrations/0002_seed.sql` for Narraza. New apps need a new `INSERT INTO apps` with unique `id`, `app_id`, `order_prefix`.

## PayCore code changes for new key ids

Today `resolveAppSecret` / `resolveWebhookSecret` in `src/config/env.ts` are **Narraza-specific**. Adding apps requires extending those resolvers or a generic secret naming convention — coordinate with PayCore maintainers (no schema change required for docs-only onboarding).

## References

- `docs/external/integration-guide.md`
- `docs/external/examples/generic-app-integration.md`
