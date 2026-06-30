# Staging E2E checklist — PayCore

**PayCore staging:** `https://pay-staging.appvibe.biz.id`  
**Health:** `GET /health` → `"status":"ok"`, `"environment":"staging"`  
**Duitku callback (dashboard):** `https://pay-staging.appvibe.biz.id/webhooks/duitku`

---

## Untuk owner / non-coding

| # | Langkah | Selesai? |
|---|---------|----------|
| 1 | Buka `https://pay-staging.appvibe.biz.id/health` — harus OK | ☐ |
| 2 | Pastikan di **Duitku sandbox** callback URL sudah `/webhooks/duitku` di domain staging | ☐ |
| 3 | Jangan share API key Duitku di chat/email; rotate jika bocor | ☐ |
| 4 | Login **aplikasi staging** (mis. Narraza staging) | ☐ |
| 5 | Beli **paket test** termurah / sandbox | ☐ |
| 6 | Catat: apakah redirect ke Duitku sandbox berhasil? | ☐ |
| 7 | Selesaikan bayar sandbox | ☐ |
| 8 | Cek apakah kredit/akses naik **sekali** | ☐ |
| 9 | Screenshot status + laporkan ke dev jika gagal | ☐ |

**Yang tidak membuktikan bayar:** halaman “terima kasih”, URL dengan `?order_id=`, notifikasi email saja.

**Yang membuktikan bayar:** event PayCore diproses backend (kredit/ledger naik).

---

## Untuk developer / agen coding

### Preflight infra

- [ ] D1 `paycore-staging` migrated (`0001`, `0002`)
- [ ] Queues `paycore-fulfillment-staging`, `paycore-dlq-staging`
- [ ] Worker secrets set; **no** `SUPABASE_*`
- [ ] Consumer app `PAYCORE_*` secrets match PayCore key/webhook mapping

### Create order

- [ ] `POST /v1/orders` signed — response `checkout_url`, `order_id` prefix `NAR-` (Narraza)
- [ ] Idempotency: same key + body → 200 replay

### Payment path

- [ ] Sandbox payment completes
- [ ] D1: `payment_orders.payment_status = paid`
- [ ] D1: `payment_events` row inserted
- [ ] D1: `fulfillment_deliveries` row `queued` → `delivered` (if app 200)

### Narraza / consumer app

- [ ] Webhook receives `payment.succeeded`
- [ ] Signature verifies with `PAYCORE_WEBHOOK_SECRET`
- [ ] Ledger `paycore:{order_id}` once

### Duplicate Duitku callback

- [ ] Second callback → no second delivery / no second credit

### Failed webhook + retry

- [ ] App returns 500 once → `fulfillment_deliveries` = `failed`, `next_retry_at` set
- [ ] Queue message **acked** (no infinite CF retry on same message)
- [ ] Retry uses **same** `event_id` / delivery id

### Invalid Duitku signature

- [ ] Order payment_status unchanged; event rejected

### Commands

```bash
npx wrangler tail appvibe-paycore-staging --env staging
npx wrangler d1 execute paycore-staging --remote --env staging --command "SELECT order_id, payment_status, fulfillment_status FROM payment_orders ORDER BY created_at DESC LIMIT 3"
```

### Docs

- Integration: `docs/external/integration-guide.md`
- Narraza: `docs/external/examples/narraza-integration.md`
- Issues: `docs/external/troubleshooting.md`

---

## Production

**Do not** run production E2E until staging checklist above is signed off.
