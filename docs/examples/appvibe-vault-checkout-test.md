# Uji Duitku via checkout appvibe.web.id (tanpa Narraza)

## Ringkasan

| Proyek | Path |
|--------|------|
| PayCore | `D:/Coding/payment gateway` |
| Landing + checkout | `D:/Coding/appvibe.web.id` |

PayCore app: **`appvibe_vault`** · prefix order **`VLT-...`**

## 1. PayCore

1. Migration `0004_app_appvibe_vault.sql` (staging):
   ```bash
   cd "D:/Coding/payment gateway"
   npm run db:migrate:staging
   ```
2. Di `.staging.vars` tambahkan (generate secret acak, **sama** di Pages):
   ```text
   VAULT_APP_KEY_ID=pk_staging_vault_01
   VAULT_APP_SECRET=<random>
   VAULT_WEBHOOK_SECRET=<random>
   ```
3. `npm run secrets:push:staging` && `npm run deploy:staging`
4. Duitku callback: `https://pay-staging.appvibe.biz.id/webhooks/duitku`

## 2. Cloudflare Pages (appvibe.web.id)

Environment variables (lihat `D:/Coding/appvibe.web.id/.env.example`):

- `PAYCORE_APP_SECRET` = sama dengan `VAULT_APP_SECRET` Worker
- `PAYCORE_WEBHOOK_SECRET` = sama dengan `VAULT_WEBHOOK_SECRET` Worker
- `PAYCORE_KEY_ID` = `pk_staging_vault_01`

Webhook PayCore → `https://appvibe.web.id/api/webhooks/paycore` (harus HTTPS live; preview URL juga bisa untuk tes terbatas).

## 3. Alur uji

1. Buka `https://appvibe.web.id/checkout/` (atau lokal: `wrangler pages dev` + `/checkout/`)
2. Isi form → redirect ke Duitku sandbox
3. Bayar
4. Cek D1: `payment_orders` dengan `order_id` prefix `VLT-`
5. Cek `fulfillment_deliveries` → POST ke webhook vault
6. Return user: `/payment/return?order_id=VLT-...`

## 4. Lokal

```bash
cd "D:/Coding/appvibe.web.id"
npx wrangler pages dev dist --compatibility-date=2026-06-01
```

Butuh `.dev.vars` dengan `PAYCORE_*` (copy pola dari `.env.example`). Vite `npm run dev` **tidak** menjalankan `/api/*` — gunakan wrangler pages dev setelah `npm run build`.

## 5. Dokumen terkait

- `D:/Coding/payment gateway/docs/duitku-sandbox-setup.md`
- `D:/Coding/payment gateway/prompt.md` §4 (path absolut)