# Setup Duitku Sandbox — PayCore Staging

Langkah ini **tidak** memasukkan API key ke Git. Semua credential hanya di Cloudflare Worker secrets dan file lokal `.staging.vars` (gitignored).

## 1. Prasyarat PayCore

| Cek | URL / perintah |
|-----|----------------|
| Health | `GET https://pay-staging.appvibe.biz.id/health` → `status: ok` |
| Worker | `appvibe-paycore-staging` |
| D1 | `paycore-staging` |

## 2. Data dari dashboard Duitku Sandbox

Login: [Duitku sandbox / merchant panel](https://sandbox.duitku.com) (akun merchant sandbox Anda).

Catat (jangan paste di chat publik):

- **Merchant Code** (contoh format: `DS32111`)
- **API Key** (sandbox)

## 3. Callback URL di dashboard Duitku (wajib)

Set **satu** URL callback server ke PayCore:

```text
https://pay-staging.appvibe.biz.id/webhooks/duitku
```

- Bukan URL Narraza / aplikasi lain.
- Bukan `localhost`.
- Path harus persis `/webhooks/duitku`.

PayCore mengirim `callbackUrl` yang sama saat create payment; dashboard Duitku harus mengizinkan domain ini.

## 4. File lokal secrets (di PC Anda)

```bash
cd "D:/Coding/paycore"
copy .staging.vars.example .staging.vars
```

Isi `.staging.vars` (contoh field, **tanpa** nilai asli di repo):

```text
DUITKU_BASE_URL=https://api-sandbox.duitku.com
DUITKU_MERCHANT_CODE=<dari dashboard>
DUITKU_API_KEY=<dari dashboard>
DUITKU_CALLBACK_SECRET=

PAYCORE_PUBLIC_BASE_URL=https://pay-staging.appvibe.biz.id
PAYCORE_INTERNAL_MASTER_KEY=<random 32+ chars>
PAYCORE_ENCRYPTION_KEY=<random 32+ chars>

NARRAZA_APP_KEY_ID=pk_staging_narraza_01
NARRAZA_APP_SECRET=<samakan dengan Narraza staging>
NARRAZA_WEBHOOK_SECRET=<samakan dengan Narraza staging>
```

`DUITKU_CALLBACK_SECRET` boleh kosong. Verifikasi callback memakai `DUITKU_API_KEY`; POP callback memakai HMAC SHA256, dan MD5 lama hanya diterima sebagai fallback kompatibilitas.

## 5. Upload secrets ke Cloudflare

```bash
npm run secrets:push:staging
npm run deploy:staging
```

Script `secrets:push:staging` mengabaikan baris `ENVIRONMENT=` (environment dari `wrangler.toml`).

## 6. Sinkron merchant code ke D1 (opsional, audit)

```bash
# Set DUITKU_MERCHANT_CODE di environment shell atau dari .staging.vars
npm run duitku:sync-merchant:staging
```

Verifikasi callback memakai **secret Worker** `DUITKU_MERCHANT_CODE`, bukan nilai `DUMMY_MERCHANT` di seed lama.

## 7. Migrasi D1 (jika belum)

```bash
npm run db:migrate:staging
```

## 8. Uji alur (setelah Narraza / app terhubung)

1. `POST https://pay-staging.appvibe.biz.id/v1/orders` (signed).
2. Response berisi `checkout_url` → buka di browser.
3. Bayar sandbox.
4. Duitku memanggil `POST /webhooks/duitku`.
5. Cek D1: `payment_orders.payment_status = paid`.
6. Cek `fulfillment_deliveries` → event ke webhook Narraza.

Perintah debug:

```bash
npx wrangler tail appvibe-paycore-staging --env staging
```

## 9. Troubleshooting singkat

| Gejala | Penyebab umum | Solusi |
|--------|---------------|--------|
| `create_failed` / 502 order | API key / merchant code salah | Cek secrets + sandbox |
| Callback tidak masuk | URL salah di dashboard Duitku | Set URL §3 |
| `invalid_signature` | API key tidak sama dengan yang dipakai Duitku | Rotate/sync key |
| Paid tapi tidak fulfill | Webhook app gagal | Cek Narraza endpoint + secret |

Detail: `docs/external/troubleshooting.md`, `docs/internal/duitku-integration.md`.

## 10. Production

**Jangan** pakai credential sandbox di production. Production memakai `DUITKU_BASE_URL=https://api-prod.duitku.com` + callback `https://pay.appvibe.biz.id/webhooks/duitku` — setup terpisah setelah E2E staging lulus.
