# Duitku setup — status report

## Sudah dikerjakan (kode & docs)

| Item | Detail |
|------|--------|
| Callback verify | Memakai `DUITKU_MERCHANT_CODE` + `DUITKU_API_KEY` dari Worker (sama dengan create payment), bukan `DUMMY_MERCHANT` di D1 |
| Merchant mismatch | Jika `merchantCode` di body callback ≠ secret → `401 invalid_signature` |
| Docs operator | `D:/Coding/paycore/docs/internal/duitku-sandbox-setup.md` |
| Secrets push | `npm run secrets:push:staging` — skip baris `ENVIRONMENT=` |
| Sync D1 audit | `npm run duitku:sync-merchant:staging` — update `merchant_profiles.merchant_code` dari `.staging.vars` |
| Migration | `migrations/0003_duitku_merchant_code_note.sql` |
| Tests | `tests/duitku-callback-signature.test.ts` (40 tests total) |
| Staging health | `https://pay-staging.appvibe.biz.id/health` OK |

## Yang harus Anda lakukan (non-coding)

### 1. Dashboard Duitku Sandbox

Set **Callback URL**:

```text
https://pay-staging.appvibe.biz.id/webhooks/duitku
```

### 2. File `.staging.vars`

```bash
cd "D:/Coding/payment gateway"
copy .staging.vars.example .staging.vars
```

Isi `DUITKU_MERCHANT_CODE` dan `DUITKU_API_KEY` dari dashboard sandbox.

### 3. Upload & deploy

```bash
npm run secrets:push:staging
npm run deploy:staging
npm run duitku:sync-merchant:staging
npm run db:migrate:staging
```

### 4. Narraza

Samakan `NARRAZA_APP_SECRET` / `NARRAZA_WEBHOOK_SECRET` dengan backend Narraza staging.

### 5. Uji bayar sandbox

Satu transaksi test → cek order `paid` di D1 → satu kredit di Narraza.

## Belum dilakukan (sesuai rencana)

- Duitku **production** / live payment
- **Inquiry reconciliation** cron (transaction status API)
- E2E live (butuh langkah §2–5 di atas)

## Referensi

- `docs/internal/duitku-integration.md`
- `docs/internal/duitku-sandbox-setup.md`
- `docs/internal/staging-e2e-checklist.md`
