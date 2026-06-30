# Troubleshooting PayCore integration

## Quick checks

| Symptom | First check |
|---------|-------------|
| Anything broken | `GET {PAYCORE_BASE_URL}/health` → `status: ok` |
| Order API | Signature + `path` + raw body hash |
| Paid but no credit | PayCore `fulfillment_deliveries` + your webhook logs |
| Double credit | Your DB unique on `event_id` / `paycore:{order_id}` |

## Problem table

| Masalah | Kemungkinan penyebab | Cara cek | Solusi |
|---------|----------------------|----------|--------|
| 401 create order | Signature salah | Log canonical: `ts.METHOD.path.bodySha256` | Samakan `PAYCORE_APP_SECRET`; path harus `/v1/orders` |
| 401 create order | Timestamp skew | Jam server UTC | Sync NTP; timestamp ISO dalam ±5 menit |
| 401 create order | Wrong key id | Header `X-PayCore-Key-Id` | Samakan dengan PayCore `resolveAppSecret` |
| 403 app inactive | App `status` bukan `active` | D1: `SELECT app_id, status FROM apps` | Set `active` atau seed app |
| 400 validation | Body tidak sesuai schema | Response `validation_error` | Lihat `src/schemas/order.ts` |
| 409 idempotency | Key dipakai ulang beda body | Idempotency-Key sama | Key baru per intent; atau body identik untuk retry |
| 409 external_order_id | Duplikat di app yang sama | D1 `payment_orders` | Gunakan id unik per checkout |
| 502 / no checkout_url | Duitku create gagal | Worker logs `duitku_create_failed` | Cek `DUITKU_*` secrets, merchant sandbox |
| Callback tidak masuk | URL Duitku salah | Dashboard Duitku | `https://pay-staging.appvibe.biz.id/webhooks/duitku` |
| Order tetap pending | Callback belum / gagal signature | D1 `payment_events` | Cek POP HMAC signature, amount string, merchant code, dan API key |
| Paid, kredit tidak naik | Webhook app down / 5xx | D1 `fulfillment_deliveries` status failed | Fix endpoint; PayCore akan retry |
| Paid, kredit tidak naik | Webhook secret beda | Signature verify gagal di app | Sinkron AppVibe `PAYCORE_WEBHOOK_SECRET` dengan PayCore `VAULT_WEBHOOK_SECRET` |
| Kredit naik 2x | Idempotency app lemah | Ledger tanpa unique `event_id` | Unique constraint + `paycore:{order_id}` |
| Event signature invalid | Body di-parse lalu di-stringify ulang | Bandingkan raw body | Hash raw bytes/string as received |
| Return URL 403 | `return_url` tidak di allowlist | D1 `apps.allowed_return_urls` | Tambah URL staging/production |
| GET order 404 | Wrong `order_id` atau app lain | `order_id` + `X-PayCore-App` | Order milik app yang sama |

## PayCore operator (D1)

Staging:

```bash
npx wrangler d1 execute paycore-staging --remote --env staging --command "SELECT order_id, payment_status, fulfillment_status FROM payment_orders ORDER BY created_at DESC LIMIT 5"
```

```bash
npx wrangler d1 execute paycore-staging --remote --env staging --command "SELECT event_id, delivery_status, attempt_number, next_retry_at FROM fulfillment_deliveries ORDER BY created_at DESC LIMIT 5"
```

## Worker logs

```bash
npx wrangler tail appvibe-paycore-staging --env staging
```

Look for: `fulfillment_enqueued`, `fulfillment_claim_skipped`, `duitku_create_failed`, `webhook.*` audit actions.

## AppVibe Vault secret mapping

For `appvibe.biz.id`, PayCore signs fulfillment events with `VAULT_WEBHOOK_SECRET`.
The AppVibe Pages project verifies the same bytes with `PAYCORE_WEBHOOK_SECRET`.
Those two values must be identical in the active Cloudflare environments; otherwise PayCore will show `paid` with fulfillment `failed`, and AppVibe D1 will stay `pending`.

## Escalation

- **Duitku** — merchant dashboard, sandbox credentials.
- **PayCore** — fulfillment stuck in `manual_review` / `dead_letter`.
- **Consumer app** — credit ledger, webhook handler idempotency.
