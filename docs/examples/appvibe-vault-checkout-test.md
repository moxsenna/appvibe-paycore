# Uji Duitku via checkout appvibe.biz.id (tanpa Narraza)

## Ringkasan

| Proyek | Path |
|--------|------|
| PayCore | `D:/Coding/paycore` |
| Landing + checkout | `D:/Coding/appvibe.biz.id` |

PayCore app: **`appvibe_vault`**; prefix order **`VLT-...`**.

## 1. PayCore

1. Migration `0004_app_appvibe_vault.sql` (staging):
   ```bash
   cd "D:/Coding/paycore"
   npm run db:migrate:staging
   ```
2. Di `.staging.vars` tambahkan. Nilai webhook harus sama dengan Pages:
   ```text
   VAULT_APP_KEY_ID=pk_staging_vault_01
   VAULT_APP_SECRET=<random>
   VAULT_WEBHOOK_SECRET=<same value as AppVibe PAYCORE_WEBHOOK_SECRET>
   ```
3. Jalankan `npm run secrets:push:staging` lalu `npm run deploy:staging`.
4. Duitku callback: `https://pay-staging.appvibe.biz.id/webhooks/duitku`.

## 2. Cloudflare Pages appvibe.biz.id

Environment variables ada di `D:/Coding/appvibe.biz.id/.env.example`:

- `PAYCORE_APP_SECRET` = sama dengan `VAULT_APP_SECRET` Worker.
- `PAYCORE_WEBHOOK_SECRET` = sama dengan `VAULT_WEBHOOK_SECRET` Worker.
- `PAYCORE_KEY_ID` = `VAULT_APP_KEY_ID`.

Wajib: nilai `PAYCORE_KEY_ID` di Pages harus sama persis dengan `VAULT_APP_KEY_ID` di Worker. PayCore memakai perbandingan ketat (`===`).

Webhook PayCore -> `https://appvibe.biz.id/api/webhooks/paycore`.

## 3. Alur uji

1. Buka `https://appvibe.biz.id/checkout/` atau lokal via `wrangler pages dev` setelah build.
2. Isi form -> redirect ke Duitku sandbox.
3. Bayar.
4. Cek PayCore D1 `payment_orders` dengan `order_id` prefix `VLT-`.
5. Cek `fulfillment_deliveries` -> POST ke webhook AppVibe.
6. Return user: `/checkout/?order_id=VLT-...`.
7. AppVibe D1 `orders` harus `paid/delivered`, entitlement aktif, lalu halaman checkout redirect ke `/access/?from=payment`.

## 4. Lokal

```bash
cd "D:/Coding/appvibe.biz.id"
npm run build
npx wrangler pages dev dist --compatibility-date=2026-06-01
```

Butuh `.dev.vars` dengan `PAYCORE_*`. Vite `npm run dev` tidak menjalankan `/api/*`; gunakan `wrangler pages dev` setelah `npm run build`.

## 5. Dokumen terkait

- `D:/Coding/paycore/docs/duitku-sandbox-setup.md`
- `D:/Coding/paycore/prompt.md`
