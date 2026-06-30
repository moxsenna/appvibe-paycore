# Checkout Vault — status implementasi

**Tanggal:** 2026-06-23  
**Tujuan user:** Uji Duitku via form checkout **appvibe.web.id**, bukan Narraza.

## Selesai (kode)

| Area | Status |
|------|--------|
| PayCore app `appvibe_vault` + migration 0004 (staging applied) | ✅ |
| `VAULT_*` secrets di Worker env schema | ✅ |
| `D:/Coding/appvibe.web.id/checkout/` | ✅ |
| `POST /api/checkout/create-order` | ✅ |
| `POST /api/webhooks/paycore` | ✅ |
| `/payment/return` | ✅ |
| `npm run build` (appvibe.web.id) | ✅ |
| Docs `docs/internal/examples/appvibe-vault-checkout-test.md` | ✅ |
| PayCore tests 42/42 | ✅ |

## Menunggu Anda (operasional)

1. Duitku callback → `https://pay-staging.appvibe.biz.id/webhooks/duitku`
2. `.staging.vars` → `VAULT_*` + Duitku + push secrets + `deploy:staging`
3. Cloudflare Pages env `PAYCORE_*` (lihat `appvibe.web.id/.env.example`)
4. Deploy Pages setelah env diisi
5. Satu transaksi sandbox dari `/checkout/`

## URL uji

- Checkout: `https://appvibe.web.id/checkout/`
- Return: `https://appvibe.web.id/payment/return`
